// App atlas: joins generated code facts with a small hand-written layer and renders one map.
// Facts come from ../architecture-map (observe.cjs). Everything a person wrote lives in layer/.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { observe, lockReach } = require("../architecture-map/observe.cjs");
const { merges } = require("../architecture-map/history.cjs");
const { parse, stringify } = require("../architecture-map/yaml.cjs");
const { toDocuments, compareDocuments, modelFrom } = require("./format.cjs");

const TOOL_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_APP = path.join(__dirname, "apps", "voyager");
const LAYER_FILES = ["concepts.yaml", "modules.yaml", "pathways.yaml", "proposals.yaml", "proposed.yaml", "interfaces.yaml"];
const EXCERPT_BEFORE = 3;
const EXCERPT_AFTER = 12;
const FINGERPRINT_LINES = 12;

const gitIn = (repository) => (args, options = {}) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", maxBuffer: 1 << 28, ...options });
const digest = (text, size = 12) => crypto.createHash("sha256").update(text).digest("hex").slice(0, size);

function options(argv) {
  const out = { command: argv[0] };
  for (let index = 1; index < argv.length; index += 2) out[argv[index].replace(/^--/, "")] = argv[index + 1];
  return out;
}

// An app is a folder with atlas.yaml (where the code is, how to read it, how to show it),
// layer/ (the hand-written meaning) and optionally runs/ (traced runs).
function loadApp(dir = DEFAULT_APP, overrides = {}) {
  const root = path.resolve(dir);
  const config = parse(fs.readFileSync(path.join(root, "atlas.yaml"), "utf8")) ?? {};
  const source = overrides.source ? path.resolve(overrides.source) : config.source ? path.resolve(root, config.source) : null;
  if (!source) throw new Error(`${config.name ?? root}: atlas.yaml names no source checkout; pass --source DIR`);
  const extractor = typeof config.extractor === "string" ? JSON.parse(fs.readFileSync(path.resolve(root, config.extractor), "utf8")) : config.extractor;
  return {
    root,
    config,
    source,
    extractor,
    layerDir: overrides.layer ? path.resolve(overrides.layer) : path.join(root, "layer"),
    runsDir: path.join(root, "runs"),
    git: gitIn(source),
  };
}

function loadLayer(dir) {
  const layer = {};
  for (const file of LAYER_FILES) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    const data = parse(fs.readFileSync(full, "utf8")) ?? {};
    for (const [key, value] of Object.entries(data)) {
      if (key === "schema" || key === "note") continue;
      if (Array.isArray(value)) layer[key] = [...(layer[key] ?? []), ...value];
      else layer[key] = { ...(layer[key] ?? {}), ...value };
    }
  }
  return layer;
}

