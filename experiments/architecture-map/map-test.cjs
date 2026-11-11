const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { observe } = require("./observe.cjs");
const { compare, fingerprint } = require("./compare.cjs");
const { diff, walkthrough } = require("./history.cjs");
const { stringify, parse } = require("./yaml.cjs");
const { analyse, modules } = require("./rust.cjs");

const repository = path.resolve(__dirname, "../..");
const config = require("./config.json");
const BASE = "e6bd5b19ebdac674d6852f8414b1c9c248648e27";
const first = observe(repository, BASE, config);

const blobs = new Map();
function blobLine(blob, line) {
  if (!blobs.has(blob)) blobs.set(blob, execFileSync("git", ["-C", repository, "cat-file", "-p", blob], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n"));
  return (blobs.get(blob)[line - 1] ?? "").trim();
}

test("the same commit and rules give byte-identical YAML", () => {
  const second = observe(repository, BASE, config);
  assert.equal(stringify(second.observed), stringify(first.observed));
  assert.equal(stringify(second.specs), stringify(first.specs));
});

test("YAML survives a round trip through the strict reader", () => {
  assert.deepEqual(parse(stringify(first.observed)), JSON.parse(JSON.stringify(first.observed)));
  assert.throws(() => parse("a: 1\n  b: 2\n"), /unexpected indentation/);
});

test("every evidence line matches the blob recorded in provenance", () => {
  const files = first.observed.provenance.files;
  const items = [...first.observed.nodes, ...first.observed.edges, ...first.observed.unresolved].flatMap((item) => item.evidence ?? (item.evidence === undefined ? [] : [item.evidence]));
  assert.ok(items.length > 500);
  const cache = new Map();
  for (const item of items) {
    assert.ok(files[item.path], `${item.path} has no recorded blob`);
    const key = `${item.path}:${item.line}`;
    if (!cache.has(key)) cache.set(key, blobLine(files[item.path], item.line));
    assert.equal(item.text, cache.get(key), key);
  }
});

test("every trigger token is a fact, a test-only use or an unresolved item", () => {
  for (const [token, entry] of Object.entries(first.observed.coverage)) assert.equal(entry.facts + entry.test + entry.unresolved, entry.total, token);
  const unresolved = first.observed.unresolved.filter((item) => /^(Command|ComponentRegistry|HostModule|include|import_types|env|profile|ToolDefinition|execFileSync|import)/.test(item.kind)).length;
  const counted = Object.values(first.observed.coverage).reduce((sum, entry) => sum + entry.unresolved, 0);
  assert.equal(unresolved, counted);
});

test("known boundaries at the base commit are extracted", () => {
  const edges = new Set(first.observed.edges.map((edge) => edge.id));
  for (const id of [
    "depends_on(crate:voyager-desktop,crate:voyager-app)",
    "spawns(rs:voyager_app::core,program:hc)",
    "spawns(rs:voyager_desktop::platform,program:paplay)",
    "exposes(rs:voyager_desktop::host,host-module:voyager_workspace)",
    "includes(rs:voyager_app,source:experiments/performance/typing-latency/trace.rs)",
    "generated_from(rs:voyager_app::core_shapes,artifact:app/core-schema.json)",
    "imports(ts:desktop/mods/header/main.ts,ts:contract/generated/workspace.ts)",
    "runs(generator:contract/build.cjs,bin:export)",
  ])
    assert.ok(edges.has(id), id);
  const workspace = first.observed.nodes.find((node) => node.id === "host-module:voyager_workspace");
  assert.equal(workspace.functions.length, 12);
  assert.equal(workspace.declarations.generated, false);
  assert.ok(!first.observed.edges.some((edge) => edge.to === "program:sleep"), "test-only spawns stay out");
});

test("test-only and path-attributed modules are classified", () => {
  const found = modules(analyse('#[cfg(test)]\nmod tests;\n#[cfg(feature = "x")]\n#[path = "../e/p.rs"]\nmod probe;\nmod live { mod inner; }\n'));
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

test("an architecture diff names what a merged change added", () => {
  const before = observe(repository, "087f73e", config).observed;
  const after = observe(repository, "a6dfb79", config).observed;
  const change = diff(before, after);
  assert.deepEqual(change.nodes.added, ["rs:voyager_desktop::terminal::scroll"]);
  assert.deepEqual(diff(after, after), { nodes: { added: [], removed: [], changed: [] }, edges: { added: [], removed: [], changed: [] } });
  const steps = walkthrough(change, before, after).flatMap((section) => section.steps);
  assert.ok(steps.some((step) => step.text === "`voyager_desktop::terminal::scroll` appears." && step.evidence.path === "desktop/src/terminal.rs"));
});

test("rules report violations, and a changed source line makes a decision stale", () => {
  const read = (file, line) => blobLine(first.observed.provenance.files[file] ?? execFileSync("git", ["-C", repository, "rev-parse", `${BASE}:${file}`], { encoding: "utf8" }).trim(), line);
  const evidence = [{ path: "desktop/src/platform.rs", line: 450, text: read("desktop/src/platform.rs", 450) }];
  const intended = {
    sources: [],
    components: [{ id: "intended:desktop", binds: ["crate:voyager-desktop"] }, { id: "intended:app", binds: ["crate:voyager-app"] }],
    relations: [{ id: "calls(intended:desktop,intended:app)", from: "intended:desktop", to: "intended:app", kind: "calls" }],
    rules: [
      { id: "no-spawn", check: { type: "forbid_edge", from: ["rs:voyager_desktop*"], to: ["program:*"], kinds: ["spawns"] } },
      { id: "judged", check: { type: "judged", question: "?" } },
    ],
  };
  const decide = (print) => compare(first.observed, intended, { decisions: [{ rule: "judged", result: "conforms", fingerprint: print, evidence }] }, { read, reach: () => [] });
  const current = decide(fingerprint(evidence, read));
  assert.equal(current.rules[0].result, "diverges");
  assert.equal(current.rules[0].violations[0].edge, "spawns(rs:voyager_desktop::platform,program:paplay)");
  assert.equal(current.relations[0].status, "implemented");
  assert.equal(current.rules[1].result, "conforms");
  assert.equal(decide("0000000000000000").rules[1].result, "stale");
});
