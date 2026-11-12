const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyse, modules, call, statementEnd, depthAt } = require("./rust.cjs");

const SCHEMA = "architecture-map/v0";
const TOOL_DIRECTORY = __dirname;

function glob(pattern) {
  const escape = (text) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = pattern
    .split("**/")
    .map((segment) =>
      segment
        .split("**")
        .map((part) => part.split("*").map(escape).join("[^/]*"))
        .join(".*"),
    )
    .join("(?:.*/)?");
  return new RegExp(`^${body}$`);
}

function digest(text, size = 64) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, size);
}

function toolVersion() {
  const files = fs
    .readdirSync(TOOL_DIRECTORY)
    .filter((name) => /\.(cjs|html|json)$/.test(name) && !name.endsWith("-test.cjs"))
    .sort();
  return digest(files.map((name) => `${name}\0${fs.readFileSync(path.join(TOOL_DIRECTORY, name), "utf8")}`).join("\0"), 16);
}

class Snapshot {
  constructor(repository, revision) {
    this.repository = repository;
    this.commit = this.git(["rev-parse", "--verify", `${revision}^{commit}`]).trim();
    this.tree = this.git(["rev-parse", `${this.commit}^{tree}`]).trim();
    this.blobs = new Map();
    for (const entry of this.git(["ls-tree", "-r", "-z", this.commit]).split("\0")) {
      const match = /^(\d+) blob ([0-9a-f]+)\t([\s\S]*)$/.exec(entry);
      if (match && match[1] !== "120000") this.blobs.set(match[3], match[2]);
    }
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-map-"));
    execFileSync("sh", ["-c", 'git -C "$1" archive "$2" | tar -x -C "$3"', "sh", repository, this.commit, this.root]);
    this.texts = new Map();
  }
  git(args) {
    return execFileSync("git", ["-C", this.repository, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });
  }
  has(file) {
    return this.blobs.has(file);
  }
  read(file) {
    if (!this.texts.has(file)) this.texts.set(file, fs.readFileSync(path.join(this.root, file), "utf8"));
    return this.texts.get(file);
  }
  line(file, number) {
    return (this.read(file).split("\n")[number - 1] ?? "").trim();
  }
  files(pattern) {
    const regex = glob(pattern);
    return [...this.blobs.keys()].filter((file) => regex.test(file)).sort();
  }
  close() {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}

class Graph {
  constructor(snapshot) {
    this.snapshot = snapshot;
    this.nodes = new Map();
    this.edges = new Map();
    this.unresolved = new Map();
    this.coverage = new Map();
    this.cited = new Set();
  }
  evidence(file, line) {
    this.cited.add(file);
    return { path: file, line, text: this.snapshot.line(file, line) };
  }
  node(id, fields, evidence) {
    if (!this.nodes.has(id)) this.nodes.set(id, { id, ...fields, evidence: [] });
    const node = this.nodes.get(id);
    if (evidence) this.attach(node, evidence);
    return node;
  }
  attach(target, evidence) {
    if (!target.evidence.some((item) => item.path === evidence.path && item.line === evidence.line)) target.evidence.push(evidence);
  }
  edge(kind, from, to, evidence, fields = {}) {
    const id = `${kind}(${from},${to})`;
    if (!this.edges.has(id)) this.edges.set(id, { id, kind, from, to, ...fields, occurrences: 0, evidence: [] });
    const edge = this.edges.get(id);
    edge.occurrences += 1;
    if (evidence) this.attach(edge, evidence);
    return edge;
  }
  count(token, outcome) {
    if (!this.coverage.has(token)) this.coverage.set(token, { total: 0, facts: 0, test: 0, unresolved: 0 });
    const entry = this.coverage.get(token);
    entry.total += 1;
    entry[outcome] += 1;
  }
  leave(id, fields) {
    if (!this.unresolved.has(id)) this.unresolved.set(id, { id, ...fields });
  }
}

function relative(from, target) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
}

