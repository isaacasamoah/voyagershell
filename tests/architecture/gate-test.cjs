const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const {
  KNOWN,
  scratch,
  folder,
  run,
  edit,
  without,
  expectFailure,
} = require("./fixture.cjs");

test("the current checkout passes with its known violations", () => {
  const result = run(scratch());
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.match(result.out, /30 violations, 30 known\n.*PASS\n$/s);
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

const LIBRARY = ["app/src/lib.rs", "rs:voyager_app"];
const BINARY_ROOTS = [
  ["desktop/src/main.rs", "bin:voyager-shell"],
  ["contract/src/bin/export.rs", "bin:export"],
  ["desktop/src/bin/export-script-types.rs", "bin:export-script-types"],
];
const BRACKETS = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
];
const EMBEDS = [
  ["include_str!", "AGENTS.md", "# planted\n"],
  ["include_bytes!", "data.bin", "bytes"],
];

function reaching(file, planted) {
  return path.posix.join(
    path.posix.relative(path.posix.dirname(file), "."),
    "experiments/planted",
    planted,
  );
}

function plant(directory, file, planted, text, line) {
  fs.mkdirSync(path.join(directory, "experiments/planted"), {
    recursive: true,
  });
  if (planted)
    fs.writeFileSync(
      path.join(directory, "experiments/planted", planted),
      text,
    );
  edit(directory, file, (source) => `${source}\n${line}\n`);
}

for (const [file, owner] of [LIBRARY, ...BINARY_ROOTS]) {
  for (const [open, close] of file === LIBRARY[0]
    ? BRACKETS
    : BRACKETS.slice(0, 1)) {
    for (const [macro, planted, text] of EMBEDS)
      test(`${macro}${open}${close} of experiments source in ${file} fails`, () => {
        const directory = scratch();
        plant(
          directory,
          file,
          planted,
          text,
          `const PLANTED: &[u8] = ${macro}${open}"${reaching(file, planted)}"${close};`,
        );
        expectFailure(
          run(directory),
          `NEW no-experiment-includes: embeds(${owner},files:experiments/planted)`,
        );
      });
    test(`include!${open}${close} of experiments source in ${file} fails`, () => {
      const directory = scratch();
      plant(
        directory,
        file,
        "part.rs",
        "pub fn planted() {}\n",
        `include!${open}"${reaching(file, "part.rs")}"${close};`,
      );
      expectFailure(
        run(directory),
        `NEW no-experiment-includes: includes(${owner},source:experiments/planted/part.rs)`,
      );
    });
  }
}

for (const [file, owner] of BINARY_ROOTS)
  test(`a #[path] module of experiments source in ${file} fails`, () => {
    const directory = scratch();
    plant(
      directory,
      file,
      "part.rs",
      "pub fn planted() {}\n",
      `#[path = "${reaching(file, "part.rs")}"]\nmod planted;`,
    );
    expectFailure(
      run(directory),
      `NEW no-experiment-includes: includes(${owner},source:experiments/planted/part.rs)`,
    );
  });

test("include_str! and include! of a product file still pass", () => {
  const directory = scratch();
  fs.writeFileSync(path.join(directory, "app/planted.md"), "# planted\n");
  fs.writeFileSync(
    path.join(directory, "app/src/content/planted.rs"),
    "fn planted() {}\n",
  );
  edit(
    directory,
    "app/src/lib.rs",
    (source) =>
      `${source}\nconst PLANTED: &str = include_str!("../planted.md");\ninclude!("content/planted.rs");\n`,
  );
  const result = run(directory);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

const UNRESOLVED = [
  [
    "a computed path",
    (directory) => {
      fs.mkdirSync(path.join(directory, "experiments/planted"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(directory, "experiments/planted/AGENTS.md"),
        "# planted\n",
      );
      return 'include_str!(concat!("../../experiments/", "planted/AGENTS.md"))';
    },
  ],
  [
    "a symlink the snapshot drops",
    (directory) => {
      fs.mkdirSync(path.join(directory, "experiments/planted"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(directory, "experiments/planted/AGENTS.md"),
        "# planted\n",
      );
      fs.symlinkSync(
        "../experiments/planted/AGENTS.md",
        path.join(directory, "app/planted-link.md"),
      );
      return 'include_str!("../planted-link.md")';
    },
  ],
  [
    "a file git ignores",
    (directory) => {
      fs.appendFileSync(
        path.join(directory, ".gitignore"),
        "\napp/ignored.md\n",
      );
      fs.writeFileSync(path.join(directory, "app/ignored.md"), "# ignored\n");
      return 'include_str!("../ignored.md")';
    },
  ],
];

for (const [name, prepare] of UNRESOLVED)
  for (const macro of ["include_str!", "include_bytes!", "include!"]) {
    test(`${macro} of ${name} fails the gate`, () => {
      const directory = scratch();
      const expression = prepare(directory).replace("include_str!", macro);
      edit(
        directory,
        "app/src/lib.rs",
        (source) => `${source}\n${expression};\n`,
      );
      const token =
        macro === "include!" ? "include!(" : "include_str!/include_bytes!(";
      expectFailure(
        run(directory),
        `NEW no-unresolved-includes: ${token}@rs:voyager_app(`,
      );
    });
  }

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

test("the Voyage close family using client fails", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/families/voyage_close.rs",
    (text) => `use crate::client as _planted;\n${text}`,
  );
  expectFailure(
    run(directory),
    "NEW voyage-close-not-on-client: uses(rs:voyager_app::families::voyage_close,rs:voyager_app::client)",
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
  const include =
    "includes(rs:voyager_app,source:experiments/performance/frame-work/probe.rs)";
  const known = path.join(folder("architecture-known-"), "known.yaml");
  fs.writeFileSync(
    known,
    `${fs.readFileSync(KNOWN, "utf8")}  - id: 'no-experiment-includes: ${include}'\n    owner: isaac\n    reason: planted\n`,
  );
  const directory = scratch();
  edit(
    directory,
    "app/src/lib.rs",
    (text) =>
      `${text}\n#[path = "../../experiments/performance/frame-work/probe.rs"]\nmod planted;\n`,
  );
  assert.strictEqual(
    run(directory, ["--known", known]).status,
    0,
    "a recorded include passes while it exists",
  );
  edit(directory, "app/src/lib.rs", (text) =>
    text.replace(/\n#\[path = [^\n]*\]\nmod planted;\n/, ""),
  );
  expectFailure(
    run(directory, ["--known", known]),
    `STALE no-experiment-includes: ${include}`,
  );
});

test("a known entry without an owner is refused", () => {
  const file = path.join(folder("architecture-known-"), "known.yaml");
  fs.writeFileSync(file, "known:\n  - id: x\n    reason: y\n");
  const result = run(scratch(), ["--known", file]);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.err, /needs id, owner and reason/);
});

function lines(directory, file) {
  return (
    fs.readFileSync(path.join(directory, file), "utf8").split("\n").length - 1
  );
}

test("growing a known large file by one line fails", () => {
  const directory = scratch();
  const before = lines(directory, "app/src/client.rs");
  edit(directory, "app/src/client.rs", (text) => `${text}\n`);
  expectFailure(
    run(directory),
    `NEW file-size: app/src/client.rs has ${before + 1} lines, over its recorded limit of ${before}`,
  );
});

test("a new file over the limit fails", () => {
  const directory = scratch();
  fs.writeFileSync(
    path.join(directory, "app/src/planted.rs"),
    "fn planted() {}\n".repeat(1001),
  );
  expectFailure(
    run(directory),
    "NEW file-size: app/src/planted.rs has 1001 lines, over the limit of 1000",
  );
});

test("a new architecture tool file over the limit fails", () => {
  const directory = scratch();
  fs.writeFileSync(
    path.join(directory, "tests/architecture/planted.cjs"),
    "const planted = 1;\n".repeat(1001),
  );
  expectFailure(
    run(directory),
    "NEW file-size: tests/architecture/planted.cjs has 1001 lines, over the limit of 1000",
  );
});

test("a file at the limit passes", () => {
  const directory = scratch();
  fs.writeFileSync(
    path.join(directory, "app/src/content/planted.rs"),
    "fn planted() {}\n".repeat(1000),
  );
  const result = run(directory);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("shrinking a known large file tells you to lower its recorded limit", () => {
  const directory = scratch();
  const before = lines(directory, "app/src/client.rs");
  edit(directory, "app/src/client.rs", (text) =>
    text.replace(/\n[^\n]*\n$/, "\n"),
  );
  expectFailure(
    run(directory),
    `STALE file-size: app/src/client.rs has ${before - 1} lines, lower its recorded limit from ${before} to ${before - 1} in known-violations.yaml`,
  );
});

test("a large file that is not recorded fails", () => {
  expectFailure(
    run(scratch(), ["--known", without(/file-size: app\/src\/client\.rs/)]),
    "NEW file-size: app/src/client.rs has",
  );
});

test("a new TypeScript import cycle fails", () => {
  const directory = scratch();
  fs.writeFileSync(
    path.join(directory, "desktop/canvas/planted-a.ts"),
    'import { b } from "./planted-b.js";\nexport const a = b;\n',
  );
  fs.writeFileSync(
    path.join(directory, "desktop/canvas/planted-b.ts"),
    'import { a } from "./planted-a.js";\nexport const b = a;\n',
  );
  expectFailure(
    run(directory),
    "NEW no-script-cycles: ts:desktop/canvas/planted-a.ts <-> ts:desktop/canvas/planted-b.ts",
  );
});

test("the recorded canvas cycle that is not recorded fails", () => {
  expectFailure(
    run(scratch(), ["--known", without(/no-script-cycles/)]),
    "NEW no-script-cycles: ts:desktop/canvas/main.ts",
  );
});

const CHILD_CYCLE =
  "rs:voyager_app::content <-> rs:voyager_app::content::package";

function ruled(directory, change) {
  const file = path.join(directory, "tests/architecture/rules-planted.yaml");
  fs.writeFileSync(
    file,
    change(
      fs.readFileSync(
        path.join(directory, "tests/architecture/rules.yaml"),
        "utf8",
      ),
    ),
  );
  return file;
}

test("a parent and child that use each other fail when not recorded, as #151 did", () => {
  expectFailure(
    run(scratch(), ["--known", without(/client::core_calls/)]),
    "NEW no-child-cycles: rs:voyager_app::client <-> rs:voyager_app::client::core_calls",
  );
});

test("a child that starts using its parent fails", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/content/package.rs",
    (text) => `${text}\nuse super::schema as _planted;\n`,
  );
  expectFailure(run(directory), `NEW no-child-cycles: ${CHILD_CYCLE}`);
});

test("a recorded child cycle that is gone fails as stale", () => {
  const known = path.join(folder("architecture-known-"), "known.yaml");
  fs.writeFileSync(
    known,
    `${fs.readFileSync(KNOWN, "utf8")}  - id: 'no-child-cycles: ${CHILD_CYCLE}'\n    owner: isaac\n    reason: planted\n`,
  );
  expectFailure(
    run(scratch(), ["--known", known]),
    `STALE no-child-cycles: ${CHILD_CYCLE}`,
  );
});

test("child mode on an edge kind without parents is refused", () => {
  const directory = scratch();
  const rules = ruled(directory, (text) =>
    text.replace(
      "check: acyclic\n    kind: uses\n    children: true",
      "check: acyclic\n    kind: imports\n    children: true",
    ),
  );
  const result = run(directory, ["--rules", rules]);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.err, /No parent and child modules for edge kind imports/);
});

const NOTES = 'NEW notes-type-has-one-home: "notes" in';

test("the Notes type literal scattered across files fails, as at the base of #149", () => {
  const directory = scratch();
  for (const file of ["app/src/panels.rs", "app/src/context.rs"])
    edit(
      directory,
      file,
      (text) =>
        `${text}\nfn planted_type() -> &'static str {\n    "notes"\n}\n`,
    );
  expectFailure(
    run(directory),
    `${NOTES} app/src/panels.rs has 1 literals, over the limit of 0`,
    `${NOTES} app/src/context.rs has 1 literals, over the limit of 0`,
  );
});

test("a recorded file that gains another Notes literal fails", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/content.rs",
    (text) => `${text}\nfn planted_type() -> &'static str {\n    "notes"\n}\n`,
  );
  expectFailure(
    run(directory),
    'NEW notes-type-has-one-home: "notes" in app/src/content.rs has 3 literals, over its recorded limit of 2',
  );
});

test("the Notes literal in its owner, in comments and inside longer strings passes", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/vessel_type.rs",
    (text) => `${text}\npub const PLANTED: &str = "notes";\n`,
  );
  edit(
    directory,
    "app/src/panels.rs",
    (text) =>
      `${text}\n// "notes"\nfn planted_text() -> &'static str {\n    "notes.md"\n}\n`,
  );
  const result = run(directory);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("rule scope skips the Notes literal in test files and test modules", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/core_slot_tests.rs",
    (text) => `${text}\nfn planted_type() -> &'static str {\n    "notes"\n}\n`,
  );
  edit(
    directory,
    "app/src/panels.rs",
    (text) =>
      `${text}\n#[cfg(test)]\nmod planted {\n    fn planted_type() -> &'static str {\n        "notes"\n    }\n}\n`,
  );
  const result = run(directory);
  assert.strictEqual(result.status, 0, result.out + result.err);
});

