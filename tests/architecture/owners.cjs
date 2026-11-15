const fs = require("node:fs");
const { parse, stringify } = require("./yaml.cjs");

const ROOTS = ["app/", "contract/", "desktop/", "content/"];
const UNIT = /\.(rs|ts)$/;
const SCRIPT_KINDS = new Set(["module", "script", "binary"]);

function claims(entry, file) {
  return entry.endsWith("/") ? file.startsWith(entry) : file === entry;
}

function owners(contexts, file) {
  return contexts
    .filter((context) => (context.owns ?? []).some((e) => claims(e, file)))
    .map((context) => context.id);
}

function sourceUnits(files) {
  return Object.keys(files)
    .filter(
      (file) =>
        UNIT.test(file) &&
        !file.endsWith(".d.ts") &&
        ROOTS.some((root) => file.startsWith(root)),
    )
    .sort();
}

function ownership(contexts, files) {
  const problems = [];
  for (const file of sourceUnits(files)) {
    const found = owners(contexts, file);
    if (!found.length)
      problems.push({
        id: `${file} is in no context, list it under one context in vocabulary.yaml`,
        at: file,
      });
    else if (found.length > 1)
      problems.push({
        id: `${file} is claimed by ${found.join(" and ")}, keep it in one context in vocabulary.yaml`,
        at: file,
      });
  }
  return problems;
}

function nested(contexts) {
  const entries = contexts.flatMap((context) =>
    (context.owns ?? []).map((entry) => ({ entry, context: context.id })),
  );
  const problems = [];
  for (const outer of entries)
    for (const inner of entries)
      if (
        outer.context !== inner.context &&
        outer.entry !== inner.entry &&
        outer.entry.endsWith("/") &&
        inner.entry.startsWith(outer.entry)
      )
        problems.push(
          `${inner.entry} of ${inner.context} is inside ${outer.entry} of ${outer.context}`,
        );
  return problems;
}

function crossEdges(contexts, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ownerOf = (node) =>
    node?.file && SCRIPT_KINDS.has(node.kind)
      ? owners(contexts, node.file)[0]
      : undefined;
  const found = new Map();
  for (const edge of edges) {
    if (edge.kind !== "uses" && edge.kind !== "imports") continue;
    const from = ownerOf(byId.get(edge.from));
    const to = ownerOf(byId.get(edge.to));
    if (!from || !to || from === to) continue;
    const key = `${edge.from} -> ${edge.to} (${from} -> ${to})`;
    if (!found.has(key))
      found.set(key, {
        key,
        from: edge.from,
        to: edge.to,
        from_owner: from,
        to_owner: to,
        at: `${edge.evidence[0].path}:${edge.evidence[0].line}`,
      });
  }
  return [...found.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

function entryKey(entry) {
  return `${entry.from} -> ${entry.to} (${entry.from_owner} -> ${entry.to_owner})`;
}

function loadIntended(file) {
  const entries = parse(fs.readFileSync(file, "utf8")).edges ?? [];
  for (const entry of entries)
    for (const key of ["from", "to", "from_owner", "to_owner"])
      if (!entry[key])
        throw new Error(`Intended edge needs ${key}: ${JSON.stringify(entry)}`);
  return entries;
}

function intendedViolations(current, listed) {
  const recorded = new Set(listed.map(entryKey));
  const present = new Set(current.map((edge) => edge.key));
  return [
    ...current
      .filter((edge) => !recorded.has(edge.key))
      .map((edge) => ({
        id: `${edge.key}, add it to intended.yaml in this PR if the edge is intended`,
        at: edge.at,
      })),
    ...[...recorded]
      .filter((key) => !present.has(key))
      .sort()
      .map((key) => ({
        id: `${key}, remove it from intended.yaml`,
        at: null,
        label: "STALE",
      })),
  ];
}

function intendedText(current) {
  return stringify({
    edges: current.map(({ from, to, from_owner, to_owner }) => ({
      from,
      to,
      from_owner,
      to_owner,
    })),
  });
}

module.exports = {
  owners,
  ownership,
  nested,
  crossEdges,
  loadIntended,
  intendedViolations,
  intendedText,
};
