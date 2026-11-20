const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { compile } = require("json-schema-to-typescript");
const Ajv = require("ajv");
const standalone = require("ajv/dist/standalone").default;
const repository = path.resolve(__dirname, "..");
const ts = require("typescript");
const prettier = require("prettier");
const unicodeLength = require("ajv/dist/runtime/ucs2length").default;
unicodeLength.code = ts
  .transpileModule(`(${unicodeLength.toString()})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: true },
  })
  .outputText.trim()
  .replace(/;$/, "");

function writeFiles(mode, directory, files) {
  if (mode === "--write") fs.mkdirSync(directory, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(directory, name);
    if (mode === "--write") fs.writeFileSync(file, data);
    else if (fs.readFileSync(file, "utf8") !== data)
      throw Error(`Contract drift: ${name}`);
  }
}

function exportJson(flag) {
  return JSON.parse(
    execFileSync(
      "cargo",
      [
        "run",
        "--release",
        "--quiet",
        "--locked",
        "-p",
        "voyager-contract",
        "--bin",
        "export",
        ...(flag ? ["--", flag] : []),
      ],
      {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    ),
  );
}

function assertCatalogued(source, operations) {
  const imports = [
    ...source.matchAll(/import \{([^}]*)\} from "(voyager_[a-z_]+)";/g),
  ];
  for (const [, names, module] of imports) {
    const entries = operations.find((item) => item.name === module)?.entries;
    if (!entries) throw Error(`Operation catalogue lacks module ${module}`);
    for (const name of names.split(",").map((item) => item.trim())) {
      if (!entries.some((entry) => entry.name === name))
        throw Error(`Operation catalogue lacks ${module}.${name}`);
    }
  }
}

async function generate(mode, avatar) {
  const schemas = exportJson(avatar ? "--avatar" : null);
  const files = {};
  for (const [name, schema] of Object.entries(schemas)) {
    files[`${name}.schema.json`] = JSON.stringify(schema, null, 2) + "\n";
    files[`${name}.d.ts`] = await compile(schema, schema.title, {
      bannerComment: "",
      unknownAny: true,
    });
  }
  if (avatar) {
    writeFiles(mode, path.join(__dirname, "generated", "avatar"), files);
    return;
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
  files["validate.d.ts"] =
    Object.entries(schemas)
      .map(
        ([name, schema]) =>
          `export function ${name}(data: unknown): data is import("./${name}").${schema.title};`,
      )
      .join("\n") + "\n";
  const operations = exportJson("--operations");
  files["operations.json"] = JSON.stringify(operations, null, 2) + "\n";
  files["package.json"] = '{"type":"module"}\n';
  files["workspace.ts"] =
    `import { call, request_id, terminal_open } from "voyager_workspace";
import { request as validateRequest, response as validateResponse, terminalRequest as validateTerminalRequest, terminalResponse as validateTerminalResponse } from "./validate.js";
import type { Request } from "./request";
import type { Reply } from "./response";
import type { TerminalRequest } from "./terminalRequest";
import type { TerminalResponse } from "./terminalResponse";
export async function invoke(action: Request["action"], expectedVersion: Request["expectedVersion"]): Promise<Reply> {
  const request: Request = { requestId: request_id(), expectedVersion, action };
  if (!validateRequest(request)) throw Error("Invalid workspace request");
  const response: unknown = JSON.parse(await call(JSON.stringify(request)));
  if (!validateResponse(response) || response.requestId !== request.requestId)
    throw Error("Invalid workspace response");
  return response;
}
export async function openTerminal(vesselId: string, expectedVersion: string): Promise<TerminalResponse> {
  const request: TerminalRequest = { requestId: request_id(), vesselId, expectedVersion };
  if (!validateTerminalRequest(request)) throw Error("Invalid terminal request");
  const response: unknown = JSON.parse(await terminal_open(JSON.stringify(request)));
  if (!validateTerminalResponse(response) || response.requestId !== request.requestId || response.vesselId !== vesselId)
    throw Error("Terminal result unconfirmed; do not repeat the request");
  return response;
}
`;
  files["workspace.js"] = await prettier.format(
    ts.transpileModule(files["workspace.ts"], {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        removeComments: true,
      },
    }).outputText,
    { parser: "babel" },
  );
  assertCatalogued(files["workspace.ts"], operations);
  files["workspace.d.ts"] =
    'import type { Request } from "./request";\nimport type { Reply } from "./response";\nimport type { TerminalResponse } from "./terminalResponse";\nexport function invoke(action: Request["action"], expectedVersion: Request["expectedVersion"]): Promise<Reply>;\nexport function openTerminal(vesselId: string, expectedVersion: string): Promise<TerminalResponse>;\n';
  files["conversation.ts"] =
    `import { call, request_id, snapshot } from "voyager_conversation";
import { conversationRequest, conversationReply, conversationSnapshot } from "./validate.js";
import type { Request } from "./conversationRequest";
import type { Reply } from "./conversationReply";
import type { Snapshot } from "./conversationSnapshot";
export async function send(action: Request["action"]): Promise<Reply> {
  const request: Request = { requestId: request_id(), action };
  if (!conversationRequest(request)) throw Error("Invalid conversation request");
  const reply: unknown = JSON.parse(await call(JSON.stringify(request)));
  if (!conversationReply(reply) || reply.requestId !== request.requestId) throw Error("Invalid conversation reply");
  return reply;
}
export async function observe(after: string | null): Promise<Snapshot | null> {
  const value: unknown = JSON.parse(await snapshot(after));
  if (value !== null && !conversationSnapshot(value)) throw Error("Invalid conversation snapshot");
  return value;
}
`;
  assertCatalogued(files["conversation.ts"], operations);
  files["conversation.js"] = await prettier.format(
    ts.transpileModule(files["conversation.ts"], {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        removeComments: true,
      },
    }).outputText,
    { parser: "babel" },
  );
  writeFiles(mode, path.join(__dirname, "generated"), files);
}

async function main() {
  const mode = process.argv[2];
  if (!["--write", "--check"].includes(mode))
    throw Error("Expected --write or --check");
  await generate(mode, false);
  await generate(mode, true);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
