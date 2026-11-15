const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const {
  ROOT,
  scratch,
  folder,
  run,
  edit,
  expectFailure,
} = require("./fixture.cjs");

const INTENDED = path.join(ROOT, "tests/architecture/intended.yaml");
const EDGE =
  "rs:voyager_app::diagnostics -> rs:voyager_app::wire (application-queue -> core-adapter)";

function planted() {
  const directory = scratch();
  edit(
    directory,
    "app/src/diagnostics.rs",
    (text) => `${text}\nuse crate::wire::Frame as PlantedFrame;\n`,
  );
  return directory;
}

test("a new edge between owners fails and names the edge", () => {
  expectFailure(
    run(planted()),
    `NEW intended-edges: ${EDGE}`,
    "app/src/diagnostics.rs",
  );
});

test("a new edge passes once intended.yaml lists it", () => {
  const directory = planted();
  const listed = path.join(folder("architecture-intended-"), "intended.yaml");
  const written = run(directory, ["--write-intended", "--intended", listed]);
  assert.strictEqual(written.status, 0, written.out + written.err);
  assert.ok(fs.readFileSync(listed, "utf8").includes("planted") === false);
  assert.ok(fs.readFileSync(listed, "utf8").includes("rs:voyager_app::wire"));
  const result = run(directory, ["--intended", listed]);
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.match(result.out, /32 violations, 32 known\n.*PASS\n$/s);
});

test("the listed edges are exactly today's cross-owner edges", () => {
  const listed = path.join(folder("architecture-intended-"), "intended.yaml");
  const written = run(scratch(), ["--write-intended", "--intended", listed]);
  assert.strictEqual(written.status, 0, written.out + written.err);
  assert.strictEqual(
    fs.readFileSync(listed, "utf8"),
    fs.readFileSync(INTENDED, "utf8"),
  );
});

test("an edge that is listed but gone fails as stale", () => {
  const listed = path.join(folder("architecture-intended-"), "intended.yaml");
  fs.writeFileSync(
    listed,
    `${fs.readFileSync(INTENDED, "utf8")}  - {from: 'rs:voyager_app::gone', to: 'rs:voyager_app::wire', from_owner: placement, to_owner: core-adapter}\n`,
  );
  expectFailure(
    run(scratch(), ["--intended", listed]),
    "STALE intended-edges: rs:voyager_app::gone -> rs:voyager_app::wire (placement -> core-adapter), remove it from intended.yaml",
  );
});

test("a source file in no context fails and names the file", () => {
  const directory = scratch();
  fs.writeFileSync(
    path.join(directory, "app/src/planted.rs"),
    "pub fn planted() {}\n",
  );
  expectFailure(
    run(directory),
    "NEW one-owner-per-module: app/src/planted.rs is in no context",
  );
});

test("a source file claimed by two contexts fails and names both", () => {
  const directory = scratch();
  edit(directory, "tests/architecture/vocabulary.yaml", (text) =>
    text.replace(
      "app/src/workspace.rs,",
      "app/src/workspace.rs, app/src/content/package.rs,",
    ),
  );
  expectFailure(
    run(directory, [
      "--rules",
      path.join(directory, "tests/architecture/rules.yaml"),
    ]),
    "NEW one-owner-per-module: app/src/content/package.rs is claimed by placement and content",
  );
});

test("a file listed inside another context's folder fails the vocabulary check", () => {
  const { validate } = require("./glossary.cjs");
  const { parse } = require("./yaml.cjs");
  const table = parse(
    fs.readFileSync(
      path.join(ROOT, "tests/architecture/vocabulary.yaml"),
      "utf8",
    ),
  );
  table.contexts
    .find((context) => context.id === "placement")
    .owns.push("app/src/content/package.rs");
  assert.ok(
    validate(table, ROOT).includes(
      "app/src/content/package.rs of placement is inside app/src/content/ of content",
    ),
  );
});
