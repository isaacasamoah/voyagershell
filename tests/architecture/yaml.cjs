const PLAIN = /^[A-Za-z_][\w./-]*$/;
const RESERVED = new Set([
  "true",
  "false",
  "null",
  "yes",
  "no",
  "on",
  "off",
  "y",
  "n",
  "~",
]);

function scalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  const text = String(value);
  if (/[\u0000-\u001f\u007f]/.test(text)) return JSON.stringify(text);
  if (PLAIN.test(text) && !RESERVED.has(text.toLowerCase())) return text;
  return `'${text.replace(/'/g, "''")}'`;
}

function isScalar(value) {
  return value === null || value === undefined || typeof value !== "object";
}

function flow(value) {
  if (Array.isArray(value)) {
    if (!value.every(isScalar)) return null;
    return `[${value.map(scalar).join(", ")}]`;
  }
  const keys = Object.keys(value);
  if (keys.length > 4 || !keys.every((key) => isScalar(value[key])))
    return null;
  return `{${keys.map((key) => `${scalar(key)}: ${scalar(value[key])}`).join(", ")}}`;
}

function inline(value, room) {
  if (isScalar(value)) return scalar(value);
  if (Array.isArray(value) && value.length === 0) return "[]";
  if (!Array.isArray(value) && Object.keys(value).length === 0) return "{}";
  const text = flow(value);
  return text !== null && text.length <= room ? text : null;
}

function emit(value, indent = 0) {
  const pad = " ".repeat(indent);
  const lines = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = inline(item, 200);
      if (text !== null) {
        lines.push(`${pad}- ${text}`);
        continue;
      }
      const body = emit(item, indent + 2).split("\n");
      lines.push(`${pad}- ${body[0].slice(indent + 2)}`, ...body.slice(1));
    }
    return lines.join("\n");
  }
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item === undefined) continue;
    const text = inline(item, 200);
    if (text !== null) lines.push(`${pad}${scalar(key)}: ${text}`);
    else lines.push(`${pad}${scalar(key)}:`, emit(item, indent + 2));
  }
  return lines.join("\n");
}

function stringify(value) {
  return `${emit(value)}\n`;
}

function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote && quote === "'" && line[index + 1] === "'")
        index += 1;
      else if (char === "\\" && quote === '"') index += 1;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "#" && (index === 0 || /\s/.test(line[index - 1])))
      return line.slice(0, index);
  }
  return line;
}

function parseFlow(text, at) {
  let index = at;
  const space = () => {
    while (/\s/.test(text[index] ?? "")) index += 1;
  };
  const atom = (stops) => {
    space();
    const char = text[index];
    if (char === "[" || char === "{") return value();
    if (char === "'" || char === '"') {
      let end = index + 1;
      let out = "";
      while (end < text.length) {
        if (char === "'" && text[end] === "'" && text[end + 1] === "'") {
          out += "'";
          end += 2;
        } else if (char === '"' && text[end] === "\\") {
          const size = text[end + 1] === "u" ? 6 : 2;
          out += JSON.parse(`"${text.slice(end, end + size)}"`);
          end += size;
        } else if (text[end] === char) break;
        else out += text[end++];
      }
      if (end >= text.length) throw Error(`Unterminated quote: ${text}`);
      index = end + 1;
      return out;
    }
    let end = index;
    while (end < text.length && !stops.includes(text[end])) end += 1;
    const raw = text.slice(index, end).trim();
    index = end;
    return plain(raw);
  };
  const value = () => {
    space();
    const open = text[index];
    const close = open === "[" ? "]" : "}";
    index += 1;
    const out = open === "[" ? [] : {};
    space();
    if (text[index] === close) {
      index += 1;
      return out;
    }
    for (;;) {
      if (open === "[") out.push(atom(",]"));
      else {
        const key = atom(":");
        space();
        if (text[index] !== ":") throw Error(`Expected ':' in ${text}`);
        index += 1;
        out[key] = atom(",}");
      }
      space();
      if (text[index] === ",") index += 1;
      else if (text[index] === close) {
        index += 1;
        return out;
      } else throw Error(`Malformed flow collection: ${text}`);
    }
  };
  const result = value();
  space();
  if (index !== text.length)
    throw Error(`Trailing text after flow collection: ${text}`);
  return result;
}