function sourceReader(git, commit) {
  const cache = new Map();
  return (file) => {
    if (!cache.has(file)) {
      let text = null;
      try {
        text = git(["show", `${commit}:${file}`], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        text = null;
      }
      cache.set(file, text === null ? null : text.split("\n"));
    }
    return cache.get(file);
  };
}

// An anchor is {path, find}. It resolves when `find` occurs on exactly one line at the commit.
function anchorResolver(read, lock) {
  const anchors = {};
  const resolve = (at) => {
    if (!at || !at.path) return null;
    const find = at.find === undefined || at.find === null ? null : String(at.find);
    const id = digest(`${at.path}#${find ?? ""}#${at.after ?? ""}`);
    if (anchors[id]) return id;
    const lines = read(at.path);
    const entry = { id, path: at.path, find, line: null, status: "current" };
    if (!lines) entry.status = "missing-file";
    else if (find === null) entry.line = 1;
    else {
      // `after` names a unique line; the anchor is the first `find` at or below it.
      let from = 0;
      if (at.after) {
        const starts = [];
        lines.forEach((text, index) => {
          if (text.includes(String(at.after))) starts.push(index);
        });
        from = starts.length === 1 ? starts[0] : -1;
      }
      const hits = [];
      if (from >= 0)
        lines.forEach((text, index) => {
          if (index >= from && text.includes(find)) hits.push(index + 1);
        });
      if (at.after && hits.length > 1) hits.length = 1;
      if (hits.length === 0) entry.status = "missing";
      else if (hits.length > 1) {
        entry.status = "ambiguous";
        entry.line = at.line && hits.includes(at.line) ? at.line : hits[0];
      } else entry.line = hits[0];
    }
    if (lines && entry.line) {
      const start = Math.max(1, entry.line - EXCERPT_BEFORE);
      const end = Math.min(lines.length, entry.line + EXCERPT_AFTER);
      entry.excerpt = { start, lines: lines.slice(start - 1, end) };
      entry.fingerprint = digest(lines.slice(entry.line - 1, entry.line - 1 + FINGERPRINT_LINES).join("\n"), 16);
      const recorded = lock?.[id];
      if (entry.status === "current" && recorded && recorded !== entry.fingerprint) entry.status = "changed";
      if (entry.status === "current" && lock && !recorded) entry.status = "unreviewed";
    }
    anchors[id] = entry;
    return id;
  };
  return { anchors, resolve };
}

const CODE_EDGES = new Set(["uses", "imports", "exposes", "embeds", "includes"]);
const BUILD_EDGES = new Set(["generates", "generated_from", "runs"]);
const RUNTIME_EDGES = new Set(["spawns"]);

function collect(revision, app) {
  const { git, layerDir, config } = app;
  const mapConfig = app.extractor;
  const commit = git(["rev-parse", revision]).trim();
  const observed = observe(app.source, commit, mapConfig).observed;
  const layer = loadLayer(layerDir);
  const lockFile = path.join(layerDir, "anchors.lock.yaml");
  const lock = fs.existsSync(lockFile) ? parse(fs.readFileSync(lockFile, "utf8"))?.anchors ?? {} : null;
  const read = sourceReader(git, commit);
  const { anchors, resolve } = anchorResolver(read, lock);
  const problems = [];

  const byId = new Map(observed.nodes.map((node) => [node.id, node]));
  const concepts = (layer.concepts ?? []).map((concept) => ({ ...concept, scopeAt: resolve(concept.scope_at), entryAt: resolve(concept.entry_at) }));
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const features = layer.features ?? [];
  const featureIds = new Set(features.map((feature) => feature.id));

  const crateAlias = config.aliases ?? {};
  const crateNotes = new Map((layer.crates ?? []).map((entry) => [crateAlias[entry.id] ?? entry.id, entry]));
  const containers = (layer.containers ?? []).map((base) => {
    const note = crateNotes.get(base.id) ?? {};
    const container = { ...note, ...base, plain: base.plain ?? note.plain, scope: base.scope ?? note.scope, scope_at: base.scope_at ?? note.scope_at, entry: base.entry ?? note.entry, entry_at: base.entry_at ?? note.entry_at, why: base.why ?? note.why, inferred: base.inferred ?? note.inferred, id: base.id };
    if (!conceptIds.has(container.concept)) problems.push({ kind: "container-concept", id: container.id });
    return { ...container, scopeAt: resolve(container.scope_at), entryAt: resolve(container.entry_at), observed: byId.has(container.id) };
  });
  const containerIds = new Set(containers.map((container) => container.id));

  // Modules: Rust modules, binaries, scripts and host modules from the generated facts, plus external stand-ins from the layer.
  const notes = new Map((layer.modules ?? []).map((entry) => [entry.id, entry]));
  const containerOf = (node) => {
    const override = notes.get(node.id)?.container;
    if (override) return override;
    if (node.kind === "host-module" && config.host_modules) return config.host_modules;
    let parent = node.parent;
    while (parent && !containerIds.has(parent)) parent = byId.get(parent)?.parent;
    return parent ?? null;
  };
  const moduleKinds = new Set(["module", "binary", "script", "host-module"]);
  const modules = [];
  for (const node of observed.nodes.filter((item) => moduleKinds.has(item.kind))) {
    const note = notes.get(node.id) ?? {};
    const container = containerOf(node);
    if (!container) {
      problems.push({ kind: "module-container", id: node.id });
      continue;
    }
    const lines = node.file ? read(node.file) : null;
    const isRoot = node.kind === "module" && !node.id.includes("::");
    const shared = !isRoot && node.file && observed.nodes.some((other) => other !== node && moduleKinds.has(other.kind) && other.file === node.file);
    modules.push({
      id: node.id,
      kind: node.kind,
      name: note.name ?? node.name.replace(" (crate root)", ""),
      file: node.file ?? null,
      size: lines && !shared ? lines.length - (lines.at(-1) === "" ? 1 : 0) : null,
      inline: Boolean(shared),
      container,
      feature: note.feature ?? null,
      plain: note.plain ?? null,
      holds: note.holds ?? null,
      why: note.why ?? null,
      inferred: Boolean(note.inferred),
      note: note.note ?? null,
      talks_to: note.talks_to ?? null,
      entry: note.entry ? { fn: note.entry.fn, plain: note.entry.plain, at: resolve(note.entry) } : null,
      key: (note.key ?? []).map((item) => ({ fn: item.fn, plain: item.plain, at: resolve(item) })),
      sections: (note.sections ?? []).map((item) => ({ name: item.name, plain: item.plain, at: resolve(item) })),
      experiment: Boolean(node.file && node.file.startsWith("experiments/")),
    });
    if (!note.feature) problems.push({ kind: "module-feature", id: node.id });
    else if (!featureIds.has(note.feature)) problems.push({ kind: "unknown-feature", id: node.id, feature: note.feature });
  }
  for (const external of layer.externals ?? []) {
    modules.push({ ...external, kind: "external", file: null, size: null, entry: null, key: [], sections: [], at: resolve(external.at) });
  }
  const moduleIds = new Set(modules.map((module) => module.id));
  for (const id of notes.keys()) if (!moduleIds.has(id)) problems.push({ kind: "orphan-note", id });

  // Functions: every named function in module notes and pathway steps.
  const functions = new Map();
  const fileToModule = new Map();
  for (const module of modules) if (module.file && !module.inline) fileToModule.set(module.file, module.id);
  const addFunction = (name, moduleId, anchorId, plain) => {
    if (!name || !moduleId) return null;
    const id = `fn:${moduleId}#${name}`;
    const existing = functions.get(id);
    if (existing) {
      if (!existing.plain && plain) existing.plain = plain;
      if (!existing.at && anchorId) existing.at = anchorId;
      return id;
    }
    functions.set(id, { id, module: moduleId, fn: name, at: anchorId, plain: plain ?? null });
    return id;
  };
  for (const module of modules) {
    if (module.entry) module.entry.id = addFunction(module.entry.fn, module.id, module.entry.at, module.entry.plain);
    for (const item of module.key) item.id = addFunction(item.fn, module.id, item.at, item.plain);
  }

  // Pathways: resolve each step to a module and function; check the step's file belongs to its module.
  const pathways = (layer.pathways ?? []).map((pathway) => {
    const mapStep = (step) => {
      const at = resolve(step.at);
      let moduleId = step.module;
      const file = step.at?.path;
      if (file && fileToModule.has(file) && fileToModule.get(file) !== moduleId) {
        problems.push({ kind: "step-module", id: step.id, said: moduleId, file, actual: fileToModule.get(file) });
        moduleId = fileToModule.get(file);
      }
      if (!moduleIds.has(moduleId)) problems.push({ kind: "step-unknown-module", id: step.id, module: moduleId });
      return { ...step, at, module: moduleId, function: addFunction(step.fn, moduleId, at, null) };
    };
    return {
      ...pathway,
      steps: (pathway.steps ?? []).map(mapStep),
      branches: (pathway.branches ?? []).map((branch) => ({ ...branch, steps: (branch.steps ?? []).map(mapStep) })),
    };
  });

  // Edges at module level: generated relationships plus runtime hops from the layer and from pathways.
  const edgeMap = new Map();
  const addEdge = (from, to, category, kind, detail = {}) => {
    if (!from || !to || from === to || !moduleIds.has(from) || !moduleIds.has(to)) return;
    const key = `${category}|${from}|${to}`;
    const edge = edgeMap.get(key) ?? { from, to, category, kinds: [], count: 0, evidence: [], hops: [], notes: [] };
    if (!edge.kinds.includes(kind)) edge.kinds.push(kind);
    edge.count += detail.count ?? 1;
    for (const item of detail.evidence ?? []) if (edge.evidence.length < 8) edge.evidence.push({ kind, ...item });
    if (detail.hop) edge.hops.push(detail.hop);
    if (detail.note && !edge.notes.some((note) => note.plain === detail.note.plain)) edge.notes.push(detail.note);
    if (detail.interface && !(edge.interfaces ??= []).includes(detail.interface)) edge.interfaces.push(detail.interface);
    edgeMap.set(key, edge);
  };
  const lift = (id) => {
    if (moduleIds.has(id)) return id;
    const node = byId.get(id);
    if (!node) return null;
    if (node.kind === "program") return (layer.externals ?? []).find((external) => (external.programs ?? []).includes(id))?.id ?? null;
    if (node.kind === "package") return modules.find((module) => module.container === id && /main\.ts$/.test(module.file ?? ""))?.id ?? null;
    if (config.lift?.[id]) return config.lift[id];
    if (node.kind === "runtime-module") return (layer.externals ?? []).find((external) => (external.runtime_modules ?? []).includes(id))?.id ?? null;
    if (node.kind === "dependency") return (layer.externals ?? []).find((external) => (external.crates ?? []).includes(id))?.id ?? null;
    return null;
  };
  for (const edge of observed.edges) {
    const category = CODE_EDGES.has(edge.kind) ? "code" : BUILD_EDGES.has(edge.kind) ? "build" : RUNTIME_EDGES.has(edge.kind) ? "runtime" : edge.kind === "uses_crate" ? "code" : null;
    if (!category) continue;
    const from = lift(edge.from);
    const to = lift(edge.to);
    addEdge(from, to, category, edge.kind, { count: edge.occurrences ?? 1, evidence: (edge.evidence ?? []).slice(0, 3).map((item) => ({ path: item.path, line: item.line, text: item.text })) });
  }
  for (const runtime of layer.runtime ?? []) {
    addEdge(runtime.from, runtime.to, "runtime", runtime.via, { note: { plain: runtime.plain, at: resolve(runtime.at) } });
  }
  // Interfaces: named connections with the shape of what passes and why. Each adds a runtime link
  // between its modules so it can be clicked even where no code reference exists.
  const stepIds = new Set(pathways.flatMap((pathway) => [...pathway.steps, ...pathway.branches.flatMap((branch) => branch.steps)].map((step) => step.id)));
  const coreRuns = fs.existsSync(app.runsDir) ? fs.readdirSync(app.runsDir).filter((file) => file.endsWith("-core.json")).sort().map((file) => JSON.parse(fs.readFileSync(path.join(app.runsDir, file), "utf8"))) : [];
  const interfaces = (layer.interfaces ?? []).map((item) => {
    for (const id of [...(item.from ?? []), ...(item.to ?? [])]) if (!moduleIds.has(id)) problems.push({ kind: "interface-unknown-module", id: `${item.id}:${id}` });
    for (const id of item.steps ?? []) if (!stepIds.has(id)) problems.push({ kind: "interface-unknown-step", id: `${item.id}:${id}` });
    const side = (part) => (part ? { ...part, typeAt: resolve(part.type_at) } : null);
    const observed = (item.observed_core ?? []).map((method) => {
      const run = coreRuns.find((entry) => entry.methods[method] || entry.notifications[method]);
      const found = run?.methods[method] ?? run?.notifications[method];
      if (!found) problems.push({ kind: "interface-unobserved-method", id: `${item.id}:${method}` });
      return found ? { method, run: run.id, count: found.count, request: found.request ?? found.example, result: found.result, error: found.error } : null;
    }).filter(Boolean);
    return { ...item, request: side(item.request), response: side(item.response), at: resolve(item.at), observed };
  });
  for (const item of interfaces) for (const from of item.from ?? []) for (const to of item.to ?? []) addEdge(from, to, "runtime", item.mechanism ?? "interface", { interface: item.id });
  for (const pathway of pathways) {
    const walk = (steps) => {
      for (let index = 1; index < steps.length; index += 1) {
        addEdge(steps[index - 1].module, steps[index].module, "runtime", steps[index].via, { hop: { pathway: pathway.id, step: index } });
      }
    };
    walk(pathway.steps);
  }

  // Proposals and glossary pass through with anchors resolved.
  const countLines = (item) => {
    const paths = item.paths ?? [item.path];
    const perFile = paths.map((file) => ({ path: file, count: (read(file) ?? []).filter((line) => line.includes(String(item.count))).length }));
    return { text: String(item.count), total: perFile.reduce((sum, entry) => sum + entry.count, 0), files: perFile.filter((entry) => entry.count) };
  };
  const proposals = (layer.proposals ?? []).map((proposal) => ({
    ...proposal,
    evidence: (proposal.evidence ?? []).map((item) => (item.count !== undefined ? { plain: item.plain, count: countLines(item) } : { plain: item.plain, at: resolve(item) })),
  }));

  const slices = [];
  const sliceSet = new Set();
  for (const module of modules) {
    const id = `fs:${module.container}|${module.feature ?? "unassigned"}`;
    module.slice = id;
    if (!sliceSet.has(id)) {
      sliceSet.add(id);
      slices.push({ id, container: module.container, feature: module.feature ?? "unassigned" });
    }
  }

  const entryPoints = (layer.entry_points ?? []).map((entry) => ({ ...entry, at: resolve(entry.at) }));
  const runs = attachRuns(pathways, app.runsDir, problems);
  const proposed = buildProposed(layer, modules, moduleIds, [...edgeMap.values()], features, problems);
  const history = buildHistory(app, commit, fileToModule);
  const anchorProblems = Object.values(anchors).filter((anchor) => !["current", "unreviewed"].includes(anchor.status));
  return {
    meta: {
      commit,
      short: commit.slice(0, 7),
      date: git(["log", "-1", "--format=%cs", commit]).trim(),
      repository: mapConfig.repository,
      app: config.name ?? null,
      layer: path.relative(TOOL_ROOT, layerDir).split(path.sep).join("/"),
      proposal: config.proposal ?? null,
      view: config.view ?? {},
      observedGenerator: observed.provenance.generator,
      counts: { modules: modules.length, functions: functions.size, edges: edgeMap.size, pathways: pathways.length, anchors: Object.keys(anchors).length },
      locked: Boolean(lock),
    },
    concepts,
    containers,
    features,
    slices,
    modules,
    functions: [...functions.values()],
    edges: [...edgeMap.values()],
    pathways,
    proposals,
    glossary: layer.glossary ?? [],
    entryPoints,
    proposed,
    runs,
    interfaces,
    coreRuns: coreRuns.map(({ methods, notifications, ...rest }) => ({ ...rest, methods: Object.fromEntries(Object.entries(methods).map(([name, entry]) => [name, entry.count])) })),
    reading: layer.reading ?? [],
    history,
    anchors,
    problems: [...problems, ...anchorProblems.map((anchor) => ({ kind: `anchor-${anchor.status}`, id: `${anchor.path}#${anchor.find}` }))],
  };
}

// The architecture after the proposals: proposed modules replace the current modules they claim;
// unclaimed modules stay. Today's links are redrawn between the new homes and checked against the rules.
function buildProposed(layer, modules, moduleIds, edges, features, problems) {
  const entries = layer.proposed_modules ?? [];
  if (!entries.length) return null;
  const byId = new Map(modules.map((module) => [module.id, module]));
  const home = new Map();
  const changes = new Map();
  for (const entry of entries) if (byId.has(entry.id) && !entry.container) changes.set(entry.id, entry);
  const created = entries.filter((entry) => !changes.has(entry.id));
  const primaries = new Set(created.flatMap((entry) => entry.primary ?? []));
  for (const entry of created) {
    for (const source of entry.from ?? []) {
      if (!moduleIds.has(source)) problems.push({ kind: "proposed-unknown-source", id: entry.id, source });
      if ((entry.primary ?? []).includes(source)) home.set(source, entry.id);
    }
  }
  for (const entry of created) for (const source of entry.from ?? []) if (!home.has(source) && primaries.has(source)) home.set(source, entry.id);
  const featureIds = new Set([...features.map((feature) => feature.id), ...(layer.proposed_features ?? []).map((feature) => feature.id)]);
  const out = [];
  for (const module of modules) {
    if (primaries.has(module.id)) continue;
    const change = changes.get(module.id);
    out.push({ ...module, status: change?.status ?? "unchanged", plain: change?.plain ?? module.plain, proposals: change?.proposals ?? [], from: [module.id], current: module.id });
  }
  for (const entry of entries) {
    if (changes.has(entry.id)) continue;
    if (!featureIds.has(entry.feature)) problems.push({ kind: "proposed-unknown-feature", id: entry.id, feature: entry.feature });
    out.push({ id: entry.id, kind: "proposed", name: entry.name, container: entry.container, feature: entry.feature, status: entry.status, plain: entry.plain, proposals: entry.proposals ?? [], from: entry.from ?? [], primary: entry.primary ?? [], size: (entry.from ?? []).filter((source) => (entry.primary ?? []).includes(source)).reduce((sum, source) => sum + (byId.get(source)?.size ?? 0), 0) || null });
  }
  for (const module of out) module.slice = `fs:${module.container}|${module.feature ?? "unassigned"}`;
  const ids = new Set(out.map((module) => module.id));
  const mapTo = (id) => (ids.has(id) ? id : home.get(id) ?? null);
  const rules = layer.proposed_rules ?? [];
  const starts = (id, list) => (list ?? []).some((prefix) => id.startsWith(prefix));
  const broken = (from, to, category) => category === "build" ? [] : rules.filter((rule) => starts(from, rule.from) && starts(to, rule.to) && !starts(to, rule.except_to) && !starts(from, rule.except_from)).map((rule) => rule.id);
  const edgeMap = new Map();
  for (const edge of layer.proposed_edges ?? []) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      problems.push({ kind: "proposed-edge-endpoint", id: `${edge.from}->${edge.to}` });
      continue;
    }
    edgeMap.set(`proposed|${edge.from}|${edge.to}`, { from: edge.from, to: edge.to, category: edge.kind === "build" ? "build" : "proposed", kinds: [edge.kind ?? "proposed"], count: 1, nature: edge.nature, breaks: broken(edge.from, edge.to, edge.kind === "build" ? "build" : "proposed"), today: [] });
  }
  for (const edge of edges) {
    if (edge.category === "build") continue;
    const from = mapTo(edge.from);
    const to = mapTo(edge.to);
    if (!from || !to || from === to) continue;
    const key = `today|${from}|${to}`;
    const item = edgeMap.get(key) ?? { from, to, category: "today", kinds: [], count: 0, breaks: broken(from, to, "today"), today: [] };
    item.count += edge.count;
    for (const kind of edge.kinds) if (!item.kinds.includes(kind)) item.kinds.push(kind);
    if (item.today.length < 12) item.today.push({ from: edge.from, to: edge.to, kinds: edge.kinds, count: edge.count });
    edgeMap.set(key, item);
  }
  const homes = {};
  for (const module of modules) homes[module.id] = mapTo(module.id) ?? module.id;
  return { features: layer.proposed_features ?? [], modules: out, edges: [...edgeMap.values()], rules, homes, interfaces: layer.proposed_interfaces ?? [] };
}

