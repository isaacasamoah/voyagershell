const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, after } = require("node:test");
const { compare, table } = require("./delta.cjs");

const DELTA = path.join(__dirname, "delta.cjs");
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("HC_") && key !== "NODE_PATH",
  ),
);

function side(revision, nodes, edges) {
  return {
    revision,
    observed: {
      provenance: { source: { commit: `${revision}0` } },
      nodes,
      edges,
    },
  };
}

const crateModule = (id) => ({ id, kind: "module" });
const edge = (kind, from, to) => ({
  id: `${kind}(${from},${to})`,
  kind,
  from,
  to,
});
const host = (name, functions) => ({
  id: `host-module:${name}`,
  kind: "host-module",
  name,
  functions,
});

const MODULES = [crateModule("rs:a"), crateModule("rs:b"), crateModule("rs:c")];

test("an added edge names a new user and a new dependency", () => {
  const result = compare(
    side("base", MODULES, [edge("uses", "rs:a", "rs:b")]),
    side("head", MODULES, [
      edge("uses", "rs:a", "rs:b"),
      edge("uses", "rs:c", "rs:b"),
    ]),
  );
  assert.deepEqual(result.edges.added, [
    { kind: "uses", from: "rs:c", to: "rs:b" },
  ]);
  assert.deepEqual(result.edges.removed, []);
  const users = result.modules.find(({ id }) => id === "rs:b").users;
  assert.deepEqual(users, { added: ["rs:c"], removed: [] });
  const dependencies = result.modules.find(
    ({ id }) => id === "rs:c",
  ).dependencies;
  assert.deepEqual(dependencies, { added: ["rs:b"], removed: [] });
  assert.equal(result.empty, false);
});

test("a removed edge names a lost user and a lost dependency", () => {
  const result = compare(
    side("base", MODULES, [
      edge("uses", "rs:a", "rs:b"),
      edge("uses", "rs:c", "rs:b"),
    ]),
    side("head", MODULES, [edge("uses", "rs:a", "rs:b")]),
  );
  assert.deepEqual(result.edges.removed, [
    { kind: "uses", from: "rs:c", to: "rs:b" },
  ]);
  assert.deepEqual(result.edges.added, []);
  const users = result.modules.find(({ id }) => id === "rs:b").users;
  assert.deepEqual(users, { added: [], removed: ["rs:c"] });
});

test("an added host function is listed under its module", () => {
  const result = compare(
    side("base", [host("voyager_workspace", ["open"])], []),
    side("head", [host("voyager_workspace", ["open", "stop_session"])], []),
  );
  assert.deepEqual(result.surface.hostFunctions.added, [
    { module: "voyager_workspace", function: "stop_session" },
  ]);
  assert.deepEqual(result.surface.hostFunctions.removed, []);
  assert.equal(result.empty, false);
});

test("a new host module lists every function it provides", () => {
  const result = compare(
    side("base", [], []),
    side("head", [host("voyager_new", ["b", "a"])], []),
  );
  assert.deepEqual(
    result.surface.hostFunctions.added.map(({ function: name }) => name),
    ["a", "b"],
  );
});

test("agent tools and offered operations are reported apart from other edges", () => {
  const tool = { id: "agent-tool:voyager_x", kind: "agent-tool" };
  const result = compare(
    side("base", MODULES, []),
    side(
      "head",
      [...MODULES, tool],
      [edge("offers", "rs:a", tool.id), edge("uses", "rs:a", "rs:b")],
    ),
  );
  assert.deepEqual(result.surface.agentTools.added, [tool.id]);
  assert.deepEqual(result.surface.offered.added, [
    { kind: "offers", from: "rs:a", to: tool.id },
  ]);
  assert.equal(result.edges.added.length, 2);
});

test("the same facts in any order give the same result", () => {
  const edges = [
    edge("uses", "rs:a", "rs:b"),
    edge("uses", "rs:c", "rs:b"),
    edge("uses", "rs:b", "rs:c"),
  ];
  const forward = compare(
    side("base", MODULES, []),
    side("head", MODULES, edges),
  );
  const backward = compare(
    side("base", [...MODULES].reverse(), []),
    side("head", [...MODULES].reverse(), [...edges].reverse()),
  );
  assert.deepEqual(backward, forward);
});

test("equal facts give an empty result", () => {
  const edges = [edge("uses", "rs:a", "rs:b")];
  const result = compare(
    side("base", MODULES, edges),
    side("head", MODULES, edges),
  );
  assert.equal(result.empty, true);
  assert.deepEqual(result.modules, []);
});

const temporary = [];
after(() => {
  for (const directory of temporary)
    fs.rmSync(directory, { recursive: true, force: true });
});

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

