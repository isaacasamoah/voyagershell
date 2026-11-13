const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const GATE = path.join(__dirname, "gate.cjs");
const KNOWN = path.join(__dirname, "known-violations.yaml");
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("HC_")),
);

function scratch() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "architecture-gate-"),
  );
  const files = execFileSync(
    "git",
    ["-C", ROOT, "ls-files", "-co", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    if (!fs.lstatSync(path.join(ROOT, file)).isFile()) continue;
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  execFileSync("git", ["init", "-q"], { cwd: directory });
  return directory;
}

function run(directory, extra = []) {
  const result = spawnSync(
    "node",
    [GATE, "--repository", directory, ...extra],
    { encoding: "utf8", env: ENV },
  );
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function edit(directory, file, change) {
  const target = path.join(directory, file);
  fs.writeFileSync(target, change(fs.readFileSync(target, "utf8")));
}

function without(pattern) {
  const kept = fs
    .readFileSync(KNOWN, "utf8")
    .split("\n  - id: ")
    .filter((entry) => !pattern.test(entry));
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "architecture-known-")),
    "known.yaml",
  );
  fs.writeFileSync(file, kept.join("\n  - id: "));
  return file;
}

function expectFailure(result, ...named) {
  assert.strictEqual(result.status, 1, result.out + result.err);
  for (const text of named)
    assert.ok(result.out.includes(text), `${text} missing from\n${result.out}`);
}

test("the current checkout passes with its known violations", () => {
  const result = run(scratch());
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.match(result.out, /8 violations, 8 known\n.*PASS\n$/s);
});

test("the report is identical across runs and checkout locations", () => {
  const first = scratch();
  const second = scratch();
  assert.strictEqual(run(first).out, run(second).out);
  assert.strictEqual(run(first).out, run(first).out);
});

test("a new #[path] include of experiments source fails", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/lib.rs",
    (text) =>
      `${text}\n#[path = "../../experiments/performance/frame-work/probe.rs"]\nmod planted;\n`,
  );
  expectFailure(
    run(directory),
    "NEW no-experiment-includes: includes(rs:voyager_app,source:experiments/performance/frame-work/probe.rs)",
  );
});

test("the contract crate reaching gpui fails", () => {
  const directory = scratch();
  edit(directory, "Cargo.lock", (text) =>
    text.replace(
      /(name = "voyager-contract"\nversion = "0.1.0"\ndependencies = \[\n)/,
      '$1 "gpui-base",\n',
    ),
  );
  expectFailure(
    run(directory),
    "NEW contract-stays-low: voyager-contract reaches gpui-base",
  );
});

test("the contract crate reaching the app crate fails", () => {
  const directory = scratch();
  edit(directory, "Cargo.lock", (text) =>
    text.replace(
      /(name = "voyager-contract"\nversion = "0.1.0"\ndependencies = \[\n)/,
      '$1 "voyager-app",\n',
    ),
  );
  expectFailure(
    run(directory),
    "NEW contract-stays-low: voyager-contract reaches voyager-app",
  );
});

test("voyage_close using client fails when it is not a known violation", () => {
  expectFailure(
    run(scratch(), ["--known", without(/voyage-close-not-on-client/)]),
    "NEW voyage-close-not-on-client: uses(rs:voyager_app::voyage_close,rs:voyager_app::client)",
  );
});

test("a new module cycle fails", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/panels.rs",
    (text) => `use crate::workspace as _planted;\n${text}`,
  );
  expectFailure(
    run(directory),
    "NEW no-module-cycles: rs:voyager_app::content <-> rs:voyager_app::panels <-> rs:voyager_app::scope <-> rs:voyager_app::workspace",
  );
});

test("an existing cycle that is not recorded fails", () => {
  expectFailure(
    run(scratch(), ["--known", without(/notes_input/)]),
    "NEW no-module-cycles: rs:voyager_desktop::notes_input <-> rs:voyager_desktop::notes_scope <-> rs:voyager_desktop::notes_session",
  );
});

test("fixing a known violation without removing its entry fails as stale", () => {
  const directory = scratch();
  edit(directory, "app/src/lib.rs", (text) =>
    text.replace(
      /#\[path = "\.\.\/\.\.\/experiments\/performance\/typing-latency\/trace\.rs"\]\nmod typing_trace;\n/,
      "",
    ),
  );
  expectFailure(
    run(directory),
    "STALE no-experiment-includes: includes(rs:voyager_app,source:experiments/performance/typing-latency/trace.rs)",
  );
});

test("a known entry without an owner is refused", () => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "architecture-known-")),
    "known.yaml",
  );
  fs.writeFileSync(file, "known:\n  - id: x\n    reason: y\n");
  const result = run(scratch(), ["--known", file]);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.err, /needs id, owner and reason/);
});
