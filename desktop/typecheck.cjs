const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const prettier = require("prettier");

const root = path.join(__dirname, "..");
const directory = path.join(root, "target/script-types");
const entries = [
  "content/ui.ts",
  "desktop/canvas/main.ts",
  "desktop/canvas/regions.ts",
  "desktop/canvas/creation.ts",
  "desktop/canvas/activity.ts",
  "desktop/canvas/agents.ts",
  "desktop/canvas/voyage-colours.ts",
  "desktop/canvas/process-icons.ts",
  "desktop/canvas/worktrees.ts",
  "desktop/canvas/voyage-close.ts",
  "desktop/canvas/stop-session.ts",
  "desktop/canvas/status.ts",
  "desktop/canvas/processes.ts",
  "desktop/canvas/menu.ts",
  "desktop/canvas/panels.ts",
  "desktop/canvas/terminal-open.ts",
  "desktop/canvas/panel-view.ts",
  "desktop/canvas/navigation-view.ts",
  "contract/generated/workspace.ts",
  "contract/generated/conversation.ts",
  "desktop/canvas/chat.ts",
];

const notesEntries = ["content/notes/main.ts", "content/ui.ts"];

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
  const occluding =
    'export type OccludingElement = Omit<NativeElement, "disabled" | "selected" | "on_click" | "role" | "transition"> & {';
  if (raw.includes("export type OccludingElement")) {
    if (raw.split(occluding).length !== 2)
      throw Error(
        "Pinned Occluding declaration changed; review the type adapter",
      );
    raw = raw.replace(
      occluding,
      occluding.replace('"disabled"', '"id" | "disabled"') +
        "\n    id(unavailable: never): never;",
    );
  }
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
    source: [
      ...[...modules]
        .filter(([name]) => included.has(name))
        .map(([, source]) => source),
      ...parsed.statements
        .filter(
          (node) =>
            ((ts.isTypeAliasDeclaration(node) ||
              ts.isInterfaceDeclaration(node)) &&
              ["GpuiShellWindow", "Window"].includes(node.name.text)) ||
            (ts.isVariableStatement(node) &&
              node.declarationList.declarations.some(
                (item) =>
                  ts.isIdentifier(item.name) && item.name.text === "window",
              )),
        )
        .map((node) => node.getFullText(parsed)),
    ].join("\n"),
    modules: [...included].sort(),
  };
}

function compile(extra = [], scope = "canvas") {
  if (!["canvas", "notes"].includes(scope)) throw Error("Unknown script scope");
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

function innermost(node, start) {
  const child = ts.forEachChild(node, (item) =>
    item.getStart() <= start && start < item.getEnd() ? item : undefined,
  );
  return child ? innermost(child, start) : node;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function operationOf(call) {
  const name = calleeName(call.expression);
  const first = call.arguments[0];
  if (name === "invoke" && first && ts.isObjectLiteralExpression(first)) {
    for (const property of first.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === "operation" &&
        ts.isStringLiteralLike(property.initializer)
      )
        return property.initializer.text;
    }
  }
  return name;
}

function operationAt(diagnostic) {
  if (!diagnostic.file || diagnostic.start === undefined) return null;
  let node = innermost(diagnostic.file, diagnostic.start);
  while (node.parent) {
    const parent = node.parent;
    if (ts.isCallExpression(parent) && parent.arguments.includes(node))
      return operationOf(parent);
    node = parent;
  }
  return null;
}

function describeDiagnostics(diagnostics) {
  const host = {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  };
  return diagnostics
    .map((diagnostic) => {
      const operation = operationAt(diagnostic);
      const text = ts.formatDiagnostics([diagnostic], host).trimEnd();
      return operation ? `${operation}: ${text}` : text;
    })
    .join("\n");
}

async function check(mode) {
  if (!["--write", "--check"].includes(mode))
    throw Error("Expected --write or --check");
  fs.mkdirSync(directory, { recursive: true });
  const metadata = {};
  for (const scope of ["canvas", "notes"]) {
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
    if (diagnostics.length) throw Error(describeDiagnostics(diagnostics));
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
  for (const name of new Set([...entries, ...notesEntries])) {
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

module.exports = { compile, describeDiagnostics };
if (require.main === module)
  check(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
