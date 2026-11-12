const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { build, anchorResolver, loadLayer } = require("./atlas.cjs");
const { modelFrom, compareDocuments } = require("./format.cjs");
const { stringify, parse } = require("../architecture-map/yaml.cjs");
const Ajv = require("ajv");

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

const built = build(BASE, path.join(__dirname, "layer"));

test("the map builds at the baseline with every claim anchored and every module placed", () => {
  const { model } = built;
  assert.deepEqual(model.problems, []);
  for (const pathway of model.pathways) for (const step of pathway.steps) assert.ok(model.modules.some((module) => module.id === step.module), step.id);
});

test("all three documents match the architecture/v1 schema", () => {
  const validate = new Ajv({ allErrors: true, strict: false }).compile(require("./architecture-v1.schema.json"));
  for (const kind of ["code", "intended", "comparison"]) assert.ok(validate(built.documents[kind]), `${kind}: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
});

test("the page model can be rebuilt from the YAML documents alone", () => {
  const read = (doc) => parse(stringify(doc));
  const again = modelFrom({ code: read(built.documents.code), intended: read(built.documents.intended), comparison: read(built.documents.comparison) });
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(built.model)));
});

test("the comparison finds what the proposal changes", () => {
  const status = (id) => built.documents.comparison.parts.find((part) => part.id === id)?.status;
  assert.equal(status("p:app::api::admit"), "missing");
  assert.equal(status("p:app::adapters::core"), "moved");
  assert.equal(status("rs:voyager_desktop::terminal::view"), "matched");
  assert.equal(status("rs:voyager_desktop::host"), "changed");
  assert.equal(built.documents.comparison.homes["rs:voyager_app::client"], "p:app::api::owner");
  const facade = built.documents.comparison.interfaces.find((item) => item.id === "facade-operation");
  assert.equal(facade.status, "changed");
  assert.ok(facade.added.includes("Outcome") && facade.removed.includes("Response"));
  assert.equal(built.documents.comparison.interfaces.find((item) => item.id === "quit-fence").status, "missing");
  assert.ok(built.documents.comparison.today.some((link) => link.breaks.includes("facade-only")));
});

test("a code part no intended part claims is reported as unplanned", () => {
  const intended = { ...built.documents.intended, parts: built.documents.intended.parts.filter((part) => part.id !== "rs:voyager_desktop::speech") };
  const comparison = compareDocuments(intended, built.documents.code);
  assert.equal(comparison.parts.find((part) => part.id === "rs:voyager_desktop::speech")?.status, "unplanned");
});
