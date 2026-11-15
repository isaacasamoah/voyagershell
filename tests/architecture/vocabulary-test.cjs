const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const {
  ENV,
  scratch,
  folder,
  run,
  edit,
  expectFailure,
} = require("./fixture.cjs");

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
    "theme-module",
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
    "a possessive in prose",
    "docs/workspace.md",
    `The ${OLD_UI}'s colour is set.`,
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
    `<text>${OLD_UI}_renders</text>`,
    "canvas-package",
  ],
  [
    "a word in a file with no extension",
    "LICENSE",
    `the ${OLD_UI} draws of the license`,
    "canvas-package",
  ],
  [
    "a package phrase",
    "docs/workspace.md",
    `The ${OLD_UI} package is drawn.`,
    "canvas-package",
  ],
  [
    "a script phrase split across lines",
    "docs/workspace.md",
    `The ${OLD_UI}\nscript is drawn.`,
    "canvas-package",
  ],
  [
    "a nickname phrase",
    "docs/workspace.md",
    `The ${OLD_UI} ${OLD_PKG} is drawn.`,
    "canvas-package",
  ],
  [
    "the old surface in prose",
    "docs/workspace.md",
    `The ${OLD_UI} region is drawn.`,
    "canvas-package",
  ],
  [
    "a pascal-case bar",
    "desktop/src/lib.rs",
    `struct ${join("Hea", "der")}Bar;`,
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
    "an HTTP header in prose",
    "docs/x.md",
    `The provider sends an HTTP ${OLD_UI}.`,
  ],
  [
    "an Authorization header comment",
    "app/src/provider.rs",
    `// set the Authorization ${OLD_UI}`,
  ],
  [
    "a request header call",
    "app/src/codex.rs",
    `let r = c.post(u).${OLD_UI}(AUTHORIZATION, token);`,
  ],
  [
    "a header module path",
    "app/src/provider.rs",
    `use reqwest::${OLD_UI}::AUTHORIZATION;`,
  ],
  [
    "a frame header binding",
    "app/src/core_frame.rs",
    `let mut ${OLD_UI} = [0; 9];`,
  ],
  [
    "a frame header function",
    "tests/native/src/frames.rs",
    `let ${OLD_UI} = frame_${OLD_UI}(&bytes);`,
  ],
  [
    "a nine-byte header in prose",
    "docs/terminal.md",
    `Each Core frame starts with a nine-byte ${OLD_UI}.`,
  ],
  [
    "a column header",
    "docs/x.md",
    `The first column ${OLD_UI} names the term.`,
  ],
  [
    "a C header file",
    "docs/terminal.md",
    `The libghostty C ${OLD_UI} declares it.`,
  ],
  [
    "a single-quoted content-type key",
    "tests/native/x.py",
    `h = {'${join("content", "-type")}': 'a'}`,
  ],
  [
    "an unquoted content-type in prose",
    "docs/x.md",
    `It reads the ${join("content", "-type")} value.`,
  ],
  [
    "the content-type constant in a call",
    "app/src/x.rs",
    `r.${OLD_UI}(${join("CONTENT", "_TYPE")}, "a");`,
  ],
  [
    "a quoted content-type",
    "app/src/x.rs",
    `let h = "${join("content", "-type")}";`,
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
    text.replace("A tab in a Voyage.", `A ${OLD_UI} package in a Voyage.`),
  );
  const result = vocabularyCheck(directory, [
    "--table",
    path.join(directory, "tests/architecture/vocabulary.yaml"),
  ]);
  assert.strictEqual(result.status, 1);
  assert.ok(
    result.out.includes(`term Fleet uses the retired word "${OLD_UI} package"`),
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

test("renaming a glossary code name out of the product makes the check fail", () => {
  const directory = scratch();
  const rename = (folder) => {
    for (const entry of fs.readdirSync(path.join(directory, folder), {
      withFileTypes: true,
    })) {
      const relative = path.join(folder, entry.name);
      if (entry.isDirectory()) rename(relative);
      else if (entry.isFile()) {
        const file = path.join(directory, relative);
        const text = fs.readFileSync(file);
        if (text.includes(0)) continue;
        const source = text.toString("utf8");
        const next = source.replace(/\bFleetId\b/g, "FleetKey");
        if (next !== source) fs.writeFileSync(file, next);
      }
    }
  };
  for (const folder of ["app", "contract", "desktop", "tests/native"])
    rename(folder);
  const result = vocabularyCheck(directory);
  assert.strictEqual(result.status, 1, result.out);
  assert.match(result.out, /term Fleet names code FleetId, which is gone/);
});

test("the codemod writes Vessel ID with the glossary case", () => {
  const directory = scratch();
  const planted = path.join(directory, "docs/planted.md");
  fs.writeFileSync(planted, `The ${join("content", " ID")} is stable.\n`);
  execFileSync("git", ["add", "-A"], { cwd: directory });
  const result = codemod(directory, "6");
  assert.strictEqual(result.status, 0, result.out + result.err);
  assert.strictEqual(
    fs.readFileSync(planted, "utf8"),
    "The Vessel ID is stable.\n",
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
