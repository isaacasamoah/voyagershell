const { runCli } = require("./changed.cjs");

const SCOPE = [
  "app/",
  "desktop/src/",
  "contract/src/",
  "desktop/canvas/",
  "tests/native/src/",
];
const EXEMPT = ["desktop/patches/"];
const LANGUAGES = { ".rs": "rust", ".ts": "typescript", ".tsx": "typescript" };

const REGEX_PUNCTUATION = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
]);

function languageOf(path) {
  if (EXEMPT.some((prefix) => path.startsWith(prefix))) return null;
  if (!SCOPE.some((prefix) => path.startsWith(prefix))) return null;
  const dot = path.lastIndexOf(".");
  return dot < 0 ? null : (LANGUAGES[path.slice(dot)] ?? null);
}

function isWordChar(char) {
  return char !== undefined && /[\p{L}\p{N}_$]/u.test(char);
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

function lineEnd(text, from) {
  const end = text.indexOf("\n", from);
  return end < 0 ? text.length : end;
}

function skipQuoted(text, from, quote) {
  let i = from + 1;
  while (i < text.length && text[i] !== quote) {
    i += text[i] === "\\" ? 2 : 1;
  }
  return i + 1;
}

function rawStringEnd(text, i) {
  let j = i;
  if (text[j] === "b" || text[j] === "c") j += 1;
  if (text[j] !== "r") return -1;
  j += 1;
  let hashes = 0;
  while (text[j] === "#") {
    hashes += 1;
    j += 1;
  }
  if (text[j] !== '"') return -1;
  const close = `"${"#".repeat(hashes)}`;
  const end = text.indexOf(close, j + 1);
  return end < 0 ? text.length : end + close.length;
}

function rustComments(text) {
  const lineOf = lineIndex(text);
  const lines = new Set();
  const mark = (from, to) => {
    for (let n = lineOf(from); n <= lineOf(Math.max(from, to - 1)); n += 1) {
      lines.add(n);
    }
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "/" && next === "/") {
      const end = lineEnd(text, i);
      mark(i, end);
      i = end;
    } else if (char === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "/" && text[j + 1] === "*") {
          depth += 1;
          j += 2;
        } else if (text[j] === "*" && text[j + 1] === "/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      mark(i, j);
      i = j;
    } else if (
      (char === "r" || char === "b" || char === "c") &&
      !isWordChar(text[i - 1]) &&
      rawStringEnd(text, i) >= 0
    ) {
      i = rawStringEnd(text, i);
    } else if (char === '"') {
      i = skipQuoted(text, i, '"');
    } else if (char === "'") {
      if (next === "\\") {
        i = skipQuoted(text, i, "'");
      } else if (next !== undefined) {
        const width = String.fromCodePoint(text.codePointAt(i + 1)).length;
        i = text[i + 1 + width] === "'" ? i + 2 + width : i + 1;
      } else {
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return lines;
}

function typescriptComments(text) {
  const lineOf = lineIndex(text);
  const lines = new Set();
  const mark = (from, to) => {
    for (let n = lineOf(from); n <= lineOf(Math.max(from, to - 1)); n += 1) {
      lines.add(n);
    }
  };
  const braces = [];
  let previous = null;
  let i = 0;

  const scanTemplate = (from) => {
    let j = from;
    while (j < text.length) {
      if (text[j] === "\\") {
        j += 2;
      } else if (text[j] === "`") {
        return j + 1;
      } else if (text[j] === "$" && text[j + 1] === "{") {
        braces.push("template");
        previous = { kind: "punct", value: "{" };
        return j + 2;
      } else {
        j += 1;
      }
    }
    return j;
  };

  const regexEnd = (from) => {
    let j = from + 1;
    let inClass = false;
    while (j < text.length && text[j] !== "\n") {
      if (text[j] === "\\") {
        j += 2;
        continue;
      }
      if (text[j] === "[") inClass = true;
      else if (text[j] === "]") inClass = false;
      else if (text[j] === "/" && !inClass) {
        j += 1;
        while (isWordChar(text[j])) j += 1;
        return j;
      }
      j += 1;
    }
    return -1;
  };

  const startsRegex = () => {
    if (previous === null) return true;
    if (previous.kind === "punct") return REGEX_PUNCTUATION.has(previous.value);
    if (previous.kind === "word") return REGEX_KEYWORDS.has(previous.value);
    return false;
  };

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "/" && next === "/") {
      const end = lineEnd(text, i);
      mark(i, end);
      i = end;
    } else if (char === "/" && next === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close < 0 ? text.length : close + 2;
      mark(i, end);
      i = end;
    } else if (char === "'" || char === '"') {
      i = skipQuoted(text, i, char);
      previous = { kind: "string" };
    } else if (char === "`") {
      i = scanTemplate(i + 1);
      if (text[i - 1] === "`") previous = { kind: "string" };
    } else if (char === "/") {
      const end = startsRegex() ? regexEnd(i) : -1;
      if (end >= 0) {
        i = end;
        previous = { kind: "regex" };
      } else {
        i += 1;
        previous = { kind: "punct", value: "/" };
      }
    } else if (isWordChar(char)) {
      let j = i;
      while (isWordChar(text[j])) j += 1;
      const word = text.slice(i, j);
      previous = /^\d/.test(word)
        ? { kind: "number" }
        : { kind: "word", value: word };
      i = j;
    } else if (/\s/.test(char)) {
      i += 1;
    } else {
      if (char === "{") {
        braces.push("brace");
      } else if (char === "}") {
        const opened = braces.pop();
        if (opened === "template") {
          i = scanTemplate(i + 1);
          if (text[i - 1] === "`") previous = { kind: "string" };
          continue;
        }
      }
      const doubled = (char === "+" || char === "-") && next === char;
      if (doubled) {
        previous = { kind: "number" };
        i += 2;
      } else {
        previous = { kind: "punct", value: char };
        i += 1;
      }
    }
  }
  return lines;
}

function commentLines(text, language) {
  if (language === "rust") return rustComments(text);
  if (language === "typescript") return typescriptComments(text);
  throw new Error(`unknown language ${language}`);
}

const check = {
  describe:
    "Rejects a comment on an added line of Rust or TypeScript source under app/, desktop/src/, contract/src/, desktop/canvas/ and tests/native/src/.",
  select: (path) => languageOf(path) !== null,
  scan: (file) =>
    [...commentLines(file.text, languageOf(file.path))].map((line) => ({
      line,
      message:
        "added comment. Fix: delete it, and put the reason in the owning document under docs/.",
    })),
};

if (require.main === module) {
  process.exitCode = runCli("comments-check", process.argv.slice(2), check);
}

module.exports = { commentLines, languageOf, check };