const library = (functions, uses) =>
  [
    "pub mod a;",
    "pub mod b;",
    "pub fn host() {",
    `    let _ = HostModule::new("demo_host")${functions.map((name) => `.function("${name}", noop)`).join("")};`,
    "}",
    ...uses,
    "",
  ].join("\n");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "delta-fixture-"));
  temporary.push(directory);
  git(directory, "init", "-q");
  fs.mkdirSync(path.join(directory, "demo/src"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "Cargo.toml"),
    '[workspace]\nmembers = ["demo"]\nresolver = "2"\n',
  );
  fs.writeFileSync(
    path.join(directory, "demo/Cargo.toml"),
    '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2021"\n',
  );
  fs.writeFileSync(path.join(directory, "demo/src/lib.rs"), "");
  execFileSync("cargo", ["generate-lockfile", "--offline"], {
    cwd: directory,
    stdio: "ignore",
    env: ENV,
  });
  const first = commit(
    directory,
    {
      "demo/src/lib.rs": library(["ping"], []),
      "demo/src/a.rs": "pub fn f() {}\n",
      "demo/src/b.rs": "use crate::a::f;\npub fn g() { f(); }\n",
    },
    "first",
  );
  const second = commit(
    directory,
    {
      "demo/src/lib.rs": library(["ping", "pong"], []),
      "demo/src/a.rs": "use crate::b::g;\npub fn f() { g(); }\n",
      "demo/src/b.rs": "pub fn g() {}\n",
    },
    "second",
  );
  const third = commit(directory, { "notes.txt": "prose\n" }, "third");
  return { directory, first, second, third };
}

const { directory, first, second, third } = fixture();

function run(...args) {
  const result = spawnSync("node", [DELTA, ...args], {
    encoding: "utf8",
    env: ENV,
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const between = (...args) =>
  run(first, second, "--repository", directory, ...args);

test("the command reports an added edge, a removed edge and an added host function", () => {
  const result = between("--format", "json");
  assert.equal(result.status, 0, result.err);
  const report = JSON.parse(result.out);
  assert.deepEqual(
    report.edges.added.map(({ from, to }) => `${from}>${to}`),
    ["rs:demo::a>rs:demo::b"],
  );
  assert.deepEqual(
    report.edges.removed.map(({ from, to }) => `${from}>${to}`),
    ["rs:demo::b>rs:demo::a"],
  );
  assert.deepEqual(report.surface.hostFunctions.added, [
    { module: "demo_host", function: "pong" },
  ]);
});

test("the table lists the same change in short lines", () => {
  const result = between("--format", "table");
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /\+ rs:demo::a -> rs:demo::b \(uses\)/);
  assert.match(result.out, /- rs:demo::b -> rs:demo::a \(uses\)/);
  assert.match(result.out, /\+ demo_host\.pong/);
  assert.doesNotMatch(result.out, /"schema"/);
});

test("the default output holds the table and the JSON", () => {
  const result = between();
  assert.equal(result.status, 0, result.err);
  const json = result.out.slice(result.out.indexOf("{"));
  assert.equal(JSON.parse(json).schema, "architecture-delta/v0");
  assert.match(result.out, /^architecture delta /);
});

test("two runs on one input print the same bytes", () => {
  assert.equal(between().out, between().out);
});

test("an empty range says so and exits cleanly", () => {
  const result = run(first, first, "--repository", directory);
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /no structural change/);
  assert.equal(
    JSON.parse(result.out.slice(result.out.indexOf("{"))).empty,
    true,
  );
});

test("the table leaves out the fan-in header when no module changed", () => {
  const result = compare(
    side("base", [host("voyager_workspace", ["open"])], []),
    side("head", [host("voyager_workspace", ["open", "stop_session"])], []),
  );
  const text = table(result);
  assert.match(text, /Host functions\n  \+ voyager_workspace\.stop_session/);
  assert.doesNotMatch(text, /Fan-in and fan-out/);
});

test("a commit that changes no module, edge or host function is empty", () => {
  const result = run(second, third, "--repository", directory);
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /no structural change/);
});

test("a missing or unknown input exits non-zero and names it without a stack", () => {
  const cases = [
    [[], /missing base revision/],
    [[first], /missing head revision/],
    [
      [first, "no-such-revision", "--repository", directory],
      /no-such-revision/,
    ],
    [["no-such-base", second, "--repository", directory], /no-such-base/],
    [[first, second, "--repository", path.join(directory, "absent")], /absent/],
    [[first, second, "--format", "xml"], /unknown format xml/],
    [[first, second, "--bogus"], /unknown option --bogus/],
  ];
  for (const [args, message] of cases) {
    const result = run(...args);
    assert.equal(result.status, 2, `${args} ${result.out}`);
    assert.match(result.err, /^architecture delta: /);
    assert.match(result.err, message);
    assert.match(
      result.err,
      /\nusage: delta\.cjs <base> <head> .*table\|json\|both\]\n$/,
    );
    assert.doesNotMatch(result.err, /\n\s+at /);
    assert.equal(result.out, "");
  }
});
