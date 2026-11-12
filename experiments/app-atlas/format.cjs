// architecture/v1: one document format for an architecture read from code or intended by a spec,
// plus a comparison between two documents. The atlas page is rendered from these documents alone.
// FORMAT.md describes the fields; architecture-v1.schema.json checks them.
const LEVELS = ["concept", "container", "feature", "module", "function"];

// ---------- producing documents from the build's model ----------
function partsOf(model, modules, functions) {
  const slices = [...new Map(modules.map((module) => [module.slice, { id: module.slice, container: module.container, feature: module.feature ?? "unassigned" }])).values()];
  return [
    ...model.concepts.map((concept) => ({ ...concept, level: "concept", parent: null })),
    ...model.containers.map((container) => ({ ...container, level: "container", parent: container.concept })),
    ...slices.map((slice) => ({ id: slice.id, level: "feature", parent: slice.container, feature: slice.feature })),
    ...modules.map((module) => ({ ...module, level: "module", parent: module.slice })),
    ...functions.map((fn) => ({ ...fn, level: "function", parent: fn.module })),
  ];
}

function toDocuments(model) {
  const source = { repository: model.meta.repository, commit: model.meta.commit, short: model.meta.short, date: model.meta.date };
  const code = {
    schema: "architecture/v1",
    kind: "code",
    source: { ...source, producer: "experiments/app-atlas (facts from experiments/architecture-map, meaning from layer/*.yaml, runtime from runs/)", extractor: model.meta.observedGenerator },
    levels: LEVELS,
    features: model.features,
    parts: partsOf(model, model.modules, model.functions),
    links: model.edges,
    interfaces: model.interfaces,
    pathways: model.pathways,
    entry_points: model.entryPoints,
    glossary: model.glossary,
    reading: model.reading,
    runs: model.runs,
    core_runs: model.coreRuns,
    history: model.history,
    anchors: model.anchors,
    problems: model.problems,
  };
  if (!model.proposed) return { code, intended: null };
  const modules = model.proposed.modules.map((module) => ({
    ...module,
    binds: module.kind === "proposed" ? module.binds ?? [] : [module.id],
  }));
  const intended = {
    schema: "architecture/v1",
    kind: "intended",
    source: { producer: "experiments/app-atlas/layer/proposed.yaml", based_on: source, title: "Proposed architecture after the twelve steps of the 11 November review" },
    levels: LEVELS,
    features: [...model.proposed.features, ...model.features],
    parts: partsOf(model, modules, model.functions.filter((fn) => modules.some((module) => module.id === fn.module))),
    links: model.proposed.edges.filter((edge) => edge.category === "proposed" || edge.category === "build").map(({ breaks, today, ...edge }) => edge),
    rules: model.proposed.rules,
    interfaces: model.proposed.interfaces ?? [],
    changes: model.proposals,
  };
  return { code, intended };
}

// ---------- comparing an intended document with a code document ----------
// Names that look like types or fields (capitalised, camelCase or snake_case); plain words in comments are ignored.
function identifiers(text) {
  return new Set((String(text ?? "").match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []).filter((word) => /[A-Z_]/.test(word)));
}