// Runtime observations: each pathway shows the run in which most of its steps were seen.
function attachRuns(pathways, dir, problems) {
  if (!fs.existsSync(dir)) return [];
  const runs = fs.readdirSync(dir).filter((file) => file.endsWith(".json") && !file.endsWith("-core.json")).sort().map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  const seenCount = (steps) => Object.values(steps ?? {}).filter((step) => step.seen).length;
  for (const pathway of pathways) {
    const candidates = runs.filter((run) => run.steps[pathway.id]);
    const ids = new Set([...pathway.steps, ...pathway.branches.flatMap((branch) => branch.steps)].map((step) => step.id));
    for (const run of candidates) for (const id of Object.keys(run.steps[pathway.id])) if (!ids.has(id)) problems.push({ kind: "run-unknown-step", id: `${run.id}:${id}` });
    pathway.findings = runs.flatMap((run) => (run.findings ?? []).filter((finding) => finding.pathway === pathway.id).map((finding) => ({ ...finding, run: run.id })));
    if (!candidates.length) {
      if (pathway.not_run) pathway.run = pathway.not_run;
      continue;
    }
    const best = candidates.reduce((a, b) => (seenCount(b.steps[pathway.id]) > seenCount(a.steps[pathway.id]) ? b : a));
    const observations = best.steps[pathway.id];
    for (const step of [...pathway.steps, ...pathway.branches.flatMap((branch) => branch.steps)]) if (observations[step.id]) step.observed = { ...observations[step.id], run: best.id };
    const main = pathway.steps.map((step) => observations[step.id]).filter((entry) => entry?.checkable);
    pathway.run = `Run ${best.id}: ${main.filter((entry) => entry.seen).length} of ${main.length} steps inside voyager-shell were seen running. Script, Core and outside-program steps cannot be seen by the debugger.`;
  }
  return runs.map(({ steps, ...rest }) => rest);
}

