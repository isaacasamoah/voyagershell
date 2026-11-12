const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { build, anchorResolver, loadLayer } = require("./atlas.cjs");

const BASE = "e6bd5b19ebdac674d6852f8414b1c9c248648e27";
const source = {
  "a.rs": ["fn one() {", "    fn two() {}", "    fn two() {}", "}", "fn three() {", "    fn two() {}"],
};
const read = (file) => source[file] ?? null;

test("an anchor resolves only when its text is on exactly one line", () => {
  const { anchors, resolve } = anchorResolver(read, null);
  assert.equal(anchors[resolve({ path: "a.rs", find: "fn one" })].line, 1);
  assert.equal(anchors[resolve({ path: "a.rs", find: "fn two" })].status, "ambiguous");
  assert.equal(anchors[resolve({ path: "a.rs", find: "fn four" })].status, "missing");
  assert.equal(anchors[resolve({ path: "b.rs", find: "fn one" })].status, "missing-file");
});

test("`after` picks the first match below a unique line", () => {
  const { anchors, resolve } = anchorResolver(read, null);
  const entry = anchors[resolve({ path: "a.rs", find: "fn two", after: "fn three" })];
  assert.equal(entry.status, "current");
  assert.equal(entry.line, 6);
});

test("a reviewed anchor whose code changed is flagged, not trusted", () => {
  const first = anchorResolver(read, null);
  const id = first.resolve({ path: "a.rs", find: "fn one" });
  const lock = { [id]: "0000000000000000" };
  const second = anchorResolver(read, lock);
  assert.equal(second.anchors[second.resolve({ path: "a.rs", find: "fn one" })].status, "changed");
});

test("the layer parses with the strict YAML reader", () => {
  const layer = loadLayer(path.join(__dirname, "layer"));
  assert.ok(layer.concepts.length >= 6);
  assert.ok(layer.pathways.length >= 9);
});

test("the map builds at the baseline with every claim anchored and every module placed", () => {
  const model = build(BASE, path.join(__dirname, "layer"));
  assert.deepEqual(model.problems, []);
  for (const pathway of model.pathways) for (const step of pathway.steps) assert.ok(model.modules.some((module) => module.id === step.module), step.id);
});
