const { runCli } = require("./changed.cjs");

const RULES = [
  [/[\u2013\u2014]/, "long dash"],
  [/[\u2018\u2019\u201c\u201d]/, "curly quote"],
  [/: \S/, "mid-sentence colon"],
];

const FIXES = {
  "long dash": "use a comma, a period or parentheses",
  "curly quote": "use a straight quote",
  "mid-sentence colon":
    "end the sentence at the colon, or put what follows on its own lines",
};

function openingFence(text) {
  const match = text.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return { char: match[1][0], length: match[1].length };
}

function closingFence(text, opening) {
  const match = text.match(/^[ \t]*(`+|~+)[ \t]*$/);
  return Boolean(
    match && match[1][0] === opening.char && match[1].length >= opening.length,
  );
}

function proseFindings(text) {
  const raw = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const findings = [];
  let start = 0;
  if (raw[0] === "---") {
    start = raw.indexOf("---", 1) + 1;
  }
  let fence = null;
  for (let i = start; i < raw.length; i++) {
    const line = raw[i];
    const n = i + 1;
    let code = Boolean(fence);
    if (fence && closingFence(line, fence)) {
      code = false;
      fence = null;
    } else if (!fence) {
      fence = openingFence(line);
      code = Boolean(fence);
    }
    if (code) continue;
    const prose = line
      .replace(/(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)/g, "`")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\]\([^)]*\)/g, "]");
    for (const [pattern, rule] of RULES) {
      if (pattern.test(prose)) findings.push({ line: n, rule });
    }
  }
  return findings;
}

const RULE_FILES = new Set([
  "CONSTRAINTS.md",
  "CONTRIBUTING.md",
  "tests/native/README.md",
  "tests/native/declared-invariants.toml",
]);

function ruleFile(path) {
  if (RULE_FILES.has(path)) return true;
  if (/^docs\/[^/]+\.md$/.test(path)) return true;
  if (/^\.agents\/skills\/.+\.md$/.test(path)) return true;
  return (
    /(^|\/)AGENTS\.md$/.test(path) &&
    !path.startsWith("tests/native/fixtures/") &&
    !path.startsWith("experiments/")
  );
}

function inScope(path) {
  return path === "README.md" || ruleFile(path);
}

function statements(text) {
  return text
    .split(/\r?\n/)
    .map((line) => /^says = "(.*)"\s*$/.exec(line)?.[1] ?? "")
    .join("\n");
}

const check = {
  describe:
    "Rejects a long dash, curly quote or mid-sentence colon, outside code spans and fenced code, on an added line of README.md and in every line of each rule file: AGENTS.md files, CONSTRAINTS.md, CONTRIBUTING.md, docs/*.md, tests/native/README.md, the project skills under .agents/skills/ and the says statements of tests/native/declared-invariants.toml.",
  select: inScope,
  whole: ruleFile,
  scan: (file) =>
    proseFindings(
      file.path.endsWith(".toml") ? statements(file.text) : file.text,
    ).map(({ line, rule }) => ({
      line,
      message: `${rule}. Fix: ${FIXES[rule]}.`,
    })),
};

if (require.main === module) {
  process.exitCode = runCli("prose-check", process.argv.slice(2), check);
}

module.exports = { proseFindings, inScope, ruleFile, check };