function numstat(git, args) {
  const files = [];
  for (const line of git(args).split("\n")) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (match) files.push({ path: match[3], add: match[1] === "-" ? 0 : Number(match[1]), del: match[2] === "-" ? 0 : Number(match[2]) });
  }
  return files;
}

function buildHistory(app, commit, fileToModule) {
  const { git } = app;
  const mapConfig = app.extractor;
  const containerDirs = (app.config.paths ?? []).map((entry) => [entry.prefix, entry.container]);
  const place = (file) => {
    if (fileToModule.has(file)) return { module: fileToModule.get(file) };
    const container = containerDirs.find(([prefix]) => file.startsWith(prefix));
    return container ? { container: container[1] } : {};
  };
  const annotate = (files) => files.map((file) => ({ ...file, ...place(file.path) }));
  const prs = [];
  if (!mapConfig.history) return { from: null, prs: [] };
  for (const merge of merges(app.source, commit, mapConfig.history.from)) {
    const parents = git(["rev-list", "--parents", "-n", "1", merge.commit]).trim().split(" ").slice(1);
    const commits = [];
    if (parents.length === 2) {
      const list = git(["log", "--no-merges", "--reverse", "--format=%H%x09%cs%x09%s", `${parents[0]}..${parents[1]}`]).trim().split("\n").filter(Boolean);
      for (const row of list) {
        const [sha, date, subject] = row.split("\t");
        commits.push({ sha, date, subject, files: annotate(numstat(git, ["show", "--no-renames", "--numstat", "--format=", sha])) });
      }
    }
    const files = parents.length ? annotate(numstat(git, ["diff", "--no-renames", "--numstat", parents[0], merge.commit])) : [];
    prs.push({ pull: merge.pull, branch: merge.branch, title: merge.title, commit: merge.commit, date: git(["log", "-1", "--format=%cs", merge.commit]).trim(), files, commits });
  }
  return { from: mapConfig.history.from, prs };
}