function literal(text) {
  const match = /^\s*(?:b?r#*"([\s\S]*?)"#*|"((?:[^"\\]|\\.)*)")\s*,?\s*$/.exec(text);
  if (!match) return null;
  return match[1] ?? match[2];
}

function observeCargo(snapshot, graph, config) {
  if (!snapshot.has("Cargo.toml")) return [];
  const metadata = JSON.parse(
    execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps", "--offline", "--locked", "--manifest-path", path.join(snapshot.root, "Cargo.toml")], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const local = (absolute) => path.relative(snapshot.root, absolute).split(path.sep).join("/");
  const members = new Set(metadata.workspace_members);
  const crates = [];
  graph.node("group:external-crates", { kind: "container", name: "External crates", basis: "declared" });
  for (const pack of metadata.packages.filter((item) => members.has(item.id)).sort((a, b) => a.name.localeCompare(b.name))) {
    const manifest = local(pack.manifest_path);
    const directory = path.posix.dirname(manifest);
    const lines = snapshot.read(manifest).split("\n");
    const find = (pattern) => {
      const index = lines.findIndex((text) => pattern.test(text));
      return index < 0 ? null : graph.evidence(manifest, index + 1);
    };
    const features = Object.fromEntries(Object.entries(pack.features).filter(([name]) => name !== "default").sort());
    const crate = graph.node(
      `crate:${pack.name}`,
      { kind: "crate", name: pack.name, area: directory, file: manifest, basis: "declared", extract_by: "cargo-metadata", features: Object.keys(features).length ? features : undefined },
      find(new RegExp(`^\\s*name\\s*=\\s*"${pack.name}"`)),
    );
    const info = { name: pack.name, directory, crateId: crate.id, spaces: [], dependencies: new Map() };
    for (const dependency of pack.dependencies) {
      const key = dependency.rename ?? dependency.name;
      const ident = key.replace(/-/g, "_");
      const evidence = find(new RegExp(`^\\s*(${key.replace(/[-]/g, "\\-")}\\s*=|\\[[^\\]]*dependencies\\.${key}\\])`));
      if (dependency.kind === "dev") {
        info.dependencies.set(ident, null);
        continue;
      }
      const fields = { dependency_kind: dependency.kind ?? "normal", condition: dependency.target ?? undefined, optional: dependency.optional || undefined };
      if (dependency.path) {
        info.dependencies.set(ident, `crate:${dependency.name}`);
        graph.edge("depends_on", crate.id, `crate:${dependency.name}`, evidence, { basis: "declared", extract_by: "cargo-metadata", ...fields });
      } else {
        const id = `dep:${dependency.name}`;
        graph.node(id, { kind: "dependency", name: key === dependency.name ? dependency.name : `${key} (${dependency.name})`, parent: "group:external-crates", area: "external", basis: "declared", source: dependency.source ?? undefined });
        info.dependencies.set(ident, id);
        graph.edge("depends_on", crate.id, id, evidence, { basis: "declared", extract_by: "cargo-metadata", requirement: dependency.req, ...fields });
      }
    }
    for (const target of [...pack.targets].sort((a, b) => a.name.localeCompare(b.name))) {
      const source = local(target.src_path);
      if (target.kind.includes("lib")) {
        const ident = target.name.replace(/-/g, "_");
        graph.node(`rs:${ident}`, { kind: "module", name: `${ident} (crate root)`, parent: crate.id, area: directory, file: source, basis: "declared", extract_by: "cargo-metadata" }, graph.evidence(source, 1));
        info.spaces.push({ ident, root: `rs:${ident}`, prefix: `rs:${ident}`, file: source, lib: true });
      } else if (target.kind.includes("bin")) {
        const ident = target.name.replace(/-/g, "_");
        const declared = find(new RegExp(`^\\s*name\\s*=\\s*"${target.name}"`)) ?? graph.evidence(source, 1);
        graph.node(`bin:${target.name}`, { kind: "binary", name: target.name, parent: crate.id, area: directory, file: source, basis: "declared", extract_by: "cargo-metadata" }, declared);
        info.spaces.push({ ident, root: `bin:${target.name}`, prefix: `rs:${ident}`, file: source, lib: false });
      }
    }
    crates.push(info);
  }
  return crates;
}

function observeRust(snapshot, graph, config, crates) {
  const known = new Set();
  const analyses = new Map();
  const childNames = new Map();
  const segments = new Map();
  const spaceOf = new Map();
  const infoOf = new Map();
  const ownership = new Map();
  const testFiles = new Set();
  const libraries = new Map();
  for (const info of crates) for (const space of info.spaces) if (space.lib) libraries.set(space.ident, { info, space });
  const moduleId = (space, list) => (list.length ? `${space.prefix}::${list.join("::")}` : space.root);
  const walk = (info, space, file, id, list, modRs) => {
    if (!snapshot.has(file)) {
      graph.leave(`module-file@${id}`, { kind: "module-file", subject: id, reason: `Module source ${file} is not in the commit` });
      return;
    }
    const analysis = analyse(snapshot.read(file));
    analyses.set(file, { analysis, info, space, id });
    known.add(id);
    segments.set(id, list);
    spaceOf.set(id, space);
    infoOf.set(id, info);
    if (!childNames.has(id)) childNames.set(id, new Set());
    const declarations = modules(analysis);
    const inline = declarations.filter((item) => item.inline);
    const ranges = [];
    for (const declaration of declarations) {
      const chain = inline.filter((item) => item !== declaration && item.range[0] < declaration.start && item.range[1] > declaration.start).sort((a, b) => a.range[0] - b.range[0]);
      if (declaration.path !== null) graph.count("#[path]", declaration.test || chain.some((item) => item.test) ? "test" : "facts");
      if (declaration.test || chain.some((item) => item.test)) {
        if (!declaration.inline && !chain.length) {
          const directory = modRs ? path.posix.dirname(file) : path.posix.join(path.posix.dirname(file), path.posix.basename(file, ".rs"));
          testFiles.add(declaration.path !== null ? path.posix.normalize(path.posix.join(path.posix.dirname(file), declaration.path)) : path.posix.join(directory, `${declaration.name}.rs`));
        }
        continue;
      }
      const childList = [...list, ...chain.map((item) => item.name), declaration.name];
      const childId = moduleId(space, childList);
      const parentId = chain.length ? moduleId(space, [...list, ...chain.map((item) => item.name)]) : id;
      const parent = parentId === space.root && space.lib ? info.crateId : parentId;
      if (!childNames.has(parentId)) childNames.set(parentId, new Set());
      childNames.get(parentId).add(declaration.name);
      const conditions = declaration.conditions.length ? declaration.conditions : undefined;
      if (declaration.inline) {
        graph.node(childId, { kind: "module", name: declaration.name, parent, area: info.directory, file, inline: true, condition: conditions, basis: "parsed", extract_by: "rust:mod" }, graph.evidence(file, declaration.line));
        known.add(childId);
        segments.set(childId, childList);
        spaceOf.set(childId, space);
        infoOf.set(childId, info);
        if (!childNames.has(childId)) childNames.set(childId, new Set());
        ranges.push({ range: declaration.range, id: childId });
        continue;
      }
      const directory = modRs ? path.posix.dirname(file) : path.posix.join(path.posix.dirname(file), path.posix.basename(file, ".rs"));
      const base = path.posix.join(declaration.path !== null && chain.length === 0 ? path.posix.dirname(file) : directory, ...chain.map((item) => item.name));
      let childFile;
      let childModRs;
      if (declaration.path !== null) {
        childFile = path.posix.normalize(path.posix.join(base, declaration.path));
        childModRs = true;
      } else {
        childFile = [path.posix.join(base, `${declaration.name}.rs`), path.posix.join(base, declaration.name, "mod.rs")].find((candidate) => snapshot.has(candidate)) ?? path.posix.join(base, `${declaration.name}.rs`);
        childModRs = path.posix.basename(childFile) === "mod.rs";
      }
      const outside = !childFile.startsWith(`${info.directory}/`);
      graph.node(childId, { kind: "module", name: declaration.name, parent, area: info.directory, file: childFile, condition: conditions, source_outside_crate: outside || undefined, basis: "parsed", extract_by: declaration.path !== null ? "rust:mod+path" : "rust:mod" }, graph.evidence(file, declaration.path !== null ? declaration.pathLine : declaration.line));
      if (outside) {
        const sourceId = `source:${childFile}`;
        graph.node("group:experiment-sources", { kind: "container", name: "Sources outside product crates", basis: "parsed" });
        graph.node(sourceId, { kind: "source", name: childFile, parent: "group:experiment-sources", area: childFile.split("/")[0], file: childFile, basis: "parsed" });
        graph.edge("includes", parentId === space.root && space.lib ? space.root : parentId, sourceId, graph.evidence(file, declaration.pathLine), { basis: "parsed", extract_by: "rust:mod+path", condition: conditions });
      }
      walk(info, space, childFile, childId, childList, childModRs);
    }
    ownership.set(file, { id, ranges });
  };
  for (const info of crates) for (const space of info.spaces) walk(info, space, space.file, space.root, [], true);
  const constants = new Map();
  for (const [file, { analysis }] of analyses) {
    const pattern = /\bconst\s+([A-Z_][A-Z0-9_]*)\s*:\s*&(?:'static\s+)?str\s*=\s*(?:"([^"]*)"\s*;|r#*")/g;
    for (let match; (match = pattern.exec(analysis.masked)); ) constants.set(`${file}#${match[1]}`, { value: match[2] ?? null, file, line: analysis.line(match.index) });
  }
  const resolve = (ownerId, first, rest) => {
    const space = spaceOf.get(ownerId);
    const info = infoOf.get(ownerId);
    let targetSpace = space;
    let base;
    let tail = rest;
    if (first === "crate") base = [];
    else if (first === "self") base = segments.get(ownerId);
    else if (first === "super") {
      base = segments.get(ownerId).slice(0, -1);
      while (tail[0] === "super") (base = base.slice(0, -1)), (tail = tail.slice(1));
    } else if (libraries.has(first) && first !== space.ident) {
      targetSpace = libraries.get(first).space;
      base = [];
    } else if (childNames.get(ownerId)?.has(first)) {
      base = segments.get(ownerId);
      tail = [first, ...rest];
    } else if (libraries.has(first) && first === space.ident && !space.lib) {
      base = [];
    } else if (info.dependencies.get(first)) return info.dependencies.get(first);
    else return null;
    for (let size = tail.length; size >= 0; size -= 1) {
      const candidate = moduleId(targetSpace, [...base, ...tail.slice(0, size)]);
      if (known.has(candidate)) return candidate;
    }
    return null;
  };
  const constant = (file, ownerId, expression) => {
    const parts = expression.replace(/\s+/g, "").replace(/^&/, "").split("::");
    const name = parts.pop();
    if (!parts.length) return constants.get(`${file}#${name}`) ?? null;
    const target = resolve(ownerId, parts[0], parts.slice(1));
    const node = target && graph.nodes.get(target);
    return node?.file ? constants.get(`${node.file}#${name}`) ?? null : null;
  };
  const ownerOf = (file, position) => {
    const entry = ownership.get(file);
    const range = entry.ranges.filter((item) => item.range[0] < position && item.range[1] > position).sort((a, b) => b.range[0] - a.range[0])[0];
    return range ? range.id : entry.id;
  };
  const owned = (file, entry, position) => {
    const id = ownerOf(file, position);
    return id === entry.space.root && entry.space.lib ? entry.space.root : id;
  };
  const owner = (file) => {
    for (const pack of graph.packages ?? []) if (file.startsWith(`${pack.directory}/`)) return pack.id;
    for (const [output, id] of graph.artifacts ?? []) if (file === output || file.startsWith(`${output}/`)) return id;
    return null;
  };
  for (const [file, entry] of [...analyses].sort(([a], [b]) => a.localeCompare(b))) {
    const { analysis } = entry;
    const { bare, masked } = analysis;
    const paths = /(?<![\w:])([a-z_][a-z0-9_]*)\s*::\s*/g;
    for (let match; (match = paths.exec(bare)); ) {
      if (analysis.inTest(match.index)) continue;
      const lists = readPath(bare, match.index + match[0].length);
      const from = owned(file, entry, match.index);
      for (const rest of lists) {
        const target = resolve(ownerOf(file, match.index), match[1], rest);
        if (!target || target === from) continue;
        const kind = target.startsWith("dep:") || target.startsWith("crate:") ? "uses_crate" : "uses";
        graph.edge(kind, from, target, graph.evidence(file, analysis.line(match.index)), { basis: "parsed", extract_by: "rust:path" });
      }
    }
    const triggers = [
      ["Command::new(", /\bCommand\s*::\s*new\s*\(/g],
      ["HostModule::new(", /\bHostModule\s*::\s*new\s*\(/g],
      ["ComponentRegistry::new(", /\bComponentRegistry\s*::\s*new\s*\(/g],
      ["include_str!/include_bytes!(", /\binclude_(?:str|bytes)\s*!\s*\(/g],
      ["import_types!(", /\bimport_types\s*!\s*\(/g],
      ["env::var(", /\benv\s*::\s*var(?:_os)?\s*\(/g],
      ...config.locationRoots.map((root) => [`${root}.join(`, new RegExp(`\\b${root}\\s*\\.\\s*join\\s*\\(`, "g")]),
      ...config.structLiterals.map((rule) => [`${rule.type} {`, new RegExp(`(?<!struct\\s+)\\b${rule.type}\\s*\\{`, "g"), rule]),
    ];
    for (const [token, pattern, rule] of triggers) {
      for (let match; (match = pattern.exec(bare)); ) {
        if (analysis.inTest(match.index)) {
          graph.count(token, "test");
          continue;
        }
        const line = analysis.line(match.index);
        const evidence = graph.evidence(file, line);
        const from = owned(file, entry, match.index);
        const open = match.index + match[0].length - 1;
        const argument = call(analysis, open);
        const text = argument ? argument.text.trim() : "";
        const unresolved = (reason) => {
          graph.count(token, "unresolved");
          graph.leave(`${token}@${from}(${text.replace(/\s+/g, " ").slice(0, 60)})`, { kind: token, subject: from, argument: text.replace(/\s+/g, " ").slice(0, 120), reason, evidence });
        };
        if (token === "Command::new(") {
          const direct = literal(text);
          const fallback = /var_os\s*\(\s*"([A-Z0-9_]+)"\s*\)[\s\S]*?"([^"]+)"/.exec(text);
          const program = direct ?? fallback?.[2];
          if (!program) {
            unresolved("The program comes from a runtime value");
            continue;
          }
          const name = path.posix.basename(program);
          graph.node(`program:${name}`, { kind: "program", name, area: "external", basis: "parsed" });
          graph.edge("spawns", from, `program:${name}`, evidence, { basis: "parsed", extract_by: "rust:Command::new", override: fallback ? `env:${fallback[1]}` : undefined });
          if (fallback) {
            graph.node("group:environment", { kind: "container", name: "Environment variables", basis: "parsed" });
            graph.node(`env:${fallback[1]}`, { kind: "environment", name: fallback[1], parent: "group:environment", area: "external", basis: "parsed" });
          }
          graph.count(token, "facts");
        } else if (token === "HostModule::new(") {
          const named = literal(text) ?? constant(file, ownerOf(file, match.index), text)?.value;
          if (!named) {
            unresolved("The host module name is not a literal or a resolvable string constant");
            continue;
          }
          const functions = [];
          let declarations;
          const chains = [argument.close + 1];
          const binding = /\blet\s+(?:mut\s+)?(\w+)\s*=\s*$/.exec(masked.slice(Math.max(0, match.index - 80), match.index));
          const limit = enclosingEnd(analysis, match.index);
          if (binding) {
            const rebind = new RegExp(`\\b(?:let\\s+(?:mut\\s+)?)?${binding[1]}\\s*=\\s*${binding[1]}\\b`, "g");
            rebind.lastIndex = argument.close;
            for (let again; (again = rebind.exec(masked)) && again.index < limit; ) chains.push(again.index + again[0].length);
          }
          for (const start of chains) {
            const end = statementEnd(analysis, start);
            const chain = masked.slice(start, end);
            const builder = /\.\s*(async_function|function|declarations)\s*\(\s*/g;
            for (let step; (step = builder.exec(chain)); ) {
              if (depthAt(analysis, start, start + step.index) !== 0) continue;
              const inner = call(analysis, start + step.index + step[0].trimEnd().length - 1);
              if (!inner) continue;
              if (step[1] === "declarations") declarations = constant(file, ownerOf(file, match.index), inner.text.trim());
              else {
                const name = /^\s*"([^"]+)"/.exec(inner.text);
                if (name) functions.push(name[1]);
              }
            }
          }
          const id = `host-module:${named}`;
          graph.node("group:script-interface", { kind: "container", name: "Script modules from Rust", basis: "parsed" });
          const node = graph.node(id, { kind: "host-module", name: named, parent: "group:script-interface", area: "script-host", basis: "parsed", extract_by: "rust:HostModule" });
          node.functions = [...new Set([...(node.functions ?? []), ...functions])].sort();
          if (declarations) {
            node.declarations = { path: declarations.file, line: declarations.line, generated: (graph.artifacts ?? []).some(([output]) => declarations.file === output || declarations.file.startsWith(`${output}/`)) };
            graph.attach(node, graph.evidence(declarations.file, declarations.line));
          }
          graph.edge("exposes", from, id, evidence, { basis: "parsed", extract_by: "rust:HostModule", functions: functions.length });
          graph.count(token, "facts");
        } else if (token === "ComponentRegistry::new(") {
          const named = /"([^"]+)"\s*,?\s*$/.exec(text)?.[1];
          if (!named) {
            unresolved("The component module name is not a literal");
            continue;
          }
          graph.node("group:script-interface", { kind: "container", name: "Script modules from Rust", basis: "parsed" });
          graph.node(`host-module:${named}`, { kind: "host-module", name: named, parent: "group:script-interface", area: "script-host", provides: "components", basis: "parsed", extract_by: "rust:ComponentRegistry" });
          graph.edge("exposes", from, `host-module:${named}`, evidence, { basis: "parsed", extract_by: "rust:ComponentRegistry" });
          graph.count(token, "facts");
        } else if (token === "include_str!/include_bytes!(") {
          const value = literal(text);
          const target = value && relative(file, value);
          if (!target || !snapshot.has(target)) {
            unresolved("The embedded path is not a literal file in the commit");
            continue;
          }
          let id = owner(target);
          if (!id) {
            const directory = path.posix.dirname(target);
            id = `files:${directory}`;
            graph.node("group:embedded-files", { kind: "container", name: "Embedded files", basis: "parsed" });
            graph.node(id, { kind: "files", name: directory, parent: "group:embedded-files", area: directory.split("/")[0], basis: "parsed" });
          }
          const edge = graph.edge("embeds", from, id, evidence, { basis: "parsed", extract_by: "rust:include" });
          edge.files = [...new Set([...(edge.files ?? []), target])].sort();
          graph.count(token, "facts");
        } else if (token === "import_types!(") {
          const value = /"([^"]+)"/.exec(text)?.[1];
          const target = value && path.posix.join(entry.info.directory, value);
          const id = target && owner(target);
          if (!id) {
            unresolved("The schema path does not belong to a known generated artifact");
            continue;
          }
          graph.edge("generated_from", from, id, evidence, { basis: "parsed", extract_by: "rust:import_types", file: target });
          graph.count(token, "facts");
        } else if (token === "env::var(") {
          const name = literal(text);
          if (!name) {
            unresolved("The variable name is not a literal");
            continue;
          }
          graph.node("group:environment", { kind: "container", name: "Environment variables", basis: "parsed" });
          graph.node(`env:${name}`, { kind: "environment", name, parent: "group:environment", area: "external", basis: "parsed" });
          graph.edge("reads_env", from, `env:${name}`, evidence, { basis: "parsed", extract_by: "rust:env::var" });
          graph.count(token, "facts");
        } else if (rule) {
          const close = analysis.partner.get(open);
          const body = masked.slice(open + 1, close);
          const field = new RegExp(`\\b${rule.field}\\s*:\\s*"([^"]+)"`, "g");
          let name = null;
          for (let item; (item = field.exec(body)); ) if (depthAt(analysis, open + 1, open + 1 + item.index) === 0) name = name ?? item[1];
          if (!name) {
            unresolved(`The ${rule.type} literal has no literal ${rule.field}`);
            continue;
          }
          graph.node(`group:${rule.kind}s`, { kind: "container", name: rule.group ?? `${rule.kind}s`, basis: "parsed" });
          graph.node(`${rule.kind}:${name}`, { kind: rule.kind, name, parent: `group:${rule.kind}s`, area: "agent", basis: "parsed", extract_by: `rust:${rule.type}` });
          graph.edge(rule.edge, from, `${rule.kind}:${name}`, evidence, { basis: "parsed", extract_by: `rust:${rule.type}` });
          graph.count(token, "facts");
        } else {
          const value = literal(text);
          if (!value) {
            unresolved("The joined path is not a literal");
            continue;
          }
          graph.node("group:profile", { kind: "container", name: "Installed profile", basis: "parsed" });
          graph.node(`location:profile/${value}`, { kind: "location", name: `<profile>/${value}`, parent: "group:profile", area: "profile", basis: "parsed" });
          graph.edge("uses_location", from, `location:profile/${value}`, evidence, { basis: "parsed", extract_by: `rust:${token}` });
          graph.count(token, "facts");
        }
      }
    }
  }
  const scanned = new Set(analyses.keys());
  for (const info of crates) {
    for (const file of snapshot.files(`${info.directory}/src/**`)) {
      if (!file.endsWith(".rs") || scanned.has(file) || testFiles.has(file) || file.includes("/src/bin/")) continue;
      graph.leave(`unreferenced@${file}`, { kind: "unreferenced-file", subject: info.crateId, reason: "Rust file under src/ that no product module or binary declares (test-only module, or not compiled)", evidence: graph.evidence(file, 1) });
    }
  }
}

function enclosingEnd(analysis, position) {
  let depth = 0;
  for (let index = position; index >= 0; index -= 1) {
    const char = analysis.bare[index];
    if (char === "}") depth += 1;
    else if (char === "{") {
      if (depth === 0) return analysis.partner.get(index) ?? analysis.bare.length;
      depth -= 1;
    }
  }
  return analysis.bare.length;
}

function readPath(bare, start) {
  const results = [];
  const walk = (position, prefix) => {
    let cursor = position;
    const list = [...prefix];
    for (;;) {
      while (/\s/.test(bare[cursor] ?? "")) cursor += 1;
      if (bare[cursor] === "{") {
        let depth = 0;
        let itemStart = cursor + 1;
        for (let index = cursor; index < bare.length; index += 1) {
          const char = bare[index];
          if (char === "{") depth += 1;
          else if (char === "}") depth -= 1;
          if ((char === "," && depth === 1) || depth === 0) {
            walk(itemStart, list);
            itemStart = index + 1;
          }
          if (depth === 0) break;
        }
        return;
      }
      const name = /^[A-Za-z_]\w*/.exec(bare.slice(cursor, cursor + 80));
      if (!name) break;
      list.push(name[0]);
      cursor += name[0].length;
      const separator = /^\s*::\s*/.exec(bare.slice(cursor, cursor + 20));
      if (!separator) break;
      cursor += separator[0].length;
    }
    results.push(list.filter((item) => item !== "self"));
  };
  walk(start, []);
  return results;
}

function observePackages(snapshot, graph, config) {
  graph.packages = [];
  for (const root of config.packageRoots) {
    for (const manifest of snapshot.files(`${root}/**/mod.json`)) {
      const directory = path.posix.dirname(manifest);
      let parsed = {};
      try {
        parsed = JSON.parse(snapshot.read(manifest));
      } catch {
        graph.leave(`manifest@${manifest}`, { kind: "manifest", subject: manifest, reason: "mod.json is not valid JSON" });
      }
      const lines = snapshot.read(manifest).split("\n");
      const entryLine = lines.findIndex((text) => /"entry"\s*:/.test(text)) + 1;
      const id = `package:${directory}`;
      graph.node(id, { kind: "package", name: parsed.name ? `${parsed.name} (${directory})` : directory, area: directory.split("/")[0], file: manifest, entry: parsed.entry, basis: "declared", extract_by: "manifest:mod.json", files: snapshot.files(`${directory}/**`).length }, graph.evidence(manifest, entryLine || 1));
      graph.packages.push({ id, directory, entry: parsed.entry });
    }
  }
}

function observeGenerators(snapshot, graph, config) {
  graph.artifacts = [];
  if (!snapshot.has("package.json")) return;
  const lines = snapshot.read("package.json").split("\n");
  const scripts = JSON.parse(snapshot.read("package.json")).scripts ?? {};
  for (const [name, command] of Object.entries(scripts).sort()) {
    const match = /^node\s+(\S+\.c?js)\b/.exec(command);
    if (!match || !config.generators[match[1]]) continue;
    const file = match[1];
    const id = `generator:${file}`;
    const line = lines.findIndex((text) => text.includes(`"${name}"`)) + 1;
    const node = graph.node(id, { kind: "generator", name: file, area: file.split("/")[0], file, basis: "declared", extract_by: "package.json+config", commands: [] }, graph.evidence("package.json", line));
    node.commands = [...new Set([...node.commands, `npm run ${name}`])].sort();
  }
  for (const [file, outputs] of Object.entries(config.generators).sort()) {
    const id = `generator:${file}`;
    if (!snapshot.has(file)) continue;
    if (!graph.nodes.has(id)) graph.node(id, { kind: "generator", name: file, area: file.split("/")[0], file, basis: "declared", extract_by: "config", commands: [] }, graph.evidence(file, 1));
    for (const output of outputs) {
      if (graph.nodes.has(`package:${output}`)) {
        graph.edge("generates", id, `package:${output}`, graph.evidence(file, 1), { basis: "declared", extract_by: "config", writes: "compiled scripts" });
        continue;
      }
      const files = snapshot.files(`${output}/**`).length + (snapshot.has(output) ? 1 : 0);
      if (!files) {
        graph.leave(`artifact@${output}`, { kind: "artifact", subject: id, reason: `Declared output ${output} is not in the commit` });
        continue;
      }
      const artifact = `artifact:${output}`;
      graph.node(artifact, { kind: "artifact", name: output, area: output.split("/")[0], file: output, files, committed: true, basis: "declared", extract_by: "config" });
      graph.artifacts.push([output, artifact]);
      graph.edge("generates", id, artifact, graph.evidence(file, 1), { basis: "declared", extract_by: "config" });
    }
    const analysis = analyse(snapshot.read(file));
    const runs = /\b(execFileSync|spawnSync|execSync|spawn|execFile)\s*\(/g;
    for (let match; (match = runs.exec(analysis.bare)); ) {
      const argument = call(analysis, match.index + match[0].length - 1);
      const evidence = graph.evidence(file, analysis.line(match.index));
      const program = argument && /^\s*["'`]([^"'`]+)["'`]/.exec(argument.text)?.[1];
      if (!program) {
        graph.count(`${match[1]}(`, "unresolved");
        graph.leave(`${match[1]}@${id}`, { kind: match[1], subject: id, reason: "The program is not a literal", evidence });
        continue;
      }
      const bin = /"--bin"\s*,\s*"([^"]+)"/.exec(argument.text)?.[1];
      if (program === "cargo" && bin) graph.edge("runs", id, `bin:${bin}`, evidence, { basis: "parsed", extract_by: "node:execFileSync" });
      else {
        graph.node(`program:${program}`, { kind: "program", name: program, area: "external", basis: "parsed" });
        graph.edge("runs", id, `program:${program}`, evidence, { basis: "parsed", extract_by: "node:execFileSync" });
      }
      graph.count(`${match[1]}(`, "facts");
    }
  }
}

function observeScopes(snapshot, graph, config) {
  const settings = config.scriptScopes;
  if (!settings || !snapshot.has(settings.file)) return;
  const lines = snapshot.read(settings.file).split("\n");
  const inventory = JSON.parse(snapshot.read(settings.file));
  for (const [scope, entry] of Object.entries(inventory).sort()) {
    const directory = settings.packages[scope];
    const pack = directory && graph.nodes.get(`package:${directory}`);
    if (pack) pack.scope = { name: scope, modules: [...entry.modules].sort(), declared_in: settings.file };
    let cursor = lines.findIndex((text) => text.includes(`"${scope}"`));
    for (const name of entry.modules) {
      const index = lines.findIndex((text, at) => at > cursor && text.includes(`"${name}"`));
      if (index >= 0) cursor = index;
      const evidence = index >= 0 ? graph.evidence(settings.file, index + 1) : null;
      let node = graph.nodes.get(`host-module:${name}`);
      if (!node) {
        graph.node("group:script-runtime", { kind: "container", name: "Script runtime modules", basis: "declared" });
        node = graph.node(`runtime-module:${name}`, { kind: "runtime-module", name, parent: "group:script-runtime", area: "script-host", basis: "declared", extract_by: `artifact:${settings.file}` });
      }
      node.scopes = [...new Set([...(node.scopes ?? []), scope])].sort();
      if (evidence) graph.attach(node, evidence);
    }
  }
}

function observeTypeScript(snapshot, graph, config) {
  if (!config.typescript) return null;
  let ts;
  try {
    ts = require(require.resolve("typescript", { paths: [snapshot.repository, process.cwd()] }));
  } catch {
    graph.leave("typescript", { kind: "tool", subject: "typescript", reason: "The TypeScript compiler is not installed; script imports were not read" });
    return null;
  }
  const settings = config.typescript;
  let options = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ES2022 };
  if (snapshot.has(settings.tsconfig)) {
    const absolute = path.join(snapshot.root, settings.tsconfig);
    const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(absolute, ts.sys.readFile).config, ts.sys, path.dirname(absolute));
    options = parsed.options;
  }
  const files = [...new Set(settings.roots.flatMap((root) => snapshot.files(`${root}/**/*.ts`)))].filter((file) => !file.endsWith(".d.ts")).sort();
  const host = { ...ts.sys, fileExists: ts.sys.fileExists, readFile: ts.sys.readFile };
  for (const file of files) {
    const container = (graph.packages ?? []).find((pack) => file.startsWith(`${pack.directory}/`))?.id ?? (graph.artifacts ?? []).find(([output]) => file.startsWith(`${output}/`))?.[1];
    graph.node(`ts:${file}`, { kind: "script", name: path.posix.basename(file), parent: container, area: file.split("/")[0], file, generated: container?.startsWith("artifact:") || undefined, basis: "parsed", extract_by: "typescript" });
    const text = snapshot.read(file);
    const info = ts.preProcessFile(text, true, true);
    const lineOf = (position) => text.slice(0, position).split("\n").length;
    for (const imported of info.importedFiles) {
      const specifier = imported.fileName;
      const evidence = graph.evidence(file, lineOf(imported.pos));
      const provided = [`host-module:${specifier}`, `runtime-module:${specifier}`].find((id) => graph.nodes.has(id));
      if (provided) {
        graph.edge("imports", `ts:${file}`, provided, evidence, { basis: "resolved", extract_by: "typescript+script-scope" });
        graph.count("import", "facts");
        continue;
      }
      const result = ts.resolveModuleName(specifier, path.join(snapshot.root, file), options, host).resolvedModule;
      if (!result) {
        graph.count("import", "unresolved");
        graph.leave(`import@ts:${file}(${specifier})`, { kind: "import", subject: `ts:${file}`, argument: specifier, reason: "Neither the TypeScript configuration nor a host module resolves this specifier", evidence });
        continue;
      }
      let target = path.relative(snapshot.root, result.resolvedFileName).split(path.sep).join("/");
      if (target.endsWith(".js") && snapshot.has(target.replace(/\.js$/, ".ts"))) target = target.replace(/\.js$/, ".ts");
      const viaRootDirs = specifier.startsWith(".") && path.posix.dirname(target) !== path.posix.dirname(path.posix.join(path.posix.dirname(file), specifier));
      const container = (graph.artifacts ?? []).find(([output]) => target.startsWith(`${output}/`))?.[1];
      const to = files.includes(target) ? `ts:${target}` : container;
      if (!to) {
        graph.count("import", "unresolved");
        graph.leave(`import@ts:${file}(${specifier})`, { kind: "import", subject: `ts:${file}`, argument: specifier, reason: `Resolves to ${target}, outside the scanned script roots`, evidence });
        continue;
      }
      graph.edge("imports", `ts:${file}`, to, evidence, { basis: "resolved", extract_by: "typescript", via: viaRootDirs ? "rootDirs" : undefined, file: to === container ? target : undefined });
      graph.count("import", "facts");
    }
  }
  for (const pack of graph.packages ?? []) {
    const entry = pack.entry && `${pack.directory}/${pack.entry.replace(/\.js$/, ".ts")}`;
    const node = graph.nodes.get(pack.id);
    if (entry && graph.nodes.has(`ts:${entry}`)) node.entry_script = `ts:${entry}`;
  }
  return ts.version;
}

function indexDocuments(snapshot, graph, config, external) {
  const handles = new Map();
  const add = (handle, id, quoted = false) => {
    if (!handle) return;
    const key = `${quoted ? "`" : ""}${handle}`;
    if (!handles.has(key)) handles.set(key, new Set());
    handles.get(key).add(id);
  };
  const basenames = new Map();
  for (const node of graph.nodes.values()) if (node.file && !node.inline) basenames.set(path.posix.basename(node.file), (basenames.get(path.posix.basename(node.file)) ?? 0) + 1);
  for (const node of graph.nodes.values()) {
    if (node.kind === "container") continue;
    if (node.file && !node.inline && node.kind !== "crate") {
      add(node.file, node.id);
      const base = path.posix.basename(node.file);
      if (basenames.get(base) === 1 && !["lib.rs", "main.rs", "mod.json", "main.ts", "mod.rs"].includes(base)) add(base, node.id);
    }
    if (node.kind === "crate") add(node.name, node.id), add(`${node.area}/`, node.id);
    if (node.kind === "module" && !node.name.includes(" ")) add(node.id.slice(3), node.id);
    if (["host-module", "agent-tool", "environment", "binary"].includes(node.kind)) add(node.name, node.id);
    if (node.kind === "program") add(node.name, node.id, node.name.length < 5);
    if (node.kind === "dependency") add(node.id.slice(4), node.id, !/[-_]/.test(node.id.slice(4)));
    if (["package", "files", "artifact"].includes(node.kind)) add(node.kind === "package" ? node.id.slice(8) : node.name, node.id);
  }
  const patterns = [...handles.keys()]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((key) => {
      const quoted = key.startsWith("`");
      const text = quoted ? key.slice(1) : key;
      const escaped = text.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
      return { key, ids: [...handles.get(key)].sort(), regex: new RegExp(quoted ? `\`${escaped}[\`\\s]` : `(?<![\\w/.-])${escaped}(?![\\w-]|/\\w)`, "g") };
    });
  const documents = [];
  const sources = [...new Set(config.docs.flatMap((pattern) => snapshot.files(pattern)))].map((file) => ({ file, text: snapshot.read(file), blob: snapshot.blobs.get(file), tracked: true }));
  for (const file of external) sources.push({ file, text: fs.readFileSync(file, "utf8"), sha256: digest(fs.readFileSync(file)), tracked: false });
  for (const source of sources) {
    const lines = source.text.split("\n");
    const sections = [];
    let current = null;
    let fence = false;
    lines.forEach((line, index) => {
      if (/^\s*```/.test(line)) fence = !fence;
      const heading = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading || !current) {
        current = { heading: heading ? heading[2].trim() : "(preamble)", level: heading ? heading[1].length : 0, line: index + 1, end: index + 1, mentions: new Map() };
        sections.push(current);
      }
      current.end = index + 1;
      const claimed = [];
      for (const { ids, regex } of patterns) {
        regex.lastIndex = 0;
        for (let match; (match = regex.exec(line)); ) {
          const span = [match.index, match.index + match[0].length];
          if (claimed.some(([from, to]) => span[0] < to && span[1] > from)) continue;
          claimed.push(span);
          for (const id of ids) {
            if (!current.mentions.has(id)) current.mentions.set(id, []);
            const list = current.mentions.get(id);
            if (!list.includes(index + 1)) list.push(index + 1);
          }
        }
      }
    });
    const title = sections.find((section) => section.level > 0)?.heading ?? source.file;
    documents.push({
      path: source.file,
      title,
      tracked: source.tracked,
      blob: source.blob,
      sha256: source.sha256,
      lines: lines.length,
      text: source.text,
      sections: sections
        .filter((section) => section.mentions.size > 0)
        .map((section) => ({
          heading: section.heading,
          line: section.line,
          end: section.end,
          mentions: [...section.mentions].sort(([a], [b]) => a.localeCompare(b)).map(([node, list]) => ({ node, lines: list })),
        })),
    });
  }
  return documents.sort((a, b) => a.path.localeCompare(b.path));
}

function observe(repository, revision, config, options = {}) {
  const snapshot = new Snapshot(repository, revision);
  try {
    const graph = new Graph(snapshot);
    const crates = observeCargo(snapshot, graph, config);
    observePackages(snapshot, graph, config);
    observeGenerators(snapshot, graph, config);
    observeRust(snapshot, graph, config, crates);
    observeScopes(snapshot, graph, config);
    const typescript = observeTypeScript(snapshot, graph, config);
    for (const edge of graph.edges.values()) {
      for (const end of [edge.from, edge.to]) {
        if (!graph.nodes.has(end)) graph.leave(`dangling@${edge.id}`, { kind: "dangling-edge", subject: edge.id, reason: `${end} is not an observed node` });
      }
    }
    const documents = indexDocuments(snapshot, graph, config, options.specs ?? []);
    const order = (list) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const tidy = (item) => {
      const copy = {};
      for (const [key, value] of Object.entries(item)) if (value !== undefined && key !== "evidence") copy[key] = value;
      const evidence = [...item.evidence].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
      copy.evidence = evidence.slice(0, 8);
      if (evidence.length > 8) copy.evidence_total = evidence.length;
      return copy;
    };
    const cargoVersion = snapshot.has("Cargo.toml") ? execFileSync("cargo", ["--version"], { encoding: "utf8" }).trim() : undefined;
    const observed = {
      schema: SCHEMA,
      layer: "observed",
      subject: { repository: config.repository },
      provenance: {
        source: { kind: "git", commit: snapshot.commit, tree: snapshot.tree },
        generator: { name: "experiments/architecture-map", version: toolVersion(), rules: digest(JSON.stringify(config), 16) },
        tools: { node: process.version, typescript: typescript ?? undefined, cargo: cargoVersion },
        files: Object.fromEntries([...graph.cited].sort().map((file) => [file, snapshot.blobs.get(file)])),
      },
      coverage: Object.fromEntries([...graph.coverage].sort(([a], [b]) => a.localeCompare(b))),
      nodes: order(graph.nodes.values()).map(tidy),
      edges: order(graph.edges.values()).map(tidy),
      unresolved: order(graph.unresolved.values()),
    };
    const specs = {
      schema: SCHEMA,
      layer: "spec-index",
      provenance: { source: { kind: "git", commit: snapshot.commit }, generator: observed.provenance.generator },
      documents: documents.map(({ text, ...rest }) => rest),
    };
    return { observed, specs, texts: Object.fromEntries(documents.map((item) => [item.path, item.text])), snapshot: { commit: snapshot.commit, blobs: snapshot.blobs } };
  } finally {
    snapshot.close();
  }
}

function lockReach(repository, commit, from) {
  const text = execFileSync("git", ["-C", repository, "show", `${commit}:Cargo.lock`], { encoding: "utf8", maxBuffer: 1 << 28 });
  const packages = new Map();
  for (const block of text.split(/\n\[\[package\]\]\n/).slice(1)) {
    const name = /^name = "([^"]+)"/m.exec(block)?.[1];
    const dependencies = /^dependencies = \[([\s\S]*?)\]/m.exec(block)?.[1] ?? "";
    packages.set(name, [...dependencies.matchAll(/"([^" ]+)/g)].map((match) => match[1]));
  }
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) for (const next of packages.get(queue.shift()) ?? []) if (!seen.has(next)) seen.add(next), queue.push(next);
  seen.delete(from);
  return [...seen].sort();
}

module.exports = { observe, lockReach, glob, digest, Snapshot };
