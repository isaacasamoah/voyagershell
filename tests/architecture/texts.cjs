const { analyse } = require("./rust.cjs");
const { glob } = require("./snapshot.cjs");

function any(patterns) {
  const regexes = (patterns ?? []).map(glob);
  return (file) => regexes.some((regex) => regex.test(file));
}

function load(rule) {
  if (!rule.pattern)
    throw new Error(`Rule ${rule.id}: forbid_text needs a pattern`);
  if (!rule.roots?.length)
    throw new Error(`Rule ${rule.id}: forbid_text needs roots`);
  return {
    id: rule.id,
    pattern: new RegExp(rule.pattern, "g"),
    inside: any(rule.roots),
  };
}

function scanSnapshot(table, snapshot) {
  const found = new Map();
  for (const file of snapshot.blobs.keys()) {
    if (!file.endsWith(".rs") || !table.inside(file)) continue;
    const analysis = analyse(snapshot.read(file));
    for (const match of analysis.bare.matchAll(table.pattern)) {
      const key = `${match[0]} in ${file}`;
      if (!found.has(key)) found.set(key, []);
      found.get(key).push({ file, line: analysis.line(match.index) });
    }
  }
  return found;
}

module.exports = { load, scanSnapshot };
