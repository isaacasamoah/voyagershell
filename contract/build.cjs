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
      {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
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
  files["validate.js"] = standalone(
    ajv,
    Object.fromEntries(Object.keys(schemas).map((name) => [name, name])),
  );
  files["package.json"] = '{"type":"module"}\n';
  files["workspace.js"] =
    `import { call, request_id, terminal_open } from "voyager_workspace";
import { request as validateRequest, response as validateResponse, terminalRequest as validateTerminalRequest, terminalResponse as validateTerminalResponse } from "./validate.js";
export async function invoke(action, expectedVersion) {
  const request = { requestId: request_id(), expectedVersion, action };
  if (!validateRequest(request)) throw Error("Invalid workspace request");
  const response = JSON.parse(await call(JSON.stringify(request)));
  if (!validateResponse(response) || response.requestId !== request.requestId)
    throw Error("Invalid workspace response");
  return response;
}
export async function openTerminal(contentId, expectedVersion) {
  const request = { requestId: request_id(), contentId, expectedVersion };
  if (!validateTerminalRequest(request)) throw Error("Invalid terminal request");
  const response = JSON.parse(await terminal_open(JSON.stringify(request)));
  if (!validateTerminalResponse(response) || response.requestId !== request.requestId || response.contentId !== contentId)
    throw Error("Terminal result unconfirmed; do not repeat the request");
  return response;
}
`;
  files["workspace.d.ts"] =
    'import type { Request } from "./request";\nimport type { Response } from "./response";\nimport type { TerminalResponse } from "./terminalResponse";\nexport function invoke(action: Request["action"], expectedVersion: Request["expectedVersion"]): Promise<Response>;\nexport function openTerminal(contentId: string, expectedVersion: string): Promise<TerminalResponse>;\n';
  const directory = path.join(__dirname, "generated");
  if (mode === "--write") fs.mkdirSync(directory, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(directory, name);
    if (mode === "--write") fs.writeFileSync(file, data);
    else if (fs.readFileSync(file, "utf8") !== data)
      throw Error(`Contract drift: ${name}`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
