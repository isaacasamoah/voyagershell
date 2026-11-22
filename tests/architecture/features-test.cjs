const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { ROOT, ENV, scratch, edit } = require("./fixture.cjs");
const { parse } = require("./yaml.cjs");

const SCRIPT = path.join(__dirname, "features.cjs");

function check(directory, extra = [], env = {}) {
  const result = spawnSync(
    "node",
    [SCRIPT, "--repository", directory, ...extra],
    { encoding: "utf8", env: { ...ENV, ...env } },
  );
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function generate(directory) {
  const result = check(directory, ["--write"]);
  assert.strictEqual(result.status, 0, result.out + result.err);
}

function fails(result, ...named) {
  assert.strictEqual(result.status, 1, result.out + result.err);
  assert.strictEqual(result.err, "");
  for (const text of named)
    assert.ok(result.out.includes(text), `${text} missing from\n${result.out}`);
}

function commit(directory, message) {
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", ...args],
      { cwd: directory, stdio: "pipe" },
    );
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

const ADDED = `
[[feature]]
id = "planted-feature"
name = "Planted feature"
path = "A feature added without regenerating."
sources = ["app/src/scope.rs"]
journeys = ["workspace"]
platforms = ["linux"]
python = []
behavior = "covered"
performance = "none"
visual = "none"
debug = "covered"
`;

test("the committed map and page match their inputs", () => {
  const result = check(ROOT);
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.match(result.out, /^PASS 29 features, 2 proven by its tests\n$/);
});

test("a feature row added without regenerating fails and names it", () => {
  const directory = scratch();
  edit(directory, "tests/native/features.toml", (text) => text + ADDED);
  edit(directory, "architecture/atlas-features.yaml", (text) =>
    text.replace("[clipboard]", "[clipboard, planted-feature]"),
  );
  fails(
    check(directory),
    "FAIL architecture/features.yaml differs from its inputs for planted-feature",
  );
});

test("a feature with no journey fails and names it", () => {
  const directory = scratch();
  edit(directory, "tests/native/features.toml", (text) => text.replace());
  edit(directory, "tests/native/features.toml", (text) =>
    text
      .replace('journeys = ["portals"]', "journeys = []")
      .replace('python = ["portal-terminal"]', "python = []"),
  );
  fails(check(directory), "FAIL portals has no journey");
});

test("a feature naming a journey that does not exist fails", () => {
  const directory = scratch();
  edit(directory, "tests/native/features.toml", (text) =>
    text.replace('journeys = ["portals"]', 'journeys = ["portalz"]'),
  );
  fails(
    check(directory),
    "FAIL portals: native journey portalz does not exist",
  );
});

test("a feature whose files are in no context has no owner", () => {
  const directory = scratch();
  edit(
    directory,
    "tests/native/features.toml",
    (text) => text + ADDED.replace("app/src/scope.rs", "docs/glossary.md"),
  );
  edit(directory, "architecture/atlas-features.yaml", (text) =>
    text.replace("[clipboard]", "[clipboard, planted-feature]"),
  );
  fails(check(directory), "FAIL planted-feature has no owner");
});

test("a feature in no group fails and names it", () => {
  const directory = scratch();
  edit(directory, "tests/native/features.toml", (text) => text + ADDED);
  fails(check(directory), "FAIL planted-feature is in no group");
});

test("a feature in two groups fails", () => {
  const directory = scratch();
  edit(directory, "architecture/atlas-features.yaml", (text) =>
    text.replace("[core-reports]", "[core-reports, clipboard]"),
  );
  fails(check(directory), "clipboard is in groups core-adapter and platform");
});

test("a source glob that matches nothing fails", () => {
  const directory = scratch();
  edit(directory, "tests/native/features.toml", (text) =>
    text.replace('"app/src/codex*.rs"', '"app/src/codexx*.rs"'),
  );
  fails(check(directory), "FAIL chat: app/src/codexx*.rs matches no file");
});

test("a missing input is named without a stack trace", () => {
  const directory = scratch();
  fs.rmSync(path.join(directory, "tests/native/features.toml"));
  fails(check(directory), "FAIL Missing input tests/native/features.toml");
});

test("an empty registry fails with a clear result", () => {
  const directory = scratch();
  fs.writeFileSync(path.join(directory, "tests/native/features.toml"), "");
  fails(check(directory), "is not in tests/native/features.toml");
});

test("a malformed registry names the line", () => {
  const directory = scratch();
  edit(directory, "tests/native/features.toml", (text) =>
    text.replace('behavior = "covered"', "behavior = covered"),
  );
  fails(check(directory), "line 9: only strings and string lists");
});

test("running twice gives identical output and writes nothing", () => {
  const first = check(ROOT);
  const second = check(ROOT);
  assert.deepStrictEqual(second, first);
});

function branched() {
  const directory = scratch();
  commit(directory, "base");
  return directory;
}

test("a Portals code change with no map change and no run fails", () => {
  const directory = branched();
  edit(directory, "desktop/canvas/panels.ts", (text) => `${text}\n`);
  commit(directory, "touch panels");
  fails(
    check(directory, ["--base", "HEAD~1"]),
    "FAIL Portals (portals) changed in desktop/canvas/panels.ts",
    'add "Journeys run: portals"',
  );
});

test("a recorded run of the journey lets the change through", () => {
  const directory = branched();
  edit(directory, "desktop/canvas/panels.ts", (text) => `${text}\n`);
  commit(directory, "touch panels");
  const result = check(directory, [
    "--base",
    "HEAD~1",
    "--ran",
    "portals,arrangement,workspace",
  ]);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("a pull request description records the run", () => {
  const directory = branched();
  edit(directory, "desktop/canvas/panels.ts", (text) => `${text}\n`);
  commit(directory, "touch panels");
  const event = path.join(directory, "event.json");
  fs.writeFileSync(
    event,
    JSON.stringify({
      pull_request: {
        body: "## Why\nx\n\nJourneys run: portals, arrangement, workspace\n",
      },
    }),
  );
  const result = check(directory, ["--base", "HEAD~1"], {
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_EVENT_PATH: event,
  });
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("a changed map entry satisfies the change gate", () => {
  const directory = branched();
  edit(directory, "desktop/canvas/panels.ts", (text) => `${text}\n`);
  edit(directory, "tests/native/features.toml", (text) =>
    text.replace(
      'path = "Open a content Portal beside a Vessel, use it and close it."',
      'path = "Open a content Portal beside a Vessel and close it."',
    ),
  );
  generate(directory);
  commit(directory, "touch panels and map");
  const result = check(directory, ["--base", "HEAD~1"]);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("a base without a map skips the change gate and says so", () => {
  const directory = scratch();
  commit(directory, "base");
  const result = check(directory, ["--base", "HEAD"]);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("a tests/native/src edit with no map change clears through its cargo check", () => {
  const directory = branched();
  edit(directory, "tests/native/src/journey.rs", (text) => `${text}\n`);
  commit(directory, "touch the verifier");
  const result = check(directory, ["--base", "HEAD~1"]);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("a feature with every tier none and no check no longer passes", () => {
  const directory = scratch();
  edit(directory, "architecture/atlas-features.yaml", (text) =>
    text.replace(/\nchecks:[\s\S]*$/, "\n"),
  );
  fails(
    check(directory),
    "FAIL scripts-live-edit has no journey, name one in tests/native/features.toml or a CI check in architecture/atlas-features.yaml",
    "verification-environment has no journey, name one in tests/native/features.toml or a CI check in architecture/atlas-features.yaml",
  );
});

test("a named check that CI does not run fails", () => {
  const directory = scratch();
  edit(directory, "architecture/atlas-features.yaml", (text) =>
    text.replace("cargo test --locked", "cargo test"),
  );
  fails(
    check(directory),
    'verification-environment: check "cargo test --manifest-path tests/native/Cargo.toml" is not a run step',
  );
});

test("an empty atlas file reports its groups cleanly", () => {
  const directory = scratch();
  fs.writeFileSync(
    path.join(directory, "architecture/atlas-features.yaml"),
    "",
  );
  const result = check(directory);
  fails(result, "is in no group");
  assert.ok(!result.out.includes("Cannot read properties"), result.out);
});

test("every Journeys run line in the description counts", () => {
  const directory = branched();
  edit(directory, "desktop/canvas/panels.ts", (text) => `${text}\n`);
  edit(directory, "desktop/src/split.rs", (text) => `${text}\n`);
  commit(directory, "touch panels and split");
  const event = path.join(directory, "event.json");
  const run = (body) => {
    fs.writeFileSync(event, JSON.stringify({ pull_request: { body } }));
    return check(directory, ["--base", "HEAD~1"], {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: event,
    });
  };
  fails(
    run("Journeys run: portals\n"),
    "Split / resize / maximize (split-resize-maximize) changed in desktop/src/split.rs",
  );
  const result = run("Journeys run: portals\n\nJourneys run: arrangement\n");
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("a CI check on a feature that names a journey fails", () => {
  const directory = scratch();
  edit(directory, "architecture/atlas-features.yaml", (text) =>
    text.replace(
      "checks:\n",
      "checks:\n  - feature: portals\n    run: npm test\n",
    ),
  );
  fails(
    check(directory),
    "FAIL portals names a journey, so it cannot take a CI check in architecture/atlas-features.yaml",
  );
});

test("the gate failure names a remedy that works", () => {
  const directory = branched();
  edit(directory, "desktop/canvas/panels.ts", (text) => `${text}\n`);
  commit(directory, "touch panels");
  fails(
    check(directory, ["--base", "HEAD~1"]),
    "to the PR description and push again, or change its entry in tests/native/features.toml and run npm run features:generate",
  );
});

test("a base without a map prints no git error", () => {
  const directory = scratch();
  commit(directory, "base");
  const result = check(directory, ["--base", "HEAD"]);
  assert.strictEqual(result.err, "");
});

const INVARIANT = `
[[invariant]]
id = "planted-invariant"
says = "A planted rule."
kind = "user"
owner = "placement"
source = "a test"
features = ["portals"]
guard = ["gate:file-size"]
check = ["journey:portals/close-portal", "test:app/x.rs#y"]
formal = ["core-viewers:SlotsWithinLimit"]
formal_why = "A planted defect."
confidence = "inferred"
`;

function invariantsOf(directory, feature) {
  const map = parse(
    fs.readFileSync(path.join(directory, "architecture/features.yaml"), "utf8"),
  );
  return map.features.find((entry) => entry.id === feature).invariants;
}

test("a feature shows each declared invariant that names it, with its guards, checks and journeys", () => {
  const directory = scratch();
  edit(
    directory,
    "tests/native/declared-invariants.toml",
    (text) => text + INVARIANT,
  );
  generate(directory);
  const planted = invariantsOf(directory, "portals").find(
    (entry) => entry.id === "planted-invariant",
  );
  assert.deepStrictEqual(planted, {
    id: "planted-invariant",
    kind: "user",
    says: "A planted rule.",
    owner: "placement",
    guards: ["gate:file-size"],
    checks: ["journey:portals/close-portal", "test:app/x.rs#y"],
    formal: ["core-viewers:SlotsWithinLimit"],
    journeys: ["portals"],
  });
  assert.ok(
    !invariantsOf(directory, "clipboard").some(
      (entry) => entry.id === "planted-invariant",
    ),
  );
});

test("a declared invariant naming an unknown feature fails and names it", () => {
  const directory = scratch();
  edit(
    directory,
    "tests/native/declared-invariants.toml",
    (text) => text + INVARIANT.replace('["portals"]', '["portalz"]'),
  );
  fails(
    check(directory),
    "FAIL tests/native/declared-invariants.toml: invariant planted-invariant names feature portalz, which is not in tests/native/features.toml; use a feature id from it",
  );
});

test("a declared invariant change alone does not satisfy the change gate", () => {
  const directory = branched();
  edit(directory, "desktop/canvas/panels.ts", (text) => `${text}\n`);
  edit(
    directory,
    "tests/native/declared-invariants.toml",
    (text) => text + INVARIANT,
  );
  generate(directory);
  commit(directory, "touch panels and invariants");
  fails(
    check(directory, ["--base", "HEAD~1"]),
    "FAIL Portals (portals) changed in desktop/canvas/panels.ts",
  );
});