function plain(raw) {
  if (raw === "" || raw === "~" || raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function value(raw) {
  const text = raw.trim();
  if (text.startsWith("[") || text.startsWith("{")) return parseFlow(text, 0);
  if (text.startsWith("'") || text.startsWith('"'))
    return parseFlow(`[${text}]`, 0)[0];
  return plain(text);
}

function splitKey(text) {
  const match =
    /^('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^'"][^:]*?)\s*:(?:\s+(.*))?$/.exec(
      text,
    );
  if (!match) return null;
  return { key: String(value(match[1])), rest: match[2] ?? "" };
}

function parse(source) {
  const lines = [];
  source.split(/\r?\n/).forEach((line, number) => {
    const stripped = stripComment(line).replace(/\s+$/, "");
    if (stripped.trim() !== "")
      lines.push({
        indent: stripped.search(/\S/),
        text: stripped.trim(),
        number: number + 1,
        raw: line,
      });
  });
  let position = 0;
  const fail = (line, message) => {
    throw Error(`YAML line ${line.number}: ${message}`);
  };
  const block = (indent) => {
    const first = lines[position];
    if (first.text === "-" || first.text.startsWith("- "))
      return sequence(first.indent);
    return mapping(indent);
  };
  const folded = (style, parentIndent) => {
    const parts = [];
    while (position < lines.length && lines[position].indent > parentIndent)
      parts.push(lines[position++].text);
    return style.startsWith(">") ? parts.join(" ") : parts.join("\n");
  };
  const nested = (line, rest) => {
    if (rest === ">-" || rest === ">" || rest === "|" || rest === "|-")
      return folded(rest, line.indent);
    if (rest !== "") return value(rest);
    const next = lines[position];
    if (!next) return null;
    if (next.indent > line.indent) return block(next.indent);
    if (
      next.indent === line.indent &&
      (next.text === "-" || next.text.startsWith("- "))
    )
      return sequence(next.indent);
    return null;
  };
  const mapping = (indent, out = {}) => {
    while (position < lines.length) {
      const line = lines[position];
      if (line.indent < indent) break;
      if (line.indent > indent) fail(line, "unexpected indentation");
      if (line.text.startsWith("- ")) break;
      const pair = splitKey(line.text);
      if (!pair) fail(line, "expected 'key: value'");
      position += 1;
      if (Object.hasOwn(out, pair.key)) fail(line, `duplicate key ${pair.key}`);
      out[pair.key] = nested(line, pair.rest);
    }
    return out;
  };
  const sequence = (indent) => {
    const out = [];
    while (position < lines.length) {
      const line = lines[position];
      if (
        line.indent !== indent ||
        !(line.text === "-" || line.text.startsWith("- "))
      ) {
        if (line.indent > indent) fail(line, "unexpected indentation");
        break;
      }
      const rest = line.text.slice(1).trim();
      position += 1;
      if (rest === "") {
        out.push(
          lines[position] && lines[position].indent > indent
            ? block(lines[position].indent)
            : null,
        );
        continue;
      }
      const pair = /^[\[{'"]/.test(rest) ? null : splitKey(rest);
      if (!pair) {
        out.push(value(rest));
        continue;
      }
      const itemIndent = indent + 2;
      const item = {};
      item[pair.key] = nested(
        { indent: itemIndent, number: line.number },
        pair.rest,
      );
      out.push(mapping(itemIndent, item));
    }
    return out;
  };
  if (lines.length === 0) return null;
  const result = block(lines[0].indent);
  if (position < lines.length) fail(lines[position], "unparsed content");
  return result;
}

module.exports = { stringify, parse };
