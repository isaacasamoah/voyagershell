const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { compile } = require("json-schema-to-typescript");
const Ajv = require("ajv");
const standalone = require("ajv/dist/standalone").default;

async function main() {
  const mode = process.argv[2];
  if (!["--write", "--check"].includes(mode))
    throw Error("Expected --write or --check");
  const schemas = JSON.parse(
    execFileSync(
      "cargo",
      [
        "run",
        "--quiet",
        "--locked",
        "-p",
        "voyager-contract",
        "--bin",
        "export",
      ],
      { cwd: __dirname, encoding: "utf8", maxBuffer: 1024 * 1024 },
    ),
  );
  const files = {};
  for (const [name, schema] of Object.entries(schemas)) {
    files[`${name}.schema.json`] = JSON.stringify(schema, null, 2) + "\n";
    files[`${name}.d.ts`] = await compile(schema, schema.title, {
      bannerComment: "",
      unknownAny: true,
    });
  }
  const ajv = new Ajv({
    strict: true,
    code: { source: true, esm: true, lines: true },
  });
  for (const [name, schema] of Object.entries(schemas))
    ajv.addSchema(schema, name);
  files["validate.js"] = standalone(ajv, {
    request: "request",
    response: "response",
    notes: "notes",
  });
  const directory = path.join(__dirname, "contract", "generated");
  if (mode === "--write") fs.mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(directory, name);
    if (mode === "--write") fs.writeFileSync(file, value);
    else if (fs.readFileSync(file, "utf8") !== value)
      throw Error(`Contract drift: ${name}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
