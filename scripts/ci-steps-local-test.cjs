const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  CLEARED,
  IGNORED,
  PlanError,
  WORKFLOW,
  parseSteps,
  plan,
  runSteps,
} = require("./ci-steps-local.cjs");

const TEXT = fs.readFileSync(WORKFLOW, "utf8");
const AFTER_GATE = "      - run: npm run prose:check -- --base HEAD^1\n";

function withStep(step) {
  assert.ok(TEXT.includes(AFTER_GATE), "the anchor step moved");
  return TEXT.replace(AFTER_GATE, `${AFTER_GATE}${step}`);
}

test("the workflow plan holds every step after the gate and npm test", () => {
  const commands = plan(TEXT, "BASE").map((step) => step.command);
  assert.deepStrictEqual(commands, [
    "npm run features:check -- --base BASE",
    "npm run comments:check -- --base BASE",
    "npm run prose:check -- --base BASE",
    "cargo fmt --all --check",
    "cargo test --workspace --locked",
    "cargo clippy --workspace --all-targets --locked -- -D warnings",
    "cargo fmt --check --manifest-path tests/native/Cargo.toml",
    "cargo clippy --all-targets --locked --manifest-path tests/native/Cargo.toml -- -D warnings",
    "cargo run --locked --manifest-path tests/native/Cargo.toml -- lint",
    "cargo test --locked --manifest-path tests/native/Cargo.toml",
    "sh tests/formal/core-viewers/check.sh",
    "npm test",
  ]);
});

test("the CI base is replaced and no sudo step is run", () => {
  for (const step of plan(TEXT, "origin-base")) {
    assert.ok(!step.command.includes("HEAD^1"), step.command);
    assert.ok(!/\bsudo\b/.test(step.command), step.command);
  }
  const names = new Set(parseSteps(TEXT).map((step) => step.name));
  for (const ignored of IGNORED) {
    assert.ok(names.has(ignored.name), ignored.name);
  }
});

test("a new step in the workflow is planned, so it cannot be skipped", () => {
  const commands = plan(
    withStep("      - run: cargo deny check\n"),
    "BASE",
  ).map((step) => step.command);
  assert.ok(commands.includes("cargo deny check"));
});

test("a new action step after the gate fails the plan and is named", () => {
  assert.throws(
    () =>
      plan(
        withStep(
          "      - name: Scan\n        uses: example/scan@0123456789abcdef\n",
        ),
        "BASE",
      ),
    (error) => error instanceof PlanError && /"Scan"/.test(error.message),
  );
});

test("a new sudo step that is not on the ignore list fails the plan", () => {
  assert.throws(
    () =>
      plan(
        withStep("      - name: Tune\n        run: sudo sysctl -w a=1\n"),
        "BASE",
      ),
    (error) => error instanceof PlanError && /"Tune"/.test(error.message),
  );
});

test("a renamed ignored step or a missing gate fails the plan", () => {
  const renamed = TEXT.replace(
    "name: Sandbox tools for the native crate tests",
    "name: Sandbox tools",
  );
  assert.throws(() => plan(renamed, "BASE"), /ignored step/);
  const noGate = TEXT.replace("name: Feature map change gate", "name: Gate");
  assert.throws(() => plan(noGate, "BASE"), /Feature map change gate/);
});

test("a workflow that drops npm test fails the plan", () => {
  assert.throws(
    () => plan(TEXT.replace("- run: npm test\n", "- run: npm run x\n"), "BASE"),
    /npm test/,
  );
});

test("every step runs after a failure and the summary names it", () => {
  const lines = [];
  const results = runSteps(
    [
      { name: "first", command: "exit 3" },
      { name: "second", command: "true" },
    ],
    "abc123",
    path.join(__dirname, ".."),
    (line) => lines.push(line),
  );
  assert.deepStrictEqual(
    results.map((result) => result.status),
    [3, 0],
  );
  assert.strictEqual(lines[0], "head abc123");
  assert.ok(lines.some((line) => line.startsWith("-> exit 3")));
  assert.ok(lines.some((line) => line.startsWith("-> exit 0")));
  const summary = lines[lines.length - 1];
  assert.match(summary, /2 steps, 1 passed, 1 failed/);
  assert.match(summary, /FAILED first \(exit 3\)/);
});

test("the list option prints the plan and runs nothing", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "ci-steps-local.cjs"), "--list", "--base", "HEAD"],
    { encoding: "utf8" },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /cargo fmt --all --check/);
  assert.match(result.stdout, /npm test$/m);
});

test("the seven session and display variables never reach a step", () => {
  assert.deepStrictEqual(CLEARED, [
    "HC_SOCKET",
    "HC_SESSION",
    "HC_TERMINAL_ID",
    "HC_SCOPE",
    "HC_TERMINAL_SOCKET",
    "WAYLAND_DISPLAY",
    "DISPLAY",
  ]);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ci-steps-local-"));
  const seen = path.join(folder, "env.txt");
  const caller = { KEEP_THIS: "yes" };
  for (const key of CLEARED) {
    caller[key] = "set-by-the-caller";
  }
  const lines = [];
  const results = runSteps(
    [{ name: "print the environment", command: `env > "${seen}"` }],
    "abc123",
    path.join(__dirname, ".."),
    (line) => lines.push(line),
    caller,
  );
  assert.strictEqual(results[0].status, 0);
  const names = fs
    .readFileSync(seen, "utf8")
    .split("\n")
    .map((line) => line.split("=")[0]);
  for (const key of CLEARED) {
    assert.ok(!names.includes(key), `${key} reached the step`);
  }
  assert.ok(names.includes("KEEP_THIS"));
  assert.ok(lines.some((line) => /are cleared for every step/.test(line)));
  fs.rmSync(folder, { recursive: true });
});
