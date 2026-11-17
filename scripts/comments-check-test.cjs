const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { commentLines } = require("./comments-check.cjs");

const SCRIPT = path.join(__dirname, "comments-check.cjs");

function lines(text, language) {
  return [...commentLines(text, language)];
}

test("rust line comment forms are comments", () => {
  assert.deepStrictEqual(
    lines("let a = 1; // note\nlet b = 2;\n", "rust"),
    [1],
  );
  assert.deepStrictEqual(lines("a\n/// doc\nb\n", "rust"), [2]);
  assert.deepStrictEqual(lines("//! module\nfn a() {}\n", "rust"), [1]);
});

test("rust block comments cover every line they touch", () => {
  assert.deepStrictEqual(lines("a /* x */ b\nc\n", "rust"), [1]);
  assert.deepStrictEqual(lines("a\n/* x\ny\nz */\nb\n", "rust"), [2, 3, 4]);
  assert.deepStrictEqual(
    lines("/** doc\n * more\n */\nfn a() {}\n", "rust"),
    [1, 2, 3],
  );
});

test("rust block comments nest", () => {
  assert.deepStrictEqual(
    lines("/* a /* b */ still\ncomment */ code\nnext\n", "rust"),
    [1, 2],
  );
});

test("rust text that only looks like a comment is not one", () => {
  const cases = [
    'let a = "// not";',
    'let a = "/* not */";',
    'let a = "https://example.com/x";',
    'let a = "esc \\" // still string";',
    'let a = b"// bytes";',
    'let a = r"// raw";',
    'let a = r#"// raw " quote"#;',
    'let a = r##"a "# // b"##;',
    'let a = br#"// raw bytes"#;',
    "let a = '/';",
    "let a = '\\'';",
    "let a = '\\n';",
    "let a = '\\u{1F600}';",
    "let a = '😀';",
    "fn f<'a>(x: &'a str) -> &'static str { x }",
    "'outer: loop { break 'outer; }",
  ];
  for (const source of cases) {
    assert.deepStrictEqual(lines(`${source}\n`, "rust"), [], source);
  }
});

test("rust code after a literal still finds the comment", () => {
  assert.deepStrictEqual(lines("let a = '/'; // c\n", "rust"), [1]);
  assert.deepStrictEqual(lines("fn f<'a>(x: &'a str) {} // c\n", "rust"), [1]);
  assert.deepStrictEqual(lines('let a = r#"x"#; // c\n', "rust"), [1]);
  assert.deepStrictEqual(lines('let a = "multi\nline"; // c\n', "rust"), [2]);
});

test("typescript comment forms are comments", () => {
  assert.deepStrictEqual(
    lines("const a = 1; // note\nconst b = 2;\n", "typescript"),
    [1],
  );
  assert.deepStrictEqual(lines("a\n/* x\ny */\nb\n", "typescript"), [2, 3]);
  assert.deepStrictEqual(
    lines("/** doc */\nfunction a() {}\n", "typescript"),
    [1],
  );
});

test("typescript text that only looks like a comment is not one", () => {
  const cases = [
    "const a = 'http://x';",
    'const a = "// not";',
    "const a = '/* not */';",
    'const a = `${"//"}`;',
    "const a = `// ${b} // `;",
    "const a = `${`${'//'}`}`;",
    "const a = `${ { x: '//' }.x }`;",
    "const a = `${b ? `//` : '/*'}`;",
    "const a = /\\/\\.worktrees?\\//.test(p);",
    "const a = /[/]/.test(p);",
    "const a = /\\//g;",
    "const a = x ? /\\/\\*/ : null;",
    "return /[//]/.test(p);",
    "const a = b / c / d;",
    "const a = (b) / c / d;",
    "const a = b[0] / c / d;",
    "const a = 4 / 2 / 1;",
    "const a = b++ / c / d;",
  ];
  for (const source of cases) {
    assert.deepStrictEqual(lines(`${source}\n`, "typescript"), [], source);
  }
});

