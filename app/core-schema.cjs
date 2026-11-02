const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
const raw = execFileSync("hc", ["schema", "--json"]);
const schema = JSON.parse(raw);
const digest = createHash("sha256")
  .update(JSON.stringify(canonical(schema)))
  .digest("hex");
if (
  digest !== "043843b5609ef31bf80c6a52b803c0738be6f7c125c5921b8c39e4a4e994aa28"
)
  throw Error("Core schema differs from the reviewed 0.1.16 schema");
const definitions = {};
const references = new Set();
function convert(value) {
  if (Array.isArray(value)) return value.map(convert);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "$ref" && item.startsWith("#/components/schemas/")) {
        const name = item.slice("#/components/schemas/".length);
        references.add(name);
        return [key, `#/definitions/${name}`];
      }
      return [key, convert(item)];
    }),
  );
}
for (const [method, name] of [
  ["terminal.run", "RunParams"],
  ["terminal.attach", "AttachParams"],
]) {
  const entry = schema.methods.find((item) => item.name === method);
  if (!entry) throw Error(`Core method missing: ${method}`);
  definitions[name] = convert({
    type: "object",
    properties: Object.fromEntries(
      entry.params.map((parameter) => [parameter.name, parameter.schema]),
    ),
    required: entry.params
      .filter((parameter) => parameter.required)
      .map((parameter) => parameter.name),
  });
  convert(entry.result.schema);
}
for (const name of references) {
  if (!schema.components.schemas[name])
    throw Error(`Core definition missing: ${name}`);
  definitions[name] = convert(schema.components.schemas[name]);
}
const output =
  JSON.stringify(
    {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "CoreMessages",
      type: "object",
      definitions,
      properties: {
        runParams: { $ref: "#/definitions/RunParams" },
        runResult: { $ref: "#/definitions/RunResult" },
        attachParams: { $ref: "#/definitions/AttachParams" },
        attachResult: { $ref: "#/definitions/AttachResult" },
      },
    },
    null,
    2,
  ) + "\n";
const file = join(__dirname, "core-schema.json");
if (process.argv[2] === "--write") writeFileSync(file, output);
else if (process.argv[2] === "--check") {
  if (readFileSync(file, "utf8") !== output) throw Error("Core schema drift");
} else throw Error("Expected --write or --check");
