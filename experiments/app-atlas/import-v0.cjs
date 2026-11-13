// Converts an architecture-map/v0 intended file (the spec reader's output, with its recorded
// judgements) into an architecture/v1 intended document, so specs and designs share one format.
// The v0 file cites spec lines; every citation is carried over unchanged.
const { digest } = require("../../tests/architecture/observe.cjs");
const { LEVELS, resolver } = require("./format.cjs");

const CHECKS = { forbid_edge: "forbid_code", require_edge: "require_code", forbid_reach: "forbid_reach", judged: "judged" };
const BUILD_KINDS = new Set(["generates", "seeds"]);
const UNPLACED = { id: "concept:spec-only", name: "Named only in the specs", colour: "neutral", plain: "Parts the specifications name whose code the map could not find, so they have no place among the code's concepts." };

// The same fingerprint the v0 comparer records: each cited line, trimmed, at the commit.
function fingerprint(evidence, read) {
  return digest(evidence.map((item) => `${item.path}:${item.line}:${(read(item.path)?.[item.line - 1] ?? "").trim()}`).join("\n"), 16);
}

function fromV0(v0, annotations, code, { read, commit }) {
  const resolve = resolver(code);
  const codeParts = new Map(code.parts.map((part) => [part.id, part]));
  const conceptOf = (id) => {
    let part = codeParts.get(id);
    while (part && part.level !== "concept") part = codeParts.get(part.parent);
    return part?.id ?? null;
  };
  const components = v0.components ?? [];
  const byId = new Map(components.map((item) => [item.id, item]));
  const depth = (item) => {
    let level = 0;
    for (let up = byId.get(item.parent); up; up = byId.get(up.parent)) level += 1;
    return level;
  };
  const subtree = (item) => [item, ...components.filter((other) => other.parent === item.id).flatMap(subtree)];
  // A top-level component sits under the code concept most of its (and its children's) code belongs to.
  const placeOf = (item) => {
    const votes = new Map();
    for (const member of subtree(item)) for (const selector of member.binds ?? []) for (const id of resolve(selector)) {
      const concept = conceptOf(id);
      if (concept) votes.set(concept, (votes.get(concept) ?? 0) + 1);
    }
    return [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? UNPLACED.id;
  };
  const parts = [];
  const used = new Set();
  for (const item of components) {
    const level = LEVELS[Math.min(depth(item) + 1, 3)];
    const parent = item.parent ?? placeOf(item);
    if (!item.parent) used.add(parent);
    parts.push({ id: item.id, level, parent, name: item.name, plain: item.summary ?? null, binds: item.binds ?? [], ...(item.note ? { note: item.note } : {}), cite: item.cite ?? [] });
  }
  const concepts = code.parts.filter((part) => part.level === "concept" && used.has(part.id)).map(({ id, name, colour, plain }) => ({ id, level: "concept", parent: null, name, colour, plain }));
  if (used.has(UNPLACED.id)) concepts.push({ ...UNPLACED, level: "concept", parent: null });

  const decisions = new Map((annotations?.decisions ?? []).map((item) => [item.rule, item]));
  const answer = (rule) => {
    const decision = decisions.get(rule.id);
    if (!decision) return undefined;
    const current = fingerprint(decision.evidence ?? [], read) === decision.fingerprint;
    return { result: decision.result, rationale: decision.rationale, by: decision.by, evidence: decision.evidence ?? [], checked: { commit, current } };
  };
  const rules = (v0.rules ?? []).map((rule) => {
    const check = rule.check ?? { type: "judged" };
    const out = { id: rule.id, plain: rule.statement, check: CHECKS[check.type] ?? "judged", applies_to: rule.applies_to ?? [] };
    if (check.from !== undefined) out.from = check.from;
    if (check.to !== undefined) out.to = check.to;
    if (check.kinds) out.kinds = check.kinds;
    if (check.allow?.length) out.allow = check.allow;
    if (check.question) out.question = check.question;
    if (rule.note) out.note = rule.note;
    out.cite = rule.cite ?? [];
    const recorded = answer(rule);
    if (recorded) out.answer = recorded;
    return out;
  });
  return {
    schema: "architecture/v1",
    kind: "intended",
    source: {
      producer: "experiments/app-atlas/import-v0.cjs, from an architecture-map/v0 intended file",
      title: "The architecture the specifications describe",
      tab: "Intended by the specs",
      summary: "Each part below is a component the specifications name, with the spec lines that say so. Its code is found through the files, crates and programs the spec reader bound it to.",
      review: v0.review ?? [],
      specs: (v0.sources ?? []).map(({ id, path, sha256, title, role }) => ({ id, path, sha256, title, role })),
    },
    levels: LEVELS,
    features: [],
    parts: [...concepts, ...parts],
    links: (v0.relations ?? []).map((relation) => ({ from: relation.from, to: relation.to, category: BUILD_KINDS.has(relation.kind) ? "build" : "proposed", kinds: [relation.kind], count: 1, nature: relation.summary, cite: relation.cite ?? [] })),
    rules,
    interfaces: [],
    // Facts about the code the spec reader settled by hand (a program chosen at runtime), each valid
    // only while the source lines it rests on are unchanged.
    assumptions: (annotations?.resolutions ?? []).map((item) => {
      const subject = /@([^()]+)\(/.exec(item.unresolved)?.[1] ?? null;
      return { from: subject, to: item.edge.to, kind: item.edge.kind, note: item.note, by: item.by, evidence: item.evidence ?? [], checked: { commit, current: fingerprint(item.evidence ?? [], read) === item.fingerprint } };
    }),
    gaps: v0.gaps ?? [],
  };
}

module.exports = { fromV0, fingerprint };
