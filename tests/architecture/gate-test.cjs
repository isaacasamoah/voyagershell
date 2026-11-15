const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { test, before, after, afterEach } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const GATE = path.join(__dirname, "gate.cjs");
const KNOWN = path.join(__dirname, "known-violations.yaml");
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("HC_")),
);

const RUNS = "architecture-gate-test-";
const ALIVE = "alive.sock";

function abandoned(directory) {
  return new Promise((resolve) => {
    const probe = net.connect(path.join(directory, ALIVE));
    probe.once("connect", () => {
      probe.destroy();
      resolve(false);
    });
    probe.once("error", (error) => resolve(error.code === "ECONNREFUSED"));
  });
}

const RUN = fs.mkdtempSync(path.join(os.tmpdir(), RUNS));
ENV.TMPDIR = RUN;
const alive = net.createServer().listen(path.join(RUN, ALIVE));
alive.unref();
after(() => {
  alive.close();
  fs.rmSync(RUN, { recursive: true, force: true });
});

before(async () => {
  for (const entry of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    const directory = path.join(os.tmpdir(), entry.name);
    if (
      !entry.name.startsWith(RUNS) ||
      !entry.isDirectory() ||
      directory === RUN ||
      !(await abandoned(directory))
    )
      continue;
    try {
      for (const name of fs.readdirSync(directory))
        if (name !== ALIVE)
          fs.rmSync(path.join(directory, name), {
            recursive: true,
            force: true,
          });
      fs.rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      console.error(`Skipped stale ${directory}: ${error.message}`);
    }
  }
});

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function folder(prefix) {
  const directory = fs.mkdtempSync(path.join(RUN, prefix));
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
  assert.match(result.out, /13 violations, 13 known\n.*PASS\n$/s);
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

const OLD_WORD = ["Content", "Id"].join("");

test("an old word in new source fails the vocabulary rule", () => {
  const directory = scratch();
  edit(
    directory,
    "app/src/lib.rs",
    (text) => `${text}\npub struct ${OLD_WORD}(pub String);\n`,
  );
  expectFailure(run(directory), "NEW one-vocabulary: vessel-ids has");
});

const PLANTS = [
  [
    "desktop/src/lib.rs",
    `const ${["HEA", "DER"].join("")}: u32 = 1;`,
    "canvas-package",
  ],
  [
    "README.md",
    `The Notes ${["m", "od"].join("")} is a package.`,
    "package-nickname",
  ],
  [
    "docs/content.md",
    `A ${["content", "type"].join(" ")} is a thing.`,
    "content-words",
  ],
  [
    "AGENTS.md",
    `A ${["content", "package"].join(" ")} is a thing.`,
    "content-words",
  ],
  [
    "app/src/lib.rs",
    `fn planted() -> &'static str { "${["Content", "package"].join(" ")} removed" }`,
    "content-words",
  ],
  [
    "contract/src/lib.rs",
    `pub ${["struct", "Content"].join(" ")} { pub id: u32 }`,
    "vessel-ids",
  ],
  [
    "desktop/canvas/chat.ts",
    `import type { ${["Context", "as", "Scope"].join(" ")} } from "x";`,
    "scope-aliases",
  ],
];

for (const [file, line, group] of PLANTS) {
  test(`a planted line in ${file} fails ${group}`, () => {
    const directory = scratch();
    edit(directory, file, (text) => `${text}\n${line}\n`);
    expectFailure(run(directory), `NEW one-vocabulary: ${group} has`);
  });
}

function codemod(directory, stage) {
  const result = spawnSync(
    "node",
    [
      path.join(__dirname, "vocabulary.cjs"),
      "--repository",
      directory,
      "--apply",
      stage,
    ],
    { encoding: "utf8", env: ENV },
  );
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function vocabularyCheck(directory, extra = []) {
  execFileSync("git", ["add", "-A"], { cwd: directory });
  const result = spawnSync(
    "node",
    [
      path.join(__dirname, "vocabulary.cjs"),
      "--repository",
      directory,
      ...extra,
    ],
    { encoding: "utf8", env: ENV },
  );
  return { status: result.status, out: result.stdout, err: result.stderr };
}

test("a link into another repository passes the vocabulary rule and the codemod leaves it", () => {
  const link = `[Herdr](https://github.com/herdrdev/herdr-app/blob/x/defaults/${["mo", "ds"].join("")}/worktree/main.js)`;
  const directory = scratch();
  edit(directory, "docs/workspace.md", (text) => `${text}\n${link}\n`);
  const result = run(directory);
  assert.strictEqual(result.status, 0, result.out + result.err);
  execFileSync("git", ["add", "-A"], { cwd: directory });
  for (const stage of ["2", "5"]) codemod(directory, stage);
  assert.ok(
    fs
      .readFileSync(path.join(directory, "docs/workspace.md"), "utf8")
      .includes(link),
  );
});

test("the codemod rewrites a planted old word with the table", () => {
  const directory = scratch();
  const planted = path.join(directory, "app/src/planted.rs");
  fs.writeFileSync(planted, `pub struct ${OLD_WORD}(pub String);\n`);
  execFileSync("git", ["add", "-A"], { cwd: directory });
  const result = codemod(directory, "3");
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.strictEqual(
    fs.readFileSync(planted, "utf8"),
    "pub struct VesselId(pub String);\n",
  );
});

const join = (...parts) => parts.join("");
const OLD_UI = join("hea", "der");
const OLD_PKG = join("m", "od");
const OLD_URL = `https://github.com/isaacasamoah/voyagershell/blob/main/desktop/${OLD_PKG}s/${OLD_UI}/main.ts`;

const FORMS = [
  [
    "an upper-case identifier",
    "tests/native/src/journey/scrolling.rs",
    `const ${OLD_UI.toUpperCase()}_REFRESH: u32 = 3;`,
    "canvas-package",
  ],
  [
    "a snake-case identifier",
    "desktop/src/lib.rs",
    `const ${OLD_UI}_renders: u32 = 1;`,
    "canvas-package",
  ],
  [
    "a camel-case identifier",
    "desktop/canvas/main.ts",
    `const ${OLD_UI}Height = 1;`,
    "canvas-package",
  ],
  [
    "a pascal-case identifier",
    "desktop/src/lib.rs",
    `struct ${join("Hea", "der")}Bar;`,
    "canvas-package",
  ],
  [
    "a plural in prose",
    "docs/workspace.md",
    `The ${OLD_UI}s are drawn.`,
    "canvas-package",
  ],
  [
    "a snake-case module",
    "app/src/lib.rs",
    `use crate::${join("content", "_type")}::X;`,
    "content-words",
  ],
  [
    "a camel-case phrase",
    "desktop/canvas/main.ts",
    `const ${join("content", "Type")} = 1;`,
    "content-words",
  ],
  [
    "a title-case phrase",
    "docs/content.md",
    `A ${join("Content", " Type")} is a thing.`,
    "content-words",
  ],
  [
    "an upper-case phrase",
    "docs/content.md",
    `A ${join("CONTENT", " TYPE")} is a thing.`,
    "content-words",
  ],
  [
    "a hyphenated phrase",
    "tests/native/proof_conversation.py",
    `op = "x-${join("content", "-package")}"`,
    "content-words",
  ],
  [
    "a phrase split across lines",
    "docs/content.md",
    `A ${join("content", "")}\n${join("type", " is a thing.")}`,
    "content-words",
  ],
  [
    "a phrase split across comment lines",
    "app/src/lib.rs",
    `// the ${join("content", "")}\n// ${join("package", " is")}`,
    "content-words",
  ],
  [
    "an identifier id form",
    "docs/content.md",
    `The ${join("content", " ID")} is stable.`,
    "vessel-ids",
  ],
  [
    "a path in this repository's own URL",
    "docs/content.md",
    `See ${OLD_URL}.`,
    "canvas-package",
  ],
  [
    "a word in an svg",
    "desktop/canvas/home.svg",
    `<text>${OLD_UI}</text>`,
    "canvas-package",
  ],
  [
    "a word in a file with no extension",
    "LICENSE",
    `${OLD_UI} of the license`,
    "canvas-package",
  ],
  [
    "a nickname identifier",
    "tests/native/proof_workspace.py",
    `${OLD_PKG}_host = 1`,
    "package-nickname",
  ],
  [
    "a nickname camel-case identifier",
    "desktop/canvas/main.ts",
    `const notes${join("M", "od")} = 1;`,
    "package-nickname",
  ],
  [
    "a legacy name identifier",
    "desktop/canvas/main.ts",
    `const ${join("real", "m")}Id = 1;`,
    "legacy-names",
  ],
];

const vocabulary = require("./vocabulary.cjs");
const TABLE = vocabulary.load();
const groups = (file, text) =>
  new Set(vocabulary.scan(TABLE, [file], () => text).keys());

for (const [form, file, line, group] of FORMS)
  test(`the vocabulary scan names ${form} in ${file}`, () => {
    assert.ok(groups(file, `${line}\n`).has(group), `${group} missing`);
  });

const ALLOWED = [
  ["a Rust module declaration", "app/src/lib.rs", `pub ${OLD_PKG} planted;`],
  [
    "a Rust module declaration quoted in prose",
    "docs/content.md",
    `Declare it with \`${OLD_PKG} planted;\` in the library.`,
  ],
  [
    "a nested Rust module",
    "app/src/lib.rs",
    `#[cfg(test)]\n${OLD_PKG} planted {\n}`,
  ],
  [
    "the English word content",
    "docs/content.md",
    "The content of a note stays when its type changes.",
  ],
  ["words that contain the old word", "docs/content.md", "A modal model."],
  ["a mod.rs path", "docs/content.md", `See app/src/${OLD_PKG}.rs for it.`],
  [
    "an HTTP Content-Type string",
    "app/src/x.rs",
    `let h = "${join("Content", "-Type")}: text/plain";`,
  ],
  [
    "the word content, a blank line and the word Type",
    "docs/content.md",
    `A note holds ${join("content", "\n\n", "Type")} data.`,
  ],
  [
    "a named exception",
    "README.md",
    `Run it with --native-${OLD_PKG}-host for the legacy route.`,
  ],
  [
    "the wire frame word",
    "app/src/wire.rs",
    `const FRAME_${OLD_UI.toUpperCase()}: usize = 4;`,
  ],
  [
    "another repository's URL",
    "docs/content.md",
    `See https://github.com/herdrdev/herdr-app/blob/x/defaults/${OLD_PKG}s/${OLD_UI}/main.js.`,
  ],
  [
    "this repository's current path",
    "docs/content.md",
    "See https://github.com/isaacasamoah/voyagershell/blob/main/desktop/canvas/main.ts.",
  ],
];

for (const [form, file, line] of ALLOWED)
  test(`the vocabulary scan passes ${form} in ${file}`, () => {
    assert.deepStrictEqual([...groups(file, `${line}\n`)], []);
  });

test("the gate names a planted retired form end to end", () => {
  const directory = scratch();
  edit(
    directory,
    "docs/content.md",
    (text) => `${text}\nA ${join("Content", " Type")} is a thing.\n`,
  );
  const result = run(directory);
  expectFailure(result, "NEW one-vocabulary: content-words has");
  assert.doesNotMatch(result.out, /NaN/);
});

test("the codemod swaps an identifier form and keeps its case", () => {
  const directory = scratch();
  const planted = path.join(directory, "desktop/src/planted.rs");
  fs.writeFileSync(
    planted,
    `const ${OLD_UI.toUpperCase()}_REFRESH: u32 = 1;\nfn ${OLD_UI}_renders() {}\nstruct ${join("Hea", "der")}Bar;\n`,
  );
  execFileSync("git", ["add", "-A"], { cwd: directory });
  const result = codemod(directory, "6");
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.strictEqual(
    fs.readFileSync(planted, "utf8"),
    "const CANVAS_REFRESH: u32 = 1;\nfn canvas_renders() {}\nstruct CanvasBar;\n",
  );
});

test("the codemod rewrites a Python get of an old stored key", () => {
  const directory = scratch();
  const planted = path.join(directory, "tests/native/planted.py");
  fs.writeFileSync(
    planted,
    'a = layout.get("contents")\nb = p.get("content")\n',
  );
  execFileSync("git", ["add", "-A"], { cwd: directory });
  assert.strictEqual(codemod(directory, "3").status, 0);
  assert.strictEqual(
    fs.readFileSync(planted, "utf8"),
    'a = layout.get("vessels")\nb = p.get("vessel")\n',
  );
});

test("the vocabulary check passes on the current checkout", () => {
  const result = vocabularyCheck(scratch());
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.match(result.out, /PASS\n$/);
});

test("the vocabulary check names a stale glossary", () => {
  const directory = scratch();
  edit(directory, "docs/glossary.md", (text) => `${text}\nextra\n`);
  const result = vocabularyCheck(directory);
  assert.strictEqual(result.status, 1);
  assert.match(
    result.out,
    /docs\/glossary.md is stale, run npm run vocabulary:generate/,
  );
});

test("the vocabulary check names a word with two owners or no meaning", () => {
  const directory = scratch();
  edit(
    directory,
    "tests/architecture/vocabulary.yaml",
    (text) =>
      `${text.replace("  - term: Fleet\n", "  - term: Voyage\n    context: placement\n    meaning: 'Again.'\n  - term: Fleet\n")}`,
  );
  const result = vocabularyCheck(directory, [
    "--table",
    path.join(directory, "tests/architecture/vocabulary.yaml"),
  ]);
  assert.strictEqual(result.status, 1);
  assert.match(result.out, /term Voyage is defined twice/);
});

test("the vocabulary check names a retired word in a definition", () => {
  const directory = scratch();
  edit(directory, "tests/architecture/vocabulary.yaml", (text) =>
    text.replace("A tab in a Voyage.", `A ${OLD_UI} in a Voyage.`),
  );
  const result = vocabularyCheck(directory, [
    "--table",
    path.join(directory, "tests/architecture/vocabulary.yaml"),
  ]);
  assert.strictEqual(result.status, 1);
  assert.ok(
    result.out.includes(`term Fleet uses the retired word "${OLD_UI}"`),
  );
});

test("the vocabulary check names a context that owns a missing file", () => {
  const directory = scratch();
  edit(directory, "tests/architecture/vocabulary.yaml", (text) =>
    text.replace("app/src/core.rs,", "app/src/gone.rs,"),
  );
  const result = vocabularyCheck(directory, [
    "--table",
    path.join(directory, "tests/architecture/vocabulary.yaml"),
  ]);
  assert.strictEqual(result.status, 1);
  assert.match(
    result.out,
    /context core-adapter owns app\/src\/gone.rs, which has no file/,
  );
});

const GONE = join("FleetId", "ThatIsGone");

test("the vocabulary check names a code name that is gone", () => {
  const directory = scratch();
  edit(directory, "tests/architecture/vocabulary.yaml", (text) =>
    text.replace("code: [FleetId]", `code: [${GONE}]`),
  );
  const result = vocabularyCheck(directory, [
    "--table",
    path.join(directory, "tests/architecture/vocabulary.yaml"),
  ]);
  assert.strictEqual(result.status, 1);
  assert.match(
    result.out,
    new RegExp(`term Fleet names code ${GONE}, which is gone`),
  );
});

test("the vocabulary check names a deleted tracked document as stale", () => {
  const directory = scratch();
  execFileSync("git", ["add", "-A"], { cwd: directory });
  fs.rmSync(path.join(directory, "docs/context-map.md"));
  const result = spawnSync(
    "node",
    [path.join(__dirname, "vocabulary.cjs"), "--repository", directory],
    { encoding: "utf8", env: ENV },
  );
  assert.strictEqual(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /docs\/context-map.md is stale, run npm run vocabulary:generate/,
  );
  assert.doesNotMatch(result.stderr, /ENOENT/);
});