function compareDocuments(intended, code) {
  const codeParts = new Map(code.parts.map((part) => [part.id, part]));
  const codeModules = code.parts.filter((part) => part.level === "module");
  const wanted = intended.parts.filter((part) => part.level === "module");
  const wantedIds = new Set(wanted.map((part) => part.id));
  const homes = {};
  const claim = (id, home) => {
    if (codeParts.has(id) && !homes[id]) homes[id] = home;
  };
  for (const part of wanted) for (const id of part.binds ?? []) claim(id, part.id);
  for (const part of wanted) for (const id of part.primary ?? []) claim(id, part.id);
  for (const part of wanted) for (const id of part.from ?? []) claim(id, part.id);
  const placeOf = (part) => part.parent;
  const parts = [];
  for (const part of wanted) {
    const bound = (part.binds ?? []).filter((id) => codeParts.has(id));
    const sources = (part.primary ?? []).filter((id) => codeParts.has(id));
    if (bound.length) {
      const samePlace = bound.every((id) => placeOf(codeParts.get(id)) === part.parent);
      parts.push({ id: part.id, level: "module", status: !samePlace ? "moved" : part.status && part.status !== "unchanged" ? "changed" : "matched", code: bound });
    } else if (sources.length) {
      parts.push({ id: part.id, level: "module", status: "moved", code: sources, how: part.status });
    } else {
      parts.push({ id: part.id, level: "module", status: "missing", code: [], absorbs: (part.from ?? []).filter((id) => codeParts.has(id)) });
    }
  }
  for (const module of codeModules) if (!homes[module.id] && !wantedIds.has(module.id)) parts.push({ id: module.id, level: "module", status: "unplanned", code: [module.id] });

  const rules = intended.rules ?? [];
  const starts = (id, list) => (list ?? []).some((prefix) => id.startsWith(prefix));
  const broken = (from, to) => rules.filter((rule) => starts(from, rule.from) && starts(to, rule.to) && !starts(to, rule.except_to) && !starts(from, rule.except_from)).map((rule) => rule.id);
  const mapTo = (id) => (wantedIds.has(id) ? id : homes[id] ?? null);
  const codeOf = (id) => {
    const part = wanted.find((entry) => entry.id === id);
    return part ? [...(part.binds ?? []), ...(part.primary ?? [])].filter((x) => codeParts.has(x)) : [];
  };
  const codeLinks = code.links.filter((link) => link.category !== "build");
  const links = [];
  for (const link of intended.links ?? []) {
    if (link.category === "build") continue;
    const from = codeOf(link.from), to = codeOf(link.to);
    const found = codeLinks.some((entry) => from.includes(entry.from) && to.includes(entry.to));
    links.push({ from: link.from, to: link.to, status: found ? "matched" : "missing", nature: link.nature });
  }
  const today = new Map();
  for (const link of codeLinks) {
    const from = mapTo(link.from), to = mapTo(link.to);
    if (!from || !to || from === to) continue;
    const key = `${from}|${to}`;
    const item = today.get(key) ?? { from, to, status: "allowed", kinds: [], count: 0, breaks: broken(from, to), today: [] };
    item.count += link.count;
    for (const kind of link.kinds) if (!item.kinds.includes(kind)) item.kinds.push(kind);
    if (item.today.length < 12) item.today.push({ from: link.from, to: link.to, kinds: link.kinds, count: link.count });
    if (item.breaks.length) item.status = "breaks-rule";
    today.set(key, item);
  }
  const codeInterfaces = new Map((code.interfaces ?? []).map((item) => [item.id, item]));
  const interfaces = (intended.interfaces ?? []).map((item) => {
    const old = item.replaces ? codeInterfaces.get(item.replaces) : null;
    if (!old) return { id: item.id, status: "missing", replaces: item.replaces ?? null };
    const before = identifiers(`${old.request?.shape} ${old.response?.shape}`);
    const after = identifiers(`${item.request?.shape} ${item.response?.shape}`);
    const added = [...after].filter((word) => !before.has(word)).sort();
    const removed = [...before].filter((word) => !after.has(word)).sort();
    return { id: item.id, status: added.length || removed.length ? "changed" : "matched", replaces: item.replaces, added, removed };
  });
  const stale = Object.values(code.anchors ?? {}).filter((anchor) => !["current", "unreviewed"].includes(anchor.status)).map((anchor) => ({ path: anchor.path, find: anchor.find, status: anchor.status }));
  const count = (list, status) => list.filter((entry) => entry.status === status).length;
  const todayLinks = [...today.values()];
  return {
    schema: "architecture/v1",
    kind: "comparison",
    intended: intended.source,
    code: code.source,
    summary: {
      matched: count(parts, "matched"),
      changed: count(parts, "changed"),
      moved: count(parts, "moved"),
      missing: count(parts, "missing"),
      unplanned: count(parts, "unplanned"),
      links_missing: count(links, "missing"),
      links_breaking_rules: count(todayLinks, "breaks-rule"),
      interfaces_changed: count(interfaces, "changed"),
      interfaces_missing: count(interfaces, "missing"),
      stale: stale.length,
    },
    homes,
    parts,
    links,
    today: todayLinks,
    interfaces,
    stale,
  };
}

// ---------- the page's model, from documents alone ----------
function modelFrom({ code, intended, comparison }) {
  const of = (doc, level) => doc.parts.filter((part) => part.level === level);
  const strip = ({ level, parent, ...rest }) => rest;
  const model = {
    meta: {
      commit: code.source.commit, short: code.source.short, date: code.source.date, repository: code.source.repository,
      observedGenerator: code.source.extractor ?? {},
      counts: { modules: of(code, "module").length, functions: of(code, "function").length, edges: code.links.length, pathways: (code.pathways ?? []).length, anchors: Object.keys(code.anchors ?? {}).length },
    },
    concepts: of(code, "concept").map(strip),
    containers: of(code, "container").map(({ level, parent, ...rest }) => ({ ...rest, concept: parent })),
    features: code.features,
    slices: of(code, "feature").map((part) => ({ id: part.id, container: part.parent, feature: part.feature })),
    modules: of(code, "module").map(({ level, parent, ...rest }) => ({ ...rest, slice: parent })),
    functions: of(code, "function").map(({ level, parent, ...rest }) => ({ ...rest, module: parent })),
    edges: code.links,
    pathways: code.pathways ?? [],
    interfaces: code.interfaces ?? [],
    entryPoints: code.entry_points ?? [],
    glossary: code.glossary ?? [],
    reading: code.reading ?? [],
    runs: code.runs ?? [],
    coreRuns: code.core_runs ?? [],
    history: code.history ?? { prs: [] },
    anchors: code.anchors ?? {},
    problems: code.problems ?? [],
    proposals: intended?.changes ?? [],
    proposed: null,
    comparison: comparison ?? null,
  };
  if (intended) {
    const codeFeatureIds = new Set(code.features.map((feature) => feature.id));
    model.proposed = {
      features: intended.features.filter((feature) => !codeFeatureIds.has(feature.id)),
      modules: of(intended, "module").map(({ level, parent, ...rest }) => ({ ...rest, slice: parent })),
      edges: [
        ...intended.links.map((link) => ({ ...link, breaks: [], today: [] })),
        ...(comparison?.today ?? []).map((link) => ({ ...link, category: "today" })),
      ],
      rules: intended.rules ?? [],
      interfaces: intended.interfaces ?? [],
      homes: comparison?.homes ?? {},
    };
  }
  return model;
}

module.exports = { LEVELS, toDocuments, compareDocuments, modelFrom };
