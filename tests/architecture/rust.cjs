function lex(text) {
  const masked = text.split("");
  const bare = text.split("");
  const blank = (target, from, to) => {
    for (let index = from; index < to; index += 1)
      if (target[index] !== "\n") target[index] = " ";
  };
  const length = text.length;
  let index = 0;
  while (index < length) {
    const char = text[index];
    const next = text[index + 1];
    const previous = text[index - 1] ?? "";
    if (char === "/" && next === "/") {
      let end = text.indexOf("\n", index);
      if (end < 0) end = length;
      blank(masked, index, end);
      blank(bare, index, end);
      index = end;
    } else if (char === "/" && next === "*") {
      let depth = 1;
      let end = index + 2;
      while (end < length && depth > 0) {
        if (text[end] === "/" && text[end + 1] === "*")
          ((depth += 1), (end += 2));
        else if (text[end] === "*" && text[end + 1] === "/")
          ((depth -= 1), (end += 2));
        else end += 1;
      }
      blank(masked, index, end);
      blank(bare, index, end);
      index = end;
    } else if (
      char === "r" &&
      (next === '"' || next === "#") &&
      (!/\w/.test(previous) ||
        (previous === "b" && !/\w/.test(text[index - 2] ?? "")))
    ) {
      const raw = /^r(#*)"/.exec(text.slice(index, index + 64));
      if (!raw) {
        index += 1;
        continue;
      }
      const close = `"${raw[1]}`;
      const start = index + raw[0].length;
      let end = text.indexOf(close, start);
      if (end < 0) end = length;
      blank(bare, start, end);
      index = end + close.length;
    } else if (char === '"') {
      let end = index + 1;
      while (end < length && text[end] !== '"')
        end += text[end] === "\\" ? 2 : 1;
      blank(bare, index + 1, end);
      index = end + 1;
    } else if (char === "'") {
      const literal =
        /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\}|.)|[^\\'\n])'/.exec(
          text.slice(index, index + 14),
        );
      if (literal) {
        blank(bare, index + 1, index + literal[0].length - 1);
        index += literal[0].length;
      } else index += 1;
    } else index += 1;
  }
  return { text, masked: masked.join(""), bare: bare.join("") };
}

function analyse(text) {
  const source = lex(text);
  const { bare } = source;
  const starts = [0];
  for (let index = 0; index < text.length; index += 1)
    if (text[index] === "\n") starts.push(index + 1);
  const line = (position) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= position) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  const partner = new Map();
  const stack = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  for (let index = 0; index < bare.length; index += 1) {
    const char = bare[index];
    if (char === "(" || char === "[" || char === "{") stack.push(index);
    else if (pairs[char]) {
      const open = stack.pop();
      if (open !== undefined) {
        partner.set(open, index);
        partner.set(index, open);
      }
    }
  }
  const attributesBefore = (position) => {
    const attributes = [];
    let cursor = position - 1;
    for (;;) {
      while (cursor >= 0 && /\s/.test(bare[cursor])) cursor -= 1;
      if (bare[cursor] !== "]" || !partner.has(cursor)) break;
      const open = partner.get(cursor);
      if (bare[open - 1] !== "#") break;
      attributes.unshift({
        text: source.masked.slice(open - 1, cursor + 1),
        start: open - 1,
      });
      cursor = open - 2;
    }
    return attributes;
  };
  const itemEnd = (position) => {
    let depth = 0;
    for (let index = position; index < bare.length; index += 1) {
      const char = bare[index];
      if (char === "(" || char === "[") depth += 1;
      else if (char === ")" || char === "]") depth -= 1;
      else if (char === ";" && depth === 0) return index;
      else if (char === "{" && depth === 0)
        return partner.get(index) ?? bare.length - 1;
    }
    return bare.length - 1;
  };
  const isTestAttribute = (attribute) => {
    if (/^#\[(\w+::)*test\b/.test(attribute)) return true;
    if (!/^#\[cfg\s*\(/.test(attribute)) return false;
    return /\btest\b/.test(attribute.replace(/not\s*\(\s*test\s*\)/g, ""));
  };
  const tests = [];
  const attributePattern = /#\[/g;
  for (let match; (match = attributePattern.exec(bare));) {
    const close = partner.get(match.index + 1);
    if (close === undefined) continue;
    const attribute = source.masked.slice(match.index, close + 1);
    if (!isTestAttribute(attribute)) continue;
    let cursor = close + 1;
    for (;;) {
      while (/\s/.test(bare[cursor] ?? "")) cursor += 1;
      if (
        bare[cursor] === "#" &&
        bare[cursor + 1] === "[" &&
        partner.has(cursor + 1)
      )
        cursor = partner.get(cursor + 1) + 1;
      else break;
    }
    tests.push([match.index, itemEnd(cursor)]);
  }
  const inTest = (position) =>
    tests.some(([from, to]) => position >= from && position <= to);
  return { ...source, line, partner, attributesBefore, inTest, tests, itemEnd };
}

function modules(analysis) {
  const found = [];
  const pattern =
    /(^|[\s;{}])((?:pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*([;{]))/g;
  for (let match; (match = pattern.exec(analysis.bare));) {
    const start = match.index + match[1].length;
    const attributes = analysis
      .attributesBefore(start)
      .map((item) => item.text);
    const pathAttribute = attributes
      .map((text) => /^#\[path\s*=\s*"([^"]*)"\s*\]$/.exec(text))
      .find(Boolean);
    const conditions = attributes
      .filter((text) => /^#\[cfg\s*\(/.test(text))
      .map((text) => text.slice(2, -1).replace(/\s+/g, " "));
    const open = match.index + match[0].length - 1;
    found.push({
      name: match[3],
      start,
      line: analysis.line(start),
      inline: match[4] === "{",
      range:
        match[4] === "{"
          ? [open, analysis.partner.get(open) ?? analysis.bare.length - 1]
          : null,
      path: pathAttribute ? pathAttribute[1] : null,
      pathLine: pathAttribute
        ? analysis.line(
            analysis
              .attributesBefore(start)
              .find((item) => item.text.startsWith("#[path")).start,
          )
        : null,
      conditions,
      test:
        analysis.inTest(start) ||
        attributes.some(
          (text) =>
            /^#\[cfg\s*\(/.test(text) &&
            /\btest\b/.test(text.replace(/not\s*\(\s*test\s*\)/g, "")),
        ),
    });
  }
  return found;
}

function call(analysis, open) {
  const close = analysis.partner.get(open);
  if (close === undefined) return null;
  return { text: analysis.masked.slice(open + 1, close), close };
}

function scan(analysis, from, to, stop) {
  let depth = 0;
  for (let index = from; index < to; index += 1) {
    const char = analysis.bare[index];
    if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    if (stop?.(char, depth)) return { index, depth };
  }
  return { index: to, depth };
}

const ENDS_STATEMENT = (char, depth) =>
  depth < 0 || (char === ";" && depth === 0);
const ENDS_BLOCK = (_char, depth) => depth < 0;

module.exports = {
  analyse,
  modules,
  call,
  scan,
  ENDS_STATEMENT,
  ENDS_BLOCK,
};
