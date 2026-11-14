const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, after } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const GATE = path.join(__dirname, "gate.cjs");
const KNOWN = path.join(__dirname, "known-violations.yaml");
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("HC_")),
);

const temporary = [];
after(() => {
  for (const directory of temporary)
    fs.rmSync(directory, { recursive: true, force: true });
});

function folder(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporary.push(directory);
  return directory;
}

function scratch() {
  const directory = folder("architecture-gate-");
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
  const file = path.join(folder("architecture-known-"), "known.yaml");
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
  assert.match(result.out, /14 violations, 14 known\n.*PASS\n$/s);
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
  fs.writeFileSync(path.join(directory, "app/planted.rs"), "fn planted() {}\n");
  edit(
    directory,
    "app/src/lib.rs",
    (source) =>
      `${source}\nconst PLANTED: &str = include_str!("../planted.md");\ninclude!("../planted.rs");\n`,
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
    path.join(directory, "app/src/planted.rs"),
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
    path.join(directory, "desktop/mods/header/planted-a.ts"),
    'import { b } from "./planted-b.js";\nexport const a = b;\n',
  );
  fs.writeFileSync(
    path.join(directory, "desktop/mods/header/planted-b.ts"),
    'import { a } from "./planted-a.js";\nexport const b = a;\n',
  );
  expectFailure(
    run(directory),
    "NEW no-script-cycles: ts:desktop/mods/header/planted-a.ts <-> ts:desktop/mods/header/planted-b.ts",
  );
});

test("the recorded header cycle that is not recorded fails", () => {
  expectFailure(
    run(scratch(), ["--known", without(/no-script-cycles/)]),
    "NEW no-script-cycles: ts:desktop/mods/header/main.ts",
  );
});
