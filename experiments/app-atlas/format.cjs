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
    source: { ...source, app: model.meta.app ?? undefined, layer: model.meta.layer ?? undefined, producer: "experiments/app-atlas (facts from experiments/architecture-map, meaning from the app's layer/*.yaml, runtime from its runs/)", extractor: model.meta.observedGenerator },
    view: model.meta.view ?? {},
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
    reach: model.reach ?? {},
    extracted: model.extracted ?? { nodes: [], links: [] },
  };
  if (!model.proposed) return { code, intended: null };
  const modules = model.proposed.modules.map((module) => ({
    ...module,
    binds: module.kind === "proposed" ? module.binds ?? [] : [module.id],
  }));
  const intended = {
    schema: "architecture/v1",
    kind: "intended",
    source: { producer: `${model.meta.layer ?? "layer"}/proposed.yaml`, based_on: source, title: model.meta.proposal?.title ?? "Proposed architecture", tab: model.meta.proposal?.tab ?? "Proposed architecture", summary: model.meta.proposal?.summary ?? undefined },
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

const wildcard = (pattern) => new RegExp(`^${String(pattern).split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
const DEPTH = Object.fromEntries(LEVELS.map((level, index) => [level, index]));

// Resolves a name (a code part id, an extractor id a part lists in `aliases` or `contains`, or a
// pattern with *) to code part ids. `exact` is false when only a containing part was found: the name
// exists, but inside a larger part, so it cannot claim that whole part.
function resolver(code, { exact: wantExact = false } = {}) {
  const codeParts = new Map(code.parts.map((part) => [part.id, part]));
  const names = new Map();
  for (const part of code.parts) for (const name of part.aliases ?? []) if (!names.has(name)) names.set(name, { id: part.id, exact: true });
  for (const part of code.parts) for (const name of part.contains ?? []) if (!names.has(name)) names.set(name, { id: part.id, exact: false });
  const detailed = (selector) => {
    const text = String(selector);
    if (!text.includes("*")) return codeParts.has(text) ? [{ id: text, exact: true }] : names.has(text) ? [names.get(text)] : [];
    const regex = wildcard(text);
    const out = new Map();
    for (const part of code.parts) if (part.level !== "function" && regex.test(part.id)) out.set(part.id, { id: part.id, exact: true });
    for (const [name, hit] of names) if (regex.test(name) && !out.get(hit.id)?.exact) out.set(hit.id, hit);
    return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
  };
  return wantExact ? detailed : (selector) => detailed(selector).map((hit) => hit.id);
}

// An intended part names code by `binds` (it is that code, in its own place), `primary` (that code
// becomes it) and `from` (that code contributes). Names are code part ids or extractor ids the code
// document lists as `aliases`, and may use * as a wildcard. Parts at any level can be compared.
function compareDocuments(intended, code) {
  const codeParts = new Map(code.parts.map((part) => [part.id, part]));
  const resolve = resolver(code);
  const resolveExact = resolver(code, { exact: true });
  const codeChain = (id) => {
    const out = [];
    for (let part = codeParts.get(id); part; part = part.parent ? codeParts.get(part.parent) : null) out.push(part.id);
    return out;
  };
  const parts = intended.parts;
  const byId = new Map(parts.map((part) => [part.id, part]));
  const intendedChain = (id) => {
    const out = [];
    for (let part = byId.get(id); part; part = part.parent ? byId.get(part.parent) : null) out.push(part.id);
    return out;
  };
  const stated = (part) => part.binds !== undefined || part.primary !== undefined || part.from !== undefined;
  const compared = parts.filter((part) => stated(part) || part.level === "module");
  const unique = (list) => [...new Set(list)];
  const resolved = new Map();
  for (const part of parts) {
    const binds = [];
    const owned = [];
    const unmatched = [];
    for (const selector of part.binds ?? []) {
      const hits = resolveExact(selector);
      if (!hits.length) unmatched.push(selector);
      for (const hit of hits) {
        binds.push(hit.id);
        if (hit.exact) owned.push(hit.id);
      }
    }
    resolved.set(part.id, { binds: unique(binds), owned: unique(owned), unmatched, primary: unique((part.primary ?? []).flatMap(resolve)), from: unique((part.from ?? []).flatMap(resolve)) });
  }
  // A part's place is its nearest ancestor that stands for code: by its binds, or by sharing an id with code.
  const placeOf = (part) => {
    for (let up = byId.get(part.parent); up; up = byId.get(up.parent)) {
      const ids = resolved.get(up.id).binds.length ? resolved.get(up.id).binds : !stated(up) && codeParts.has(up.id) ? [up.id] : [];
      if (ids.length) return ids;
    }
    return null;
  };
  // Deeper parts claim code first, so a module-level part wins over the container that also binds it.
  const claimed = new Map();
  const byDepth = [...compared].sort((a, b) => DEPTH[b.level] - DEPTH[a.level]);
  for (const key of ["owned", "primary", "from"]) for (const part of byDepth) for (const id of resolved.get(part.id)[key]) if (!claimed.has(id)) claimed.set(id, part.id);
  // Code that two intended parts both say they are: the first (deepest) claim wins, and the clash is reported.
  const claimants = new Map();
  for (const part of compared) for (const id of resolved.get(part.id).owned) claimants.set(id, [...(claimants.get(id) ?? []), part.id]);
  const contested = [...claimants].filter(([, list]) => list.length > 1).map(([id, list]) => ({ code: id, parts: list, home: claimed.get(id) }));
  const homes = {};
  for (const part of code.parts) {
    if (part.level === "function") continue;
    const home = codeChain(part.id).map((id) => claimed.get(id)).find(Boolean);
    if (home) homes[part.id] = home;
  }
  const results = [];
  for (const part of compared) {
    const found = resolved.get(part.id);
    const extra = found.unmatched.length ? { unmatched: found.unmatched } : {};
    if (found.binds.length) {
      // Outside stand-ins (libraries, programs) are used, not contained, so they are always in place.
      const place = placeOf(part);
      const outside = place ? found.binds.filter((id) => codeParts.get(id)?.kind !== "external" && !codeChain(id).some((up) => place.includes(up))) : [];
      results.push({ id: part.id, level: part.level, status: outside.length ? "moved" : part.status && part.status !== "unchanged" ? "changed" : "matched", code: found.binds, ...(outside.length ? { outside } : {}), ...extra });
    } else if (found.primary.length) {
      results.push({ id: part.id, level: part.level, status: "moved", code: found.primary, how: part.status, ...extra });
    } else {
      results.push({ id: part.id, level: part.level, status: "missing", code: [], absorbs: found.from, ...extra });
    }
  }
  const moduleIds = new Set(parts.filter((part) => part.level === "module").map((part) => part.id));
  for (const part of code.parts) if (part.level === "module" && !homes[part.id] && !moduleIds.has(part.id)) results.push({ id: part.id, level: "module", status: "unplanned", code: [part.id] });

  // Today's links, redrawn between the intended parts that will hold their code.
  const rules = intended.rules ?? [];
  const starts = (id, list) => (list ?? []).some((prefix) => id.startsWith(prefix));
  const prefixRules = rules.filter((rule) => !rule.check || rule.check === "forbid");
  const broken = (from, to) => prefixRules.filter((rule) => starts(from, rule.from) && starts(to, rule.to) && !starts(to, rule.except_to) && !starts(from, rule.except_from)).map((rule) => rule.id);
  const mapTo = (id) => (moduleIds.has(id) ? id : homes[id] ?? null);
  const codeLinks = code.links.filter((link) => link.category !== "build");
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
  const todayLinks = [...today.values()];
  const links = [];
  for (const link of intended.links ?? []) {
    if (link.category === "build") continue;
    const via = todayLinks.filter((entry) => intendedChain(entry.from).includes(link.from) && intendedChain(entry.to).includes(link.to));
    links.push({ from: link.from, to: link.to, status: via.length ? "matched" : "missing", nature: link.nature, ...(via.length ? { kinds: unique(via.flatMap((entry) => entry.kinds)) } : {}) });
  }

  // Rules: prefix rules on today's redrawn links; code rules on the code's own links; reach rules on
  // the dependency closure the code document records; judged rules from a recorded answer.
  const answerOf = (rule) => {
    const answer = rule.answer;
    if (!answer) return null;
    if (answer.checked?.commit !== code.source.commit) return { status: "stale", note: `Answered at another commit (${String(answer.checked?.commit ?? "unknown").slice(0, 7)}).`, answer };
    if (!answer.checked.current) return { status: "stale", note: "The source lines the answer relied on have changed.", answer };
    return { status: answer.result === "conforms" ? "holds" : answer.result === "diverges" ? "broken" : "needs-judgement", answer };
  };
  // Code rules read the extractor's facts by its own ids, plus the assumptions the intended document
  // recorded (a program chosen at runtime, for example) while the lines they rest on are unchanged.
  const assumptions = (intended.assumptions ?? []).filter((item) => item.checked?.commit === code.source.commit && item.checked.current);
  const facts = [...(code.extracted?.links ?? []), ...assumptions.map((item) => ({ kind: item.kind, from: item.from, to: item.to, at: item.evidence?.[0] ? `${item.evidence[0].path}:${item.evidence[0].line}` : null, assumed: item.note ?? true }))];
  const factIds = [...new Set([...(code.extracted?.nodes ?? []), ...facts.flatMap((link) => [link.from, link.to])])];
  const ruleResults = rules.map((rule) => {
    const check = rule.check ?? "forbid";
    const base = { id: rule.id, check };
    if (check === "forbid") {
      const violations = todayLinks.filter((link) => link.breaks.includes(rule.id)).map((link) => ({ from: link.from, to: link.to, count: link.count }));
      return { ...base, status: violations.length ? "broken" : "holds", violations };
    }
    if (check === "forbid_code" || check === "require_code") {
      const select = (list) => new Set((list ?? []).flatMap((pattern) => factIds.filter((id) => wildcard(pattern).test(id))));
      const from = select(rule.from), to = select(rule.to), allow = new Set(rule.allow ?? []);
      const matching = facts.filter((link) => from.has(link.from) && to.has(link.to) && (!rule.kinds?.length || rule.kinds.includes(link.kind)));
      if (check === "require_code") return { ...base, status: matching.length ? "holds" : "broken", found: matching.map(({ kind, from, to, at }) => ({ kind, from, to, at })) };
      const violations = matching.filter((link) => !allow.has(link.to)).map(({ kind, from, to, at, assumed }) => ({ kind, from, to, at, ...(assumed ? { assumed } : {}) }));
      const answered = violations.length ? answerOf(rule) : null;
      return { ...base, status: answered && answered.status !== "stale" ? answered.status : violations.length ? "broken" : "holds", violations, ...(answered ? { answer: answered.answer, note: answered.note } : {}) };
    }
    if (check === "forbid_reach") {
      const crate = code.reach?.[rule.from] ? rule.from : resolve(rule.from)[0];
      const reached = code.reach?.[crate];
      if (!reached) return { ...base, status: "unchecked", note: `The code document records no dependency closure for ${rule.from}.` };
      const patterns = (rule.to ?? []).map(wildcard);
      const violations = reached.filter((name) => patterns.some((regex) => regex.test(name))).map((name) => ({ package: name }));
      return { ...base, status: violations.length ? "broken" : "holds", checked: reached.length, violations };
    }
    const answered = answerOf(rule);
    return { ...base, status: answered?.status ?? "needs-judgement", question: rule.question ?? null, ...(answered ? { answer: answered.answer, note: answered.note } : {}) };
  });

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
  return {
    schema: "architecture/v1",
    kind: "comparison",
    intended: intended.source,
    code: code.source,
    summary: {
      matched: count(results, "matched"),
      changed: count(results, "changed"),
      moved: count(results, "moved"),
      missing: count(results, "missing"),
      unplanned: count(results, "unplanned"),
      links_missing: count(links, "missing"),
      links_breaking_rules: count(todayLinks, "breaks-rule"),
      interfaces_changed: count(interfaces, "changed"),
      interfaces_missing: count(interfaces, "missing"),
      rules_holding: count(ruleResults, "holds"),
      rules_broken: count(ruleResults, "broken"),
      rules_needing_judgement: count(ruleResults, "needs-judgement"),
      rules_stale: count(ruleResults, "stale"),
      rules_unchecked: count(ruleResults, "unchecked"),
      stale: stale.length,
    },
    homes,
    parts: results,
    links,
    today: todayLinks,
    rules: ruleResults,
    interfaces,
    contested,
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
      app: code.source.app ?? null, layer: code.source.layer ?? null, view: code.view ?? {},
      intended: intended ? { title: intended.source?.title ?? null, tab: intended.source?.tab ?? null } : null,
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
      summary: intended.source?.summary ?? null,
      specs: intended.source?.specs ?? [],
      gaps: intended.gaps ?? [],
      assumptions: intended.assumptions ?? [],
      concepts: of(intended, "concept").map(strip),
      containers: of(intended, "container").map(({ level, parent, ...rest }) => ({ ...rest, concept: parent })),
      slices: of(intended, "feature").map(({ level, parent, ...rest }) => ({ ...rest, container: parent })),
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

module.exports = { LEVELS, toDocuments, compareDocuments, modelFrom, resolver };
