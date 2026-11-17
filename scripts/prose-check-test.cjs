const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { proseFindings } = require("./prose-check.cjs");

const SCRIPT = path.join(__dirname, "prose-check.cjs");
const DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const LEFT_QUOTE = String.fromCharCode(0x201c);
const APOSTROPHE = String.fromCharCode(0x2019);

test("a long dash is reported on its line", () => {
  assert.deepStrictEqual(proseFindings(`ok\na ${DASH} b\n`), [
    { line: 2, rule: "long dash" },
  ]);
  assert.deepStrictEqual(proseFindings(`1${EN_DASH}2\n`), [
    { line: 1, rule: "long dash" },
  ]);
});

test("a curly quote is reported", () => {
  assert.deepStrictEqual(proseFindings(`${LEFT_QUOTE}x\n`), [
    { line: 1, rule: "curly quote" },
  ]);
  assert.deepStrictEqual(proseFindings(`it${APOSTROPHE}s\n`), [
    { line: 1, rule: "curly quote" },
  ]);
});

test("a mid-sentence colon is reported but a trailing colon is not", () => {
  assert.deepStrictEqual(proseFindings("Note: this\n"), [
    { line: 1, rule: "mid-sentence colon" },
  ]);
  assert.deepStrictEqual(proseFindings("A list follows:\n- one\n"), []);
});

test("one line can break several rules", () => {
  assert.deepStrictEqual(proseFindings(`a: b ${DASH} c\n`), [
    { line: 1, rule: "long dash" },
    { line: 1, rule: "mid-sentence colon" },
  ]);
});

test("code spans are exempt", () => {
  assert.deepStrictEqual(proseFindings(`Use \`a: b ${DASH}\` here.\n`), []);
  assert.deepStrictEqual(
    proseFindings(`Use \`\`a \` b: c ${DASH}\`\` here.\n`),
    [],
  );
});

test("fenced blocks are exempt with backticks and tildes", () => {
  assert.deepStrictEqual(
    proseFindings(`\`\`\`\na: b ${DASH}\n\`\`\`\nc: d\n`),
    [{ line: 4, rule: "mid-sentence colon" }],
  );
  assert.deepStrictEqual(proseFindings(`~~~\na: b ${DASH}\n~~~\n`), []);
  assert.deepStrictEqual(
    proseFindings(`\`\`\`\`\n\`\`\`\na: b\n\`\`\`\`\n`),
    [],
  );
});

test("link targets and image targets are exempt but link text is not", () => {
  assert.deepStrictEqual(proseFindings("See [the page](https://x) now.\n"), []);
  assert.deepStrictEqual(proseFindings("![alt: text](https://x/y.png)\n"), []);
  assert.deepStrictEqual(proseFindings("[a: b](https://x)\n"), [
    { line: 1, rule: "mid-sentence colon" },
  ]);
});

test("frontmatter is exempt", () => {
  assert.deepStrictEqual(
    proseFindings(`---\ntitle: a ${DASH} b\n---\nbody\n`),
    [],
  );
  assert.deepStrictEqual(proseFindings(`---\nunclosed: ${DASH}\n`), [
    { line: 2, rule: "long dash" },
    { line: 2, rule: "mid-sentence colon" },
  ]);
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
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "prose-check-"));
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

test("a planted long dash names its path and line and fails", () => {
  const cwd = repository(
    { "docs/x.md": "one\n" },
    { "docs/x.md": `one\ntwo ${DASH} three\n` },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /^docs\/x\.md:2: long dash\. Fix: use a comma/m);
  assert.match(
    result.stdout,
    /prose-check: 1 findings in 1 files against base/,
  );
});

test("a tell already in the file but not added passes", () => {
  const cwd = repository(
    { "docs/x.md": `old ${DASH} tell\n` },
    { "docs/x.md": `old ${DASH} tell\nnew line\n` },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /no findings in 1 changed files against base/);
});

test("root README and AGENTS are in scope", () => {
  const cwd = repository(
    { "README.md": "a\n", "AGENTS.md": "b\n" },
    { "README.md": "a\nx: y\n", "AGENTS.md": "b\nit’s\n" },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /^README\.md:2: mid-sentence colon/m);
  assert.match(result.stdout, /^AGENTS\.md:2: curly quote/m);
});

test("a nested docs file is out of scope", () => {
  const cwd = repository(
    { "docs/a/b.md": "one\n" },
    { "docs/a/b.md": `one\ntwo ${DASH} three\n` },
  );
  const result = run(cwd);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /no changed files in scope/);
});

test("an empty diff exits clean with a clear line", () => {
  const cwd = repository({ "docs/x.md": "one\n" }, {});
  const result = run(cwd);
  assert.strictEqual(result.status, 0);
  assert.match(
    result.stdout,
    /prose-check: no changed files in scope against base/,
  );
});

test("a missing base is a usage error without a stack trace", () => {
  const cwd = repository({ "docs/x.md": "one\n" }, { "docs/x.md": "two\n" });
  const result = run(cwd, ["--base", "nope"]);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /^prose-check: nope is not a commit/);
  assert.doesNotMatch(result.stderr, / {4}at /);
});
