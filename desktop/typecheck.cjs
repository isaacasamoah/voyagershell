const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const prettier = require("prettier");

const root = path.join(__dirname, "..");
const directory = path.join(root, "target/script-types");
const entries = [
  "desktop/mods/header/main.ts",
  "desktop/mods/header/canvas.ts",
  "desktop/mods/header/layout-panel.ts",
  "contract/generated/workspace.ts",
  "contract/generated/conversation.ts",
  "desktop/mods/header/home.ts",
  "desktop/mods/header/chat.ts",
];

const notesEntries = ["content/notes/main.ts"];

function imports(source) {
  const names = new Set();
  function visit(node) {
    const name =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
          ? node.argument.literal
          : null;
    if (name && ts.isStringLiteral(name) && !name.text.startsWith("."))
      names.add(name.text);
    ts.forEachChild(node, visit);
  }
  visit(ts.createSourceFile("source.ts", source, ts.ScriptTarget.ES2022, true));
  return names;
}

function selectDeclarations(raw, sources) {
  const invalid =
    'export interface ElementBounds extends import("gpui-kit").Point {';
  if (raw.split(invalid).length !== 2)
    throw Error(
      "Pinned ElementBounds declaration changed; review the type adapter",
    );
  raw = raw.replace(
    invalid,
    'export type ElementBounds = import("gpui-kit").Point & {',
  );
  const parsed = ts.createSourceFile(
    "runtime.d.ts",
    raw,
    ts.ScriptTarget.ES2022,
    true,
  );
  const modules = new Map();
  for (const node of parsed.statements) {
    if (!ts.isModuleDeclaration(node) || !ts.isStringLiteral(node.name))
      continue;
    const previous = modules.get(node.name.text) || "";
    modules.set(node.name.text, previous + node.getFullText(parsed));
  }
  const pending = sources.flatMap((name) => [
    ...imports(fs.readFileSync(path.join(root, name), "utf8")),
  ]);
  const included = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (included.has(name)) continue;
    const declaration = modules.get(name);
    if (!declaration) throw Error(`No generated declaration for ${name}`);
    included.add(name);
    pending.push(...imports(declaration));
  }
  return {
    source: [...modules]
      .filter(([name]) => included.has(name))
      .map(([, source]) => source)
      .join("\n"),
    modules: [...included].sort(),
  };
}

function compile(extra = [], scope = "header") {
  if (!["header", "notes"].includes(scope)) throw Error("Unknown script scope");
  const filename = path.join(__dirname, "tsconfig.json");
  const config = ts.readConfigFile(filename, ts.sys.readFile);
  if (config.error)
    throw Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    __dirname,
  );
  const program = ts.createProgram(
    scope === "notes"
      ? [
          ...notesEntries.map((name) => path.join(root, name)),
          path.join(directory, "notes.d.ts"),
          ...extra,
        ]
      : [...parsed.fileNames, ...extra],
    parsed.options,
  );
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length) return diagnostics;
  if (program.emit().emitSkipped) throw Error("TypeScript skipped emission");
  return [];
}

async function check(mode) {
  if (!["--write", "--check"].includes(mode))
    throw Error("Expected --write or --check");
  fs.mkdirSync(directory, { recursive: true });
  const metadata = {};
  for (const scope of ["header", "notes"]) {
    const notes = scope === "notes";
    const raw = execFileSync(
      "cargo",
      [
        "run",
        "--quiet",
        "--locked",
        "-p",
        "voyager-desktop",
        "--bin",
        "export-script-types",
        ...(notes ? ["--", "--notes"] : []),
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );
    fs.writeFileSync(
      path.join(directory, notes ? "notes-raw.d.ts" : "raw.d.ts"),
      raw,
    );
    const selected = selectDeclarations(raw, notes ? notesEntries : entries);
    fs.writeFileSync(
      path.join(directory, notes ? "notes.d.ts" : "gpui-kit.d.ts"),
      selected.source,
    );
    const diagnostics = compile([], scope);
    if (diagnostics.length)
      throw Error(
        ts.formatDiagnostics(diagnostics, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => root,
          getNewLine: () => "\n",
        }),
      );
    metadata[scope] = {
      rawSha256: crypto.createHash("sha256").update(raw).digest("hex"),
      modules: selected.modules,
    };
  }
  const files = [
    [
      "desktop/script-types.json",
      await prettier.format(JSON.stringify(metadata), { parser: "json" }),
    ],
  ];
  for (const name of [...entries, ...notesEntries]) {
    const filename = name.replace(/\.ts$/, ".js");
    const emitted = fs.readFileSync(
      path.join(directory, "emitted", filename),
      "utf8",
    );
    files.push([filename, await prettier.format(emitted, { parser: "babel" })]);
  }
  for (const [name, source] of files) {
    const filename = path.join(root, name);
    if (mode === "--write") fs.writeFileSync(filename, source);
    else if (fs.readFileSync(filename, "utf8") !== source)
      throw Error(`Script/type drift: ${name}`);
  }
}

module.exports = { compile };
if (require.main === module)
  check(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
