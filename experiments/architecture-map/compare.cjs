const fs = require("node:fs");
const { digest, lockReach } = require("./observe.cjs");

const STEPS = {
  depends_on: { steps: ["+depends_on", "+uses_crate", "+uses", "+imports"], last: ["+depends_on", "+uses_crate", "+uses", "+imports"] },
  calls: { steps: ["+uses", "+uses_crate", "+depends_on", "+imports", "-exposes", "+spawns"], last: ["+uses", "+uses_crate", "+depends_on", "+imports", "-exposes", "+spawns"] },
  spawns: { steps: ["+uses", "+spawns"], last: ["+spawns"] },
  generates: { steps: ["+generates", "+runs", "-generated_from", "-embeds", "-imports", "-uses"], last: ["+generates", "-generated_from", "-embeds", "-imports", "-uses"] },
  exposes: { steps: ["+exposes", "-imports", "+uses"], last: ["+exposes", "-imports"] },
  seeds: { steps: ["+embeds", "+uses", "+uses_crate", "+uses_location"], last: ["+embeds"] },
  embeds: { steps: ["+embeds"], last: ["+embeds"] },
  imports: { steps: ["+imports"], last: ["+imports"] },
};

function matcher(pattern) {
  const body = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}$`);
}

function fingerprint(evidence, read) {
  return digest(evidence.map((item) => `${item.path}:${item.line}:${read(item.path, item.line)}`).join("\n"), 16);
}

function compare(observed, intended, annotations, context) {
  const nodes = new Map(observed.nodes.map((node) => [node.id, node]));
  const edges = observed.edges.map((edge) => ({ ...edge }));
  const unresolved = new Map(observed.unresolved.map((item) => [item.id, item]));
  const resolutions = [];
  for (const entry of annotations?.resolutions ?? []) {
    const item = unresolved.get(entry.unresolved);
    const current = fingerprint(entry.evidence ?? [], context.read);
    const state = !item ? "orphaned" : current !== entry.fingerprint ? "stale" : "current";
    resolutions.push({ unresolved: entry.unresolved, state, to: entry.edge.to, note: entry.note });
    if (state !== "current") continue;
    if (!nodes.has(entry.edge.to)) nodes.set(entry.edge.to, { id: entry.edge.to, kind: entry.edge.to.split(":")[0], name: entry.edge.to.split(":").slice(1).join(":"), basis: "annotated", evidence: [] });
    edges.push({ id: `${entry.edge.kind}(${item.subject},${entry.edge.to})`, kind: entry.edge.kind, from: item.subject, to: entry.edge.to, basis: "annotated", note: entry.note, evidence: [item.evidence, ...(entry.evidence ?? [])].filter(Boolean) });
  }
  const children = new Map();
  for (const node of nodes.values()) {
    if (!node.parent) continue;
    if (!children.has(node.parent)) children.set(node.parent, []);
    children.get(node.parent).push(node.id);
  }
  const expand = (ids) => {
    const out = new Set();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id)) continue;
      out.add(id);
      stack.push(...(children.get(id) ?? []));
    }
    return out;
  };
  const select = (patterns) => {
    const regexes = (patterns ?? []).map(matcher);
    return [...nodes.keys()].filter((id) => regexes.some((regex) => regex.test(id))).sort();
  };
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  }
  const components = new Map(intended.components.map((item) => [item.id, item]));
  const bound = new Map();
  const componentResults = intended.components.map((component) => {
    const matched = [];
    const unmatched = [];
    for (const bind of component.binds ?? []) {
      const found = select([bind]);
      if (found.length) matched.push(...found);
      else unmatched.push(bind);
    }
    bound.set(component.id, expand(matched));
    const status = !(component.binds ?? []).length ? "unbound" : !matched.length ? "missing" : unmatched.length ? "partial" : "implemented";
    return { id: component.id, status, matched: [...new Set(matched)].sort(), unmatched };
  });
  const depth = (id) => {
    let level = 0;
    for (let current = components.get(id)?.parent; current; current = components.get(current)?.parent) level += 1;
    return level;
  };
  const owners = (nodeId) => {
    const covering = [...bound].filter(([, set]) => set.has(nodeId)).map(([id]) => id);
    const deepest = Math.max(-1, ...covering.map(depth));
    return covering.filter((id) => depth(id) === deepest).sort();
  };
  for (const result of componentResults) {
    const component = components.get(result.id);
    const childIds = intended.components.filter((item) => item.parent === component.id).map((item) => item.id);
    if (!childIds.length) continue;
    const claimed = new Set(childIds.flatMap((id) => [...bound.get(id)]));
    result.unclaimed = [...bound.get(component.id)]
      .filter((id) => !claimed.has(id) && ["module", "binary", "package", "generator", "artifact"].includes(nodes.get(id)?.kind) && !result.matched.includes(id))
      .filter((id) => !claimed.has(nodes.get(id)?.parent))
      .sort();
  }
  const search = (from, to, kind) => {
    const rule = STEPS[kind] ?? { steps: [], last: [] };
    const step = (id, spec) => {
      const direction = spec[0];
      const name = spec.slice(1);
      const list = direction === "+" ? outgoing.get(id) ?? [] : incoming.get(id) ?? [];
      return list.filter((edge) => edge.kind === name).map((edge) => ({ edge, next: direction === "+" ? edge.to : edge.from }));
    };
    for (const start of [...from].sort()) {
      for (const spec of rule.last) for (const hop of step(start, spec)) if (to.has(hop.next)) return [hop.edge.id];
    }
    for (const start of [...from].sort()) {
      for (const spec of rule.steps) {
        for (const hop of step(start, spec)) {
          if (from.has(hop.next)) continue;
          for (const last of rule.last) for (const second of step(hop.next, last)) if (to.has(second.next)) return [hop.edge.id, second.edge.id];
        }
      }
    }
    return null;
  };
  const relationResults = intended.relations.map((relation) => {
    const from = bound.get(relation.from) ?? new Set();
    const to = bound.get(relation.to) ?? new Set();
    if (!from.size || !to.size) return { id: relation.id, status: "unbound" };
    const found = search(from, to, relation.kind);
    return found ? { id: relation.id, status: "implemented", path: found } : { id: relation.id, status: "not-found" };
  });
  const decisions = new Map((annotations?.decisions ?? []).map((item) => [item.rule, item]));
  const ruleResults = intended.rules.map((rule) => {
    const check = rule.check ?? { type: "judged" };
    const decision = decisions.get(rule.id);
    const judged = () => {
      if (!decision) return { id: rule.id, result: "needs-judgment", question: check.question };
      const current = fingerprint(decision.evidence ?? [], context.read);
      if (current !== decision.fingerprint) return { id: rule.id, result: "stale", question: check.question, decision: { result: decision.result, rationale: decision.rationale, by: decision.by } };
      return { id: rule.id, result: decision.result, decision: { result: decision.result, rationale: decision.rationale, by: decision.by, evidence: decision.evidence } };
    };
    if (check.type === "judged") return judged();
    if (check.type === "forbid_reach") {
      const crate = nodes.get(check.from);
      if (!crate) return { id: rule.id, result: "needs-judgment", note: `${check.from} is not observed` };
      const reached = context.reach(crate.name);
      const patterns = check.to.map(matcher);
      const violations = reached.filter((name) => patterns.some((regex) => regex.test(name)));
      return { id: rule.id, result: violations.length ? "diverges" : "conforms", checked: `${reached.length} packages reachable in Cargo.lock`, violations: violations.map((name) => ({ package: name })) };
    }
    const from = new Set(select(check.from));
    const to = new Set(select(check.to));
    const allow = new Set(check.allow ?? []);
    const matching = edges.filter((edge) => from.has(edge.from) && to.has(edge.to) && (check.kinds ?? []).includes(edge.kind));
    if (check.type === "forbid_edge") {
      const violations = matching.filter((edge) => !allow.has(edge.to));
      const base = { id: rule.id, result: violations.length ? "diverges" : "conforms", checked: `${from.size} sources, ${to.size} targets`, violations: violations.map((edge) => ({ edge: edge.id, basis: edge.basis, evidence: edge.evidence?.[0] })) };
      if (violations.length && decision) {
        const decided = judged();
        if (decided.decision) return { ...base, result: decided.result === "stale" ? "stale" : decided.result, decision: decided.decision };
      }
      return base;
    }
    if (check.type === "require_edge") return { id: rule.id, result: matching.length ? "conforms" : "diverges", found: matching.map((edge) => edge.id) };
    return { id: rule.id, result: "needs-judgment", note: `Unknown check type ${check.type}` };
  });
  const significant = new Set(["crate", "binary", "module", "package", "generator", "artifact", "program", "host-module", "agent-tool", "source"]);
  const covered = new Set([...bound.values()].flatMap((set) => [...set]));
  const unspecifiedNodes = [...nodes.values()]
    .filter((node) => significant.has(node.kind) && !covered.has(node.id))
    .filter((node) => !covered.has(node.parent) || node.kind !== "module")
    .map((node) => node.id)
    .sort();
  const declared = new Set(intended.relations.flatMap((relation) => [`${relation.from}|${relation.to}`, `${relation.to}|${relation.from}`]));
  const ancestry = (a, b) => {
    for (let current = a; current; current = components.get(current)?.parent) if (current === b) return true;
    return false;
  };
  const pairs = new Map();
  for (const edge of edges) {
    if (["reads_env", "uses_location"].includes(edge.kind)) continue;
    const sources = owners(edge.from);
    if (!sources.length) continue;
    const targets = owners(edge.to);
    const add = (key, fields) => {
      if (!pairs.has(key)) pairs.set(key, { ...fields, count: 0, edges: [] });
      const pair = pairs.get(key);
      pair.count += 1;
      if (pair.edges.length < 6) pair.edges.push(edge.id);
    };
    if (!targets.length) {
      if (significant.has(nodes.get(edge.to)?.kind)) for (const source of sources) add(`${source}|${edge.to}`, { from: source, to: edge.to, target: "unspecified-node" });
      continue;
    }
    for (const source of sources) {
      for (const target of targets) {
        if (source === target || ancestry(source, target) || ancestry(target, source)) continue;
        let declaredPair = false;
        for (let a = source; a && !declaredPair; a = components.get(a)?.parent) for (let b = target; b && !declaredPair; b = components.get(b)?.parent) declaredPair = declared.has(`${a}|${b}`);
        if (!declaredPair) add(`${source}|${target}`, { from: source, to: target, target: "component" });
      }
    }
  }
  const citations = [];
  const sources = new Map(intended.sources.map((source) => [source.id, source]));
  const sourceLines = new Map();
  const sourceState = intended.sources.map((source) => {
    let text = null;
    try {
      text = fs.readFileSync(source.path, "utf8");
    } catch {
      return { id: source.id, path: source.path, state: "unreadable" };
    }
    sourceLines.set(source.id, text.split("\n"));
    return { id: source.id, path: source.path, state: digest(text) === source.sha256 ? "current" : "changed" };
  });
  const cited = [...intended.components, ...intended.relations, ...intended.rules];
  let checkedCitations = 0;
  for (const item of cited) {
    for (const cite of item.cite ?? []) {
      checkedCitations += 1;
      const lines = sourceLines.get(cite.source);
      const actual = lines ? (lines[cite.line - 1] ?? "").trim() : null;
      if (!sources.has(cite.source) || actual === null || !actual.startsWith(String(cite.text).trim())) citations.push({ item: item.id, source: cite.source, line: cite.line });
    }
  }
  const tally = (list, key) => list.reduce((out, item) => ({ ...out, [item[key]]: (out[item[key]] ?? 0) + 1 }), {});
  return {
    schema: "architecture-map/v0",
    layer: "comparison",
    provenance: {
      observed: { commit: observed.provenance.source.commit, generator: observed.provenance.generator.version },
      intended: sourceState,
      citations: { checked: checkedCitations, mismatched: citations },
    },
    summary: {
      components: tally(componentResults, "status"),
      relations: tally(relationResults, "status"),
      rules: tally(ruleResults, "result"),
      unspecified_nodes: unspecifiedNodes.length,
      unspecified_relations: pairs.size,
    },
    components: componentResults,
    relations: relationResults,
    rules: ruleResults,
    unspecified: {
      nodes: unspecifiedNodes,
      relations: [...pairs.values()].sort((a, b) => b.count - a.count || `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`)),
    },
    annotations: { resolutions },
  };
}

module.exports = { compare, fingerprint, matcher, lockReach };
