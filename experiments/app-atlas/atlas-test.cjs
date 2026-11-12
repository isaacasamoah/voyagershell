const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { build, anchorResolver, loadLayer, loadApp } = require("./atlas.cjs");
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
  const layer = loadLayer(path.join(__dirname, "apps", "voyager", "layer"));
  assert.ok(layer.concepts.length >= 6);
  assert.ok(layer.pathways.length >= 9);
});

const built = build(BASE, loadApp(path.join(__dirname, "apps", "voyager")));

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

// A spec reader's v0 file, small enough to read: two components, one relation, three rules.
const { fromV0 } = require("./import-v0.cjs");
const specV0 = {
  sources: [{ id: "spec:a", path: "SPEC.md", sha256: "0", title: "A spec", role: "test" }],
  components: [
    { id: "intended:app", name: "Application", summary: "The app crate.", binds: ["crate:voyager-app"], cite: [{ source: "spec:a", line: 1, text: "app/ holds policy" }] },
    { id: "intended:client", name: "Client queue", parent: "intended:app", binds: ["rs:voyager_app::client"] },
    { id: "intended:tools", name: "Agent tools", parent: "intended:app", binds: ["agent-tool:*"] },
    { id: "intended:gone", name: "Something unbuilt", parent: "intended:app", binds: ["rs:voyager_app::nowhere"] },
    { id: "intended:core", name: "Herdr Core", binds: ["program:hc"] },
  ],
  relations: [{ id: "calls(intended:client,intended:core)", from: "intended:client", to: "intended:core", kind: "calls", summary: "The client reaches Core." }],
  rules: [
    { id: "desktop-spawns-nothing", statement: "The desktop starts no programs.", check: { type: "forbid_edge", from: ["rs:voyager_desktop*"], to: ["program:*"], kinds: ["spawns"], allow: [] } },
    { id: "app-without-gpui", statement: "The app does not reach GPUI.", check: { type: "forbid_reach", from: "crate:voyager-app", to: ["gpui*"] } },
    { id: "judged-one", statement: "A judged rule.", check: { type: "judged", question: "Is it so?" } },
  ],
  gaps: ["Something the spec leaves open."],
};

test("a v0 spec file converts to a valid intended document and compares at every level", () => {
  const read = () => null;
  const annotations = { decisions: [{ rule: "judged-one", result: "conforms", rationale: "Yes.", fingerprint: "x", evidence: [{ path: "nowhere.rs", line: 1 }] }] };
  const intended = fromV0(specV0, annotations, built.documents.code, { read, commit: BASE });
  const validate = new Ajv({ allErrors: true, strict: false }).compile(require("./architecture-v1.schema.json"));
  assert.ok(validate(intended), JSON.stringify(validate.errors?.slice(0, 3)));
  assert.equal(intended.parts.find((part) => part.id === "intended:app").level, "container");
  assert.equal(intended.parts.find((part) => part.id === "intended:app").parent, "concept:app");
  assert.equal(intended.parts.find((part) => part.id === "intended:client").level, "feature");
  const comparison = compareDocuments(intended, built.documents.code);
  const status = (id) => comparison.parts.find((part) => part.id === id)?.status;
  assert.equal(status("intended:app"), "matched");
  assert.equal(status("intended:client"), "matched");
  assert.equal(status("intended:tools"), "matched", "a wildcard over extractor ids finds the module that offers the tools");
  assert.equal(status("intended:gone"), "missing");
  assert.equal(status("intended:core"), "matched", "program:hc is an alias of the Herdr Core stand-in");
  assert.equal(comparison.homes["rs:voyager_app::canvas"], "intended:app", "unnamed modules belong to the nearest part that binds their crate");
  assert.equal(comparison.homes["rs:voyager_app::client"], "intended:client");
  assert.equal(comparison.links[0].status, "matched");
  const rule = (id) => comparison.rules.find((item) => item.id === id);
  assert.equal(rule("desktop-spawns-nothing").status, "broken");
  assert.ok(rule("desktop-spawns-nothing").violations.some((item) => item.to === "program:paplay"));
  assert.equal(rule("app-without-gpui").status, "holds");
  assert.equal(rule("judged-one").status, "stale", "an answer whose lines no longer match is not trusted");
});

test("a build file names the crate that holds it without claiming the whole crate", () => {
  const intended = fromV0({ components: [
    { id: "intended:schema", name: "Core schema", binds: ["generator:app/core-schema.cjs"] },
    { id: "intended:app", name: "Application", binds: ["crate:voyager-app"] },
  ] }, null, built.documents.code, { read: () => null, commit: BASE });
  const comparison = compareDocuments(intended, built.documents.code);
  assert.equal(comparison.parts.find((part) => part.id === "intended:schema").status, "matched");
  assert.equal(comparison.homes["rs:voyager_app::client"], "intended:app");
});