test("rule scope that scans tests fails on the Notes literal in a test file", () => {
  const directory = scratch();
  const rules = ruled(directory, (text) =>
    text.replace("tests: skip", "tests: scan"),
  );
  expectFailure(
    run(directory, ["--rules", rules]),
    `${NOTES} app/src/tests.rs has`,
  );
});

test("a literal rule without a stated test scope is refused", () => {
  const directory = scratch();
  const rules = ruled(directory, (text) =>
    text.replace("    tests: skip\n", ""),
  );
  const result = run(directory, ["--rules", rules]);
  assert.notStrictEqual(result.status, 0);
  assert.match(
    result.err,
    /notes-type-has-one-home: forbid_literal needs tests set to skip or scan/,
  );
});

test("a missing rules file names the file and exits without a stack trace", () => {
  const result = run(scratch(), ["--rules", "/nonexistent/rules.yaml"]);
  assert.strictEqual(result.status, 2);
  assert.match(result.err, /^architecture gate: .*\/nonexistent\/rules\.yaml/);
  assert.doesNotMatch(result.err, /\n\s+at /);
});

const LEAK = "agent-names-stay-in-adapters";
const PLANTS = [
  [
    "a quoted name",
    "app/src/lib.rs",
    '\nfn planted(name: &str) -> bool {\n    name == "claude"\n}\n',
    `${LEAK}: claude in app/src/lib.rs has 1 literals, over the limit of 0`,
  ],
  [
    "an enum variant",
    "app/src/lib.rs",
    "\nenum PlantedKind {\n    Claude,\n}\n",
    `${LEAK}: claude in app/src/lib.rs has 1 literals, over the limit of 0`,
  ],
  [
    "an identifier",
    "app/src/lib.rs",
    "\nfn codex_output() {}\n",
    `${LEAK}: codex in app/src/lib.rs has 1 literals, over the limit of 0`,
  ],
  [
    "a branch in the launch catalog",
    "app/src/launch.rs",
    '\nfn planted(name: &str) -> bool {\n    name == "claude"\n}\n',
    `${LEAK}: claude in app/src/launch.rs has 1 literals, over the limit of 0`,
  ],
  [
    "a name in the canvas",
    "desktop/canvas/regions.ts",
    '\nexport const planted = (name: string) => name === "claude";\n',
    `${LEAK}: claude in desktop/canvas/regions.ts has 1 literals, over the limit of 0`,
  ],
];

for (const [form, file, text, message] of PLANTS) {
  test(`${form} outside an adapter fails the agent-name rule`, () => {
    const directory = scratch();
    edit(directory, file, (current) => `${current}${text}`);
    expectFailure(run(directory), message);
  });
}

test("an agent name inside its adapter passes", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/codex.rs",
    (text) =>
      `${text}\nfn planted(name: &str) -> bool {\n    name == "claude"\n}\n`,
  );
  assert.strictEqual(run(directory).status, 0);
});

test("the Notes literal in a nested module of a root fails", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/content/package.rs",
    (text) => `${text}\nfn planted_type() -> &'static str {\n    "notes"\n}\n`,
  );
  expectFailure(
    run(directory),
    `${NOTES} app/src/content/package.rs has 1 literals, over the limit of 0`,
  );
});