test("typescript code after a literal still finds the comment", () => {
  assert.deepStrictEqual(lines("const a = `${b}`; // c\n", "typescript"), [1]);
  assert.deepStrictEqual(lines("const a = /\\//g; // c\n", "typescript"), [1]);
  assert.deepStrictEqual(lines("const a = b / c; // c\n", "typescript"), [1]);
  assert.deepStrictEqual(lines("const a = `x\ny`;\n// c\n", "typescript"), [3]);
});

test("the worktrees canvas line passes unchanged", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "canvas", "worktrees.ts"),
    "utf8",
  );
  assert.deepStrictEqual(lines(source, "typescript"), []);
});

function gitIn(cwd, args) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
    { cwd, encoding: "utf8" },
  );
  assert.strictEqual(result.status, 0, result.stderr);
}

function repository(base, change) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "comments-check-"));
  gitIn(cwd, ["init", "-q", "-b", "main"]);
  const write = (files) => {
    for (const [name, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
      fs.writeFileSync(path.join(cwd, name), body);
    }
    gitIn(cwd, ["add", "-A"]);
  };
  write(base);
  gitIn(cwd, ["commit", "-q", "-m", "base"]);
  gitIn(cwd, ["branch", "base"]);
  write(change);
  gitIn(cwd, ["commit", "-q", "--allow-empty", "-m", "change"]);
  return cwd;
}

function run(cwd, args = ["--base", "base"]) {
  return spawnSync("node", [SCRIPT, ...args], { cwd, encoding: "utf8" });
}

test("a planted comment names its path and line and fails", () => {
  const cwd = repository(
    { "app/src/client.rs": "fn a() {}\nfn b() {}\n" },
    { "app/src/client.rs": "fn a() {}\n/// planted\nfn b() {}\n" },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 1);
  assert.match(
    result.stdout,
    /^app\/src\/client\.rs:2: added comment\. Fix: /m,
  );
  assert.match(
    result.stdout,
    /comments-check: 1 findings in 1 files against base/,
  );
});

test("the same comment under desktop/patches passes", () => {
  const cwd = repository(
    { "desktop/patches/a.rs": "fn a() {}\n" },
    { "desktop/patches/a.rs": "fn a() {}\n// planted\n" },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /no changed files in scope/);
});

test("a comment already in the file but not added passes", () => {
  const cwd = repository(
    { "app/src/a.rs": "// old\nfn a() {}\n" },
    { "app/src/a.rs": "// old\nfn a() {}\nfn b() {}\n" },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /no findings in 1 changed files against base/);
});

test("a typescript comment in an added line fails and a new file counts", () => {
  const cwd = repository(
    { "README.md": "x\n" },
    { "desktop/canvas/new.ts": "const a = 1;\nconst b = 2; // c\n" },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /desktop\/canvas\/new\.ts:2: added comment/);
});

test("an empty diff exits clean with a clear line", () => {
  const cwd = repository({ "app/src/a.rs": "fn a() {}\n" }, {});
  const result = run(cwd);
  assert.strictEqual(result.status, 0);
  assert.match(
    result.stdout,
    /comments-check: no changed files in scope against base/,
  );
});

test("a missing base is a usage error without a stack trace", () => {
  const cwd = repository(
    { "app/src/a.rs": "fn a() {}\n" },
    { "app/src/a.rs": "fn b() {}\n" },
  );
  const result = run(cwd, ["--base", "nope"]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /^comments-check: nope is not a commit/);
  assert.doesNotMatch(result.stderr, / {4}at /);
  assert.strictEqual(result.stdout, "");
});

test("an unknown argument is a usage error", () => {
  const cwd = repository({ "a.txt": "x\n" }, { "a.txt": "y\n" });
  const result = run(cwd, ["--wat"]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /unknown argument --wat/);
});

test("help prints usage and exits clean", () => {
  const result = run(__dirname, ["--help"]);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /usage: comments-check/);
});
