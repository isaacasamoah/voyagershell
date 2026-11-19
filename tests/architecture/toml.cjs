function value(text, line) {
  if (text.startsWith('"') || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`line ${line}: cannot read ${text}`);
    }
  }
  throw new Error(`line ${line}: only strings and string lists are supported`);
}

function parseTables(text, table) {
  const rows = [];
  let current = null;
  text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed === `[[${table}]]`) {
      current = {};
      rows.push(current);
      return;
    }
    const match = trimmed.match(/^([A-Za-z_][\w-]*) = (.+)$/);
    if (!match || !current)
      throw new Error(`line ${line}: cannot read ${trimmed}`);
    if (match[1] in current)
      throw new Error(`line ${line}: ${match[1]} is set twice`);
    current[match[1]] = value(match[2], line);
  });
  return rows;
}

module.exports = { parseTables };
