const { runCli } = require("./changed.cjs");

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
  const raw = text.replace(/^﻿/, "").split(/\r?\n/);
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
    if (/[–—]/.test(prose)) findings.push({ line: n, rule: "long dash" });
    if (/[‘’“”]/.test(prose)) {
      findings.push({ line: n, rule: "curly quote" });
    }
    if (/: \S/.test(prose))
      findings.push({ line: n, rule: "mid-sentence colon" });
  }
  return findings;
}

function inScope(path) {
  return (
    path === "README.md" ||
    path === "AGENTS.md" ||
    /^docs\/[^/]+\.md$/.test(path)
  );
}

const check = {
  describe:
    "Rejects a long dash, curly quote or mid-sentence colon on an added line of docs/*.md, README.md and AGENTS.md.",
  select: inScope,
  scan: (file) =>
    proseFindings(file.text).map(({ line, rule }) => ({
      line,
      message: `${rule}. Fix: ${FIXES[rule]}.`,
    })),
};

if (require.main === module) {
  process.exitCode = runCli("prose-check", process.argv.slice(2), check);
}

module.exports = { proseFindings, inScope, check };
