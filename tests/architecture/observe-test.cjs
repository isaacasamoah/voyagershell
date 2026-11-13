const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { observe } = require("./observe.cjs");
const { diff, walkthrough } = require("./history.cjs");
const { stringify, parse } = require("./yaml.cjs");
const { analyse, modules } = require("./rust.cjs");

const ROOT = path.resolve(__dirname, "../..");
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("HC_") && key !== "NODE_PATH",
  ),
);
const CONFIG = {
  repository: "https://example.invalid/demo",
  packageRoots: [],
  typescript: { tsconfig: "tsconfig.json", roots: ["content"] },
  generators: {},
  locationRoots: [],
  structLiterals: [],
  docs: [],
};
const FILES = {
  "Cargo.toml": '[workspace]\nmembers = ["demo"]\nresolver = "2"\n',
  "demo/Cargo.toml":
    '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2021"\n',
  "demo/src/lib.rs": [
    "pub mod child;",
    "pub fn run() {",
    '    let _ = std::process::Command::new("tool");',
    '    let _ = std::env::var("DEMO_HOME");',
    '    let _ = include_str!("../../docs/guide.md");',
    "}",
    "#[cfg(test)]",
    "mod tests {",
    '    fn probe() { let _ = std::process::Command::new("sleep"); }',
    "}",
    "",
  ].join("\n"),
  "demo/src/child.rs": "use crate::run;\npub fn go() { run(); }\n",
  "docs/guide.md": "# Guide\n",
  "tsconfig.json": '{"compilerOptions":{"module":"ES2022"}}\n',
  "content/a.ts": 'import { b } from "./b.js";\nexport const a = b;\n',
  "content/b.ts": "export const b = 1;\n",
};

function git(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    env: ENV,
  }).trim();
}

function commit(directory, files, message) {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), text);
  }
  git(directory, "add", "-A");
  git(
    directory,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "commit",
    "-q",
    "-m",
    message,
  );
  return git(directory, "rev-parse", "HEAD");
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "observe-fixture-"));
  git(directory, "init", "-q");
  fs.mkdirSync(path.join(directory, "demo"), { recursive: true });
  fs.writeFileSync(path.join(directory, "Cargo.toml"), FILES["Cargo.toml"]);
  fs.writeFileSync(
    path.join(directory, "demo/Cargo.toml"),
    FILES["demo/Cargo.toml"],
  );
  fs.mkdirSync(path.join(directory, "demo/src"), { recursive: true });
  fs.writeFileSync(path.join(directory, "demo/src/lib.rs"), "");
  execFileSync("cargo", ["generate-lockfile", "--offline"], {
    cwd: directory,
    stdio: "ignore",
    env: ENV,
  });
  const first = commit(directory, FILES, "feat: first");
  return { directory, first };
}

const base = fixture();
const head = git(ROOT, "rev-parse", "HEAD");
const real = observe(ROOT, head);

test("the same commit and rules give byte-identical YAML", () => {
  const again = observe(ROOT, head);
  assert.equal(stringify(again.observed), stringify(real.observed));
  assert.equal(stringify(again.specs), stringify(real.specs));
});

test("YAML survives a round trip through the strict reader", () => {
  assert.deepEqual(
    parse(stringify(real.observed)),
    JSON.parse(JSON.stringify(real.observed)),
  );
  assert.throws(() => parse("a: 1\n  b: 2\n"), /unexpected indentation/);
});

test("every evidence line matches the blob recorded in provenance", () => {
  const files = real.observed.provenance.files;
  const items = [
    ...real.observed.nodes,
    ...real.observed.edges,
    ...real.observed.unresolved,
  ].flatMap((item) => item.evidence ?? []);
  assert.ok(items.length > 500);
  const lines = new Map();
  for (const item of items) {
    assert.ok(files[item.path], `${item.path} has no recorded blob`);
    if (!lines.has(files[item.path]))
      lines.set(
        files[item.path],
        execFileSync("git", ["-C", ROOT, "cat-file", "-p", files[item.path]], {
          encoding: "utf8",
          maxBuffer: 1 << 28,
        }).split("\n"),
      );
    assert.equal(
      item.text,
      (lines.get(files[item.path])[item.line - 1] ?? "").trim(),
      `${item.path}:${item.line}`,
    );
  }
});

test("every trigger token is a fact, a test-only use or an unresolved item", () => {
  for (const [token, entry] of Object.entries(real.observed.coverage))
    assert.equal(
      entry.facts + entry.test + entry.unresolved,
      entry.total,
      token,
    );
  assert.ok(Object.keys(real.observed.coverage).length > 0);
});

