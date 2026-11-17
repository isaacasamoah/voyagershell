const { analyse } = require("./rust.cjs");
const { glob } = require("./snapshot.cjs");

const TEST_FILE =
  /(^|\/)tests\/|(^|\/)tests\.rs$|_tests?\.rs$|-tests?\.[cm]?[jt]s$|\.test\.[jt]s$/;
const TEST_SCOPES = new Set(["skip", "scan"]);

function any(patterns) {
  const regexes = (patterns ?? []).map(glob);
  return (file) => regexes.some((regex) => regex.test(file));
}

function load(rule) {
  const problem = (message) => {
    throw new Error(`Rule ${rule.id}: ${message}`);
  };
  if (!rule.literals?.length && !rule.terms?.length)
    problem("forbid_literal needs literals or terms");
  const owners = [rule.owner, ...(rule.owners ?? [])].filter(Boolean);
  if (!owners.length) problem("forbid_literal needs an owner file");
  if (!rule.roots?.length) problem("forbid_literal needs roots");
  if (!TEST_SCOPES.has(rule.tests))
    problem(
      `forbid_literal needs tests set to ${[...TEST_SCOPES].join(" or ")}`,
    );
  return {
    id: rule.id,
    literals: (rule.literals ?? []).map(String),
    terms: (rule.terms ?? []).map((term) => String(term).toLowerCase()),
    extensions: rule.extensions ?? [".rs"],
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

function scanTerms(table, file, text) {
  const lower = text.toLowerCase();
  const analysis = file.endsWith(".rs") ? analyse(text) : null;
  const hits = [];
  for (const term of table.terms) {
    for (
      let at = lower.indexOf(term);
      at >= 0;
      at = lower.indexOf(term, at + 1)
    ) {
      if (table.skipTests && analysis?.inTest(at)) continue;
      hits.push({
        key: `${term} in ${file}`,
        file,
        line: text.slice(0, at).split("\n").length,
      });
    }
  }
  return hits;
}

function scanFile(table, file, text) {
  if (table.terms.length) return scanTerms(table, file, text);
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
      !table.extensions.some((extension) => file.endsWith(extension)) ||
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