// Build = read the code, write the architecture documents, then derive the page model from the documents alone.
function build(revision, app = loadApp()) {
  const documents = toDocuments(collect(revision, app));
  documents.comparison = documents.intended ? compareDocuments(documents.intended, documents.code) : null;
  return { documents, model: modelFrom(documents) };
}

function writeDocuments(documents, out) {
  for (const kind of ["code", "intended", "comparison"]) if (documents[kind]) fs.writeFileSync(path.join(out, `architecture.${kind}.yaml`), stringify(documents[kind]));
}

function readDocument(file) {
  return file ? parse(fs.readFileSync(file, "utf8")) : null;
}

function render(model) {
  const template = fs.readFileSync(path.join(__dirname, "view.html"), "utf8");
  const json = JSON.stringify(model).replace(/</g, "\\u003c");
  const title = String(model.meta.view?.title ?? (model.meta.app ? `${model.meta.app} atlas` : "App atlas")).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return template.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`).replace(/(<h1 id="apptitle">)[^<]*(<\/h1>)/, (_, a, b) => `${a}${title}${b}`).replace("/*ATLAS_DATA*/null", () => json);
}

function main(argv) {
  const args = options(argv);
  const revision = args.rev ?? "HEAD";
  const app = () => loadApp(args.app ?? DEFAULT_APP, { source: args.source, layer: args.layer });
  const out = path.resolve(args.out ?? path.join(__dirname, "out"));
  if (args.command === "build") {
    fs.mkdirSync(out, { recursive: true });
    const { documents, model } = build(revision, app());
    writeDocuments(documents, out);
    fs.writeFileSync(path.join(out, "atlas.json"), `${JSON.stringify(model, null, 1)}\n`);
    fs.writeFileSync(path.join(out, "atlas.html"), render(model));
    process.stdout.write(`${path.join(out, "atlas.html")}\n${model.problems.length} problem(s)\n`);
    return;
  }
  if (args.command === "render") {
    // Any producer that writes architecture/v1 documents can be viewed: no source checkout needed.
    const code = readDocument(args.code);
    const intended = readDocument(args.intended);
    const comparison = readDocument(args.comparison) ?? (intended ? compareDocuments(intended, code) : null);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "atlas.html"), render(modelFrom({ code, intended, comparison })));
    process.stdout.write(`${path.join(out, "atlas.html")}\n`);
    return;
  }
  if (args.command === "compare") {
    const comparison = compareDocuments(readDocument(args.intended), readDocument(args.code));
    const text = stringify(comparison);
    if (args.out) fs.writeFileSync(args.out, text);
    else process.stdout.write(text);
    return;
  }
  if (args.command === "check") {
    const { model } = build(revision, app());
    for (const problem of model.problems) process.stdout.write(`${JSON.stringify(problem)}\n`);
    process.stdout.write(`${model.meta.counts.anchors} anchors, ${model.problems.length} problem(s) at ${model.meta.short}\n`);
    process.exitCode = model.problems.length ? 1 : 0;
    return;
  }
  if (args.command === "lock") {
    const target = app();
    const { model } = build(revision, target);
    const anchors = {};
    for (const anchor of Object.values(model.anchors).sort((a, b) => a.id.localeCompare(b.id))) if (anchor.fingerprint) anchors[anchor.id] = anchor.fingerprint;
    fs.writeFileSync(path.join(target.layerDir, "anchors.lock.yaml"), stringify({ schema: "app-atlas/v0", commit: model.meta.commit, note: "Fingerprints of the source under each anchor when the layer was last reviewed. A changed fingerprint marks the claim for review.", anchors }));
    process.stdout.write(`${Object.keys(anchors).length} anchors locked at ${model.meta.short}\n`);
    return;
  }
  process.stderr.write("Usage: node atlas.cjs build|check|lock [--app DIR] [--source DIR] [--rev REV] [--out DIR]\n       node atlas.cjs render --code FILE [--intended FILE] [--comparison FILE] [--out DIR]\n       node atlas.cjs compare --intended FILE --code FILE [--out FILE]\n");
  process.exitCode = 2;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { build, collect, anchorResolver, loadLayer, loadApp };
