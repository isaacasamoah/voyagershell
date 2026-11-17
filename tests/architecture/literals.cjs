const { analyse } = require("./rust.cjs");
const { glob } = require("./snapshot.cjs");

const TEST_FILE = /(^|\/)tests\/|(^|\/)tests\.rs$|_tests?\.rs$/;
const TEST_SCOPES = new Set(["skip", "scan"]);

function any(patterns) {
  const regexes = (patterns ?? []).map(glob);
  return (file) => regexes.some((regex) => regex.test(file));
}

function load(rule) {
  const problem = (message) => {
    throw new Error(`Rule ${rule.id}: ${message}`);
  };
  if (!rule.literals?.length) problem("forbid_literal needs literals");
  const owners = [rule.owner, ...(rule.owners ?? [])].filter(Boolean);
  if (!owners.length) problem("forbid_literal needs an owner file");
  if (!rule.roots?.length) problem("forbid_literal needs roots");
  if (!TEST_SCOPES.has(rule.tests))
    problem(
      `forbid_literal needs tests set to ${[...TEST_SCOPES].join(" or ")}`,
    );
  return {
    id: rule.id,
    literals: rule.literals.map(String),
    owners: new Set(owners),
    skipTests: rule.tests === "skip",
    inside: any(rule.roots),
    outside: any(rule.exclude),
  };
}

function stringContents(analysis) {
  const found = [];
  let open = -1;
  for (let index = 0; index < analysis.bare.length; index += 1) {
    if (analysis.bare[index] !== '"') continue;
    if (open < 0) open = index;
    else {
      found.push({
        position: open,
        text: analysis.masked.slice(open + 1, index),
      });
      open = -1;
    }
  }
  return found;
}

function scanFile(table, file, text) {
  const wanted = table.literals.filter((value) => text.includes(`"${value}"`));
  if (!wanted.length) return [];
  const analysis = analyse(text);
  return stringContents(analysis)
    .filter(
      (item) =>
        wanted.includes(item.text) &&
        !(table.skipTests && analysis.inTest(item.position)),
    )
    .map((item) => ({
      key: `"${item.text}" in ${file}`,
      file,
      line: analysis.line(item.position),
    }));
}

function scanSnapshot(table, snapshot) {
  const found = new Map();
  for (const file of snapshot.blobs.keys()) {
    if (
      !file.endsWith(".rs") ||
      table.owners.has(file) ||
      !table.inside(file) ||
      table.outside(file) ||
      (table.skipTests && TEST_FILE.test(file))
    )
      continue;
    for (const hit of scanFile(table, file, snapshot.read(file))) {
      if (!found.has(hit.key)) found.set(hit.key, []);
      found.get(hit.key).push({ file: hit.file, line: hit.line });
    }
  }
  return found;
}

module.exports = { load, scanSnapshot };