test("the gate's facts cover sizes and the lock file", () => {
  assert.ok(Object.keys(real.sizes).length > 100);
  assert.match(real.lock, /\[\[package\]\]/);
});

test("a revision may be a commit or the tree of that commit", () => {
  const byTree = observe(
    base.directory,
    git(base.directory, "rev-parse", `${base.first}^{tree}`),
    CONFIG,
  );
  const byCommit = observe(base.directory, base.first, CONFIG);
  assert.deepEqual(byTree.observed.nodes, byCommit.observed.nodes);
  assert.deepEqual(byTree.observed.edges, byCommit.observed.edges);
});

test("boundaries in a small repository are extracted", () => {
  const { observed } = observe(base.directory, base.first, CONFIG);
  const edges = new Set(observed.edges.map((edge) => edge.id));
  for (const id of [
    "spawns(rs:demo,program:tool)",
    "reads_env(rs:demo,env:DEMO_HOME)",
    "embeds(rs:demo,files:docs)",
    "uses(rs:demo::child,rs:demo)",
    "imports(ts:content/a.ts,ts:content/b.ts)",
  ])
    assert.ok(edges.has(id), `${id} in\n${[...edges].join("\n")}`);
  assert.ok(
    !observed.edges.some((edge) => edge.to === "program:sleep"),
    "test-only spawns stay out",
  );
  assert.equal(observed.coverage["Command::new("].test, 1);
  assert.deepEqual(observed.unresolved, []);
});

test("test-only and path-attributed modules are classified", () => {
  const found = modules(
    analyse(
      '#[cfg(test)]\nmod tests;\n#[cfg(feature = "x")]\n#[path = "../e/p.rs"]\nmod probe;\nmod live { mod inner; }\n',
    ),
  );
  assert.deepEqual(
    found.map((item) => [item.name, item.test, item.path, item.inline]),
    [
      ["tests", true, null, false],
      ["probe", false, "../e/p.rs", false],
      ["live", false, null, true],
      ["inner", false, null, false],
    ],
  );
  assert.deepEqual(found[1].conditions, ['cfg(feature = "x")']);
});

test("an architecture diff names what a later commit added", () => {
  const second = commit(
    base.directory,
    {
      "demo/src/lib.rs": FILES["demo/src/lib.rs"].replace(
        "pub mod child;",
        "pub mod child;\npub mod extra;",
      ),
      "demo/src/extra.rs": "pub fn more() {}\n",
    },
    "feat: second",
  );
  const before = observe(base.directory, base.first, CONFIG).observed;
  const after = observe(base.directory, second, CONFIG).observed;
  const change = diff(before, after);
  assert.deepEqual(change.nodes.added, ["rs:demo::extra"]);
  assert.deepEqual(diff(after, after), {
    nodes: { added: [], removed: [], changed: [] },
    edges: { added: [], removed: [], changed: [] },
  });
  const steps = walkthrough(change, before, after).flatMap(
    (section) => section.steps,
  );
  assert.ok(
    steps.some(
      (step) =>
        step.text === "`demo::extra` appears." &&
        step.evidence.path === "demo/src/lib.rs",
    ),
  );
});

function hidden(directory, revision) {
  const tool = fs.mkdtempSync(path.join(os.tmpdir(), "observe-tool-"));
  for (const name of fs.readdirSync(__dirname))
    if (/\.(cjs|json)$/.test(name))
      fs.copyFileSync(path.join(__dirname, name), path.join(tool, name));
  return spawnSync(
    "node",
    [
      "-e",
      `const { observe } = require(${JSON.stringify(path.join(tool, "observe.cjs"))});
const { observed } = observe(${JSON.stringify(directory)}, ${JSON.stringify(revision)}, ${JSON.stringify(CONFIG)});
console.log(observed.edges.filter((edge) => edge.kind === "imports").length);`,
    ],
    { cwd: tool, encoding: "utf8", env: ENV },
  );
}

test("script imports are read when TypeScript is installed", () => {
  const { observed } = observe(base.directory, base.first, CONFIG);
  assert.equal(
    observed.edges.filter((edge) => edge.kind === "imports").length,
    1,
  );
});

test("hiding TypeScript fails the extraction instead of skipping script imports", () => {
  const result = hidden(base.directory, base.first);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /Cannot find module 'typescript'/);
});
