const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyse, modules } = require("./rust.cjs");

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

class Snapshot {
  constructor(repository, revision) {
    this.repository = repository;
    this.tree = this.git([
      "rev-parse",
      "--verify",
      `${revision}^{tree}`,
    ]).trim();
    this.blobs = new Map();
    for (const entry of this.git(["ls-tree", "-r", "-z", this.tree]).split(
      "\0",
    )) {
      const match = /^(\d+) blob ([0-9a-f]+)\t([\s\S]*)$/.exec(entry);
      if (match && match[1] !== "120000") this.blobs.set(match[3], match[2]);
    }
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-map-"));
    execFileSync("sh", [
      "-c",
      'git -C "$1" archive "$2" | tar -x -C "$3"',
      "sh",
      repository,
      this.tree,
      this.root,
    ]);
    this.texts = new Map();
  }
  git(args) {
    return execFileSync("git", ["-C", this.repository, ...args], {
      encoding: "utf8",
      maxBuffer: 1 << 30,
    });
  }
  has(file) {
    return this.blobs.has(file);
  }
  read(file) {
    if (!this.texts.has(file))
      this.texts.set(file, fs.readFileSync(path.join(this.root, file), "utf8"));
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
    this.cited = new Set();
  }
  evidence(file, line) {
    this.cited.add(file);
    return { path: file, line, text: this.snapshot.line(file, line) };
  }
  node(id, fields, evidence) {
    if (!this.nodes.has(id))
      this.nodes.set(id, { id, ...fields, evidence: [] });
    const node = this.nodes.get(id);
    if (evidence) this.attach(node, evidence);
    return node;
  }
  attach(target, evidence) {
    if (
      !target.evidence.some(
        (item) => item.path === evidence.path && item.line === evidence.line,
      )
    )
      target.evidence.push(evidence);
  }
  edge(kind, from, to, evidence, fields = {}) {
    const id = `${kind}(${from},${to})`;
    if (!this.edges.has(id))
      this.edges.set(id, {
        id,
        kind,
        from,
        to,
        ...fields,
        occurrences: 0,
        evidence: [],
      });
    const edge = this.edges.get(id);
    edge.occurrences += 1;
    if (evidence) this.attach(edge, evidence);
    return edge;
  }
  leave(id, fields) {
    if (!this.unresolved.has(id)) this.unresolved.set(id, { id, ...fields });
  }
}

function relative(from, target) {
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(from), target),
  );
}

function observeCargo(snapshot, graph) {
  if (!snapshot.has("Cargo.toml")) return [];
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--format-version",
        "1",
        "--no-deps",
        "--offline",
        "--locked",
        "--manifest-path",
        path.join(snapshot.root, "Cargo.toml"),
      ],
      {
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  const local = (absolute) =>
    path.relative(snapshot.root, absolute).split(path.sep).join("/");
  const members = new Set(metadata.workspace_members);
  const crates = [];
  graph.node("group:external-crates", {
    kind: "container",
    name: "External crates",
    basis: "declared",
  });
  for (const pack of metadata.packages
    .filter((item) => members.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const manifest = local(pack.manifest_path);
    const directory = path.posix.dirname(manifest);
    const lines = snapshot.read(manifest).split("\n");
    const find = (pattern) => {
      const index = lines.findIndex((text) => pattern.test(text));
      return index < 0 ? null : graph.evidence(manifest, index + 1);
    };
    const features = Object.fromEntries(
      Object.entries(pack.features)
        .filter(([name]) => name !== "default")
        .sort(),
    );
    const crate = graph.node(
      `crate:${pack.name}`,
      {
        kind: "crate",
        name: pack.name,
        area: directory,
        file: manifest,
        basis: "declared",
        extract_by: "cargo-metadata",
        features: Object.keys(features).length ? features : undefined,
      },
      find(new RegExp(`^\\s*name\\s*=\\s*"${pack.name}"`)),
    );
    const info = {
      name: pack.name,
      directory,
      crateId: crate.id,
      spaces: [],
      dependencies: new Map(),
    };
    for (const dependency of pack.dependencies) {
      const key = dependency.rename ?? dependency.name;
      const ident = key.replace(/-/g, "_");
      const evidence = find(
        new RegExp(
          `^\\s*(${key.replace(/[-]/g, "\\-")}\\s*=|\\[[^\\]]*dependencies\\.${key}\\])`,
        ),
      );
      if (dependency.kind === "dev") {
        info.dependencies.set(ident, null);
        continue;
      }
      const fields = {
        dependency_kind: dependency.kind ?? "normal",
        condition: dependency.target ?? undefined,
        optional: dependency.optional || undefined,
      };
      if (dependency.path) {
        info.dependencies.set(ident, `crate:${dependency.name}`);
        graph.edge(
          "depends_on",
          crate.id,
          `crate:${dependency.name}`,
          evidence,
          { basis: "declared", extract_by: "cargo-metadata", ...fields },
        );
      } else {
        const id = `dep:${dependency.name}`;
        graph.node(id, {
          kind: "dependency",
          name:
            key === dependency.name
              ? dependency.name
              : `${key} (${dependency.name})`,
          parent: "group:external-crates",
          area: "external",
          basis: "declared",
          source: dependency.source ?? undefined,
        });
        info.dependencies.set(ident, id);
        graph.edge("depends_on", crate.id, id, evidence, {
          basis: "declared",
          extract_by: "cargo-metadata",
          requirement: dependency.req,
          ...fields,
        });
      }
    }
    for (const target of [...pack.targets].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const source = local(target.src_path);
      if (target.kind.includes("lib")) {
        const ident = target.name.replace(/-/g, "_");
        graph.node(
          `rs:${ident}`,
          {
            kind: "module",
            name: `${ident} (crate root)`,
            parent: crate.id,
            area: directory,
            file: source,
            basis: "declared",
            extract_by: "cargo-metadata",
          },
          graph.evidence(source, 1),
        );
        info.spaces.push({
          ident,
          root: `rs:${ident}`,
          prefix: `rs:${ident}`,
          file: source,
          lib: true,
        });
      } else if (target.kind.includes("bin")) {
        const ident = target.name.replace(/-/g, "_");
        const declared =
          find(new RegExp(`^\\s*name\\s*=\\s*"${target.name}"`)) ??
          graph.evidence(source, 1);
        graph.node(
          `bin:${target.name}`,
          {
            kind: "binary",
            name: target.name,
            parent: crate.id,
            area: directory,
            file: source,
            basis: "declared",
            extract_by: "cargo-metadata",
          },
          declared,
        );
        info.spaces.push({
          ident,
          root: `bin:${target.name}`,
          prefix: `rs:${ident}`,
          file: source,
          lib: false,
        });
      }
    }
    crates.push(info);
  }
  return crates;
}

function observeRust(snapshot, graph, crates) {
  const known = new Set();
  const analyses = new Map();
  const childNames = new Map();
  const segments = new Map();
  const spaceOf = new Map();
  const infoOf = new Map();
  const ownership = new Map();
  const testFiles = new Set();
  const libraries = new Map();
  for (const info of crates)
    for (const space of info.spaces)
      if (space.lib) libraries.set(space.ident, { info, space });
  const moduleId = (space, list) =>
    list.length ? `${space.prefix}::${list.join("::")}` : space.root;
  const walk = (info, space, file, id, list, modRs) => {
    if (!snapshot.has(file)) {
      graph.leave(`module-file@${id}`, {
        kind: "module-file",
        subject: id,
        reason: `Module source ${file} is not in the commit`,
      });
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
      const chain = inline
        .filter(
          (item) =>
            item !== declaration &&
            item.range[0] < declaration.start &&
            item.range[1] > declaration.start,
        )
        .sort((a, b) => a.range[0] - b.range[0]);
      if (declaration.test || chain.some((item) => item.test)) {
        if (!declaration.inline && !chain.length) {
          const directory = modRs
            ? path.posix.dirname(file)
            : path.posix.join(
                path.posix.dirname(file),
                path.posix.basename(file, ".rs"),
              );
          testFiles.add(
            declaration.path !== null
              ? path.posix.normalize(
                  path.posix.join(path.posix.dirname(file), declaration.path),
                )
              : path.posix.join(directory, `${declaration.name}.rs`),
          );
        }
        continue;
      }
      const childList = [
        ...list,
        ...chain.map((item) => item.name),
        declaration.name,
      ];
      const childId = moduleId(space, childList);
      const parentId = chain.length
        ? moduleId(space, [...list, ...chain.map((item) => item.name)])
        : id;
      const parent =
        parentId === space.root && space.lib ? info.crateId : parentId;
      if (!childNames.has(parentId)) childNames.set(parentId, new Set());
      childNames.get(parentId).add(declaration.name);
      const conditions = declaration.conditions.length
        ? declaration.conditions
        : undefined;
      if (declaration.inline) {
        graph.node(
          childId,
          {
            kind: "module",
            name: declaration.name,
            parent,
            area: info.directory,
            file,
            inline: true,
            condition: conditions,
            basis: "parsed",
            extract_by: "rust:mod",
          },
          graph.evidence(file, declaration.line),
        );
        known.add(childId);
        segments.set(childId, childList);
        spaceOf.set(childId, space);
        infoOf.set(childId, info);
        if (!childNames.has(childId)) childNames.set(childId, new Set());
        ranges.push({ range: declaration.range, id: childId });
        continue;
      }
      const directory = modRs
        ? path.posix.dirname(file)
        : path.posix.join(
            path.posix.dirname(file),
            path.posix.basename(file, ".rs"),
          );
      const base = path.posix.join(
        declaration.path !== null && chain.length === 0
          ? path.posix.dirname(file)
          : directory,
        ...chain.map((item) => item.name),
      );
      let childFile;
      let childModRs;
      if (declaration.path !== null) {
        childFile = path.posix.normalize(
          path.posix.join(base, declaration.path),
        );
        childModRs = true;
      } else {
        childFile =
          [
            path.posix.join(base, `${declaration.name}.rs`),
            path.posix.join(base, declaration.name, "mod.rs"),
          ].find((candidate) => snapshot.has(candidate)) ??
          path.posix.join(base, `${declaration.name}.rs`);
        childModRs = path.posix.basename(childFile) === "mod.rs";
      }
      const outside = !childFile.startsWith(`${info.directory}/`);
      graph.node(
        childId,
        {
          kind: "module",
          name: declaration.name,
          parent,
          area: info.directory,
          file: childFile,
          condition: conditions,
          source_outside_crate: outside || undefined,
          basis: "parsed",
          extract_by: declaration.path !== null ? "rust:mod+path" : "rust:mod",
        },
        graph.evidence(
          file,
          declaration.path !== null ? declaration.pathLine : declaration.line,
        ),
      );
      if (outside) {
        const sourceId = `source:${childFile}`;
        graph.node("group:experiment-sources", {
          kind: "container",
          name: "Sources outside product crates",
          basis: "parsed",
        });
        graph.node(sourceId, {
          kind: "source",
          name: childFile,
          parent: "group:experiment-sources",
          area: childFile.split("/")[0],
          file: childFile,
          basis: "parsed",
        });
        graph.edge(
          "includes",
          parentId === space.root && space.lib ? space.root : parentId,
          sourceId,
          graph.evidence(file, declaration.pathLine),
          {
            basis: "parsed",
            extract_by: "rust:mod+path",
            condition: conditions,
          },
        );
      }
      walk(info, space, childFile, childId, childList, childModRs);
    }
    ownership.set(file, { id, ranges });
  };
  for (const info of crates)
    for (const space of info.spaces)
      walk(info, space, space.file, space.root, [], true);
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
      while (tail[0] === "super")
        ((base = base.slice(0, -1)), (tail = tail.slice(1)));
    } else if (libraries.has(first) && first !== space.ident) {
      targetSpace = libraries.get(first).space;
      base = [];
    } else if (childNames.get(ownerId)?.has(first)) {
      base = segments.get(ownerId);
      tail = [first, ...rest];
    } else if (libraries.has(first) && first === space.ident && !space.lib) {
      base = [];
    } else if (info.dependencies.get(first))
      return info.dependencies.get(first);
    else return null;
    for (let size = tail.length; size >= 0; size -= 1) {
      const candidate = moduleId(targetSpace, [
        ...base,
        ...tail.slice(0, size),
      ]);
      if (known.has(candidate)) return candidate;
    }
    return null;
  };
  const ownerOf = (file, position) => {
    const entry = ownership.get(file);
    const range = entry.ranges
      .filter((item) => item.range[0] < position && item.range[1] > position)
      .sort((a, b) => b.range[0] - a.range[0])[0];
    return range ? range.id : entry.id;
  };
  const owned = (file, entry, position) => {
    const id = ownerOf(file, position);
    return id === entry.space.root && entry.space.lib ? entry.space.root : id;
  };
  for (const [file, entry] of [...analyses].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const { analysis } = entry;
    const { bare, masked } = analysis;
    const paths = /(?<![\w:])([a-z_][a-z0-9_]*)\s*::\s*/g;
    for (let match; (match = paths.exec(bare));) {
      if (analysis.inTest(match.index)) continue;
      const lists = readPath(bare, match.index + match[0].length);
      const from = owned(file, entry, match.index);
      for (const rest of lists) {
        const target = resolve(ownerOf(file, match.index), match[1], rest);
        if (!target || target === from) continue;
        const kind =
          target.startsWith("dep:") || target.startsWith("crate:")
            ? "uses_crate"
            : "uses";
        graph.edge(
          kind,
          from,
          target,
          graph.evidence(file, analysis.line(match.index)),
          { basis: "parsed", extract_by: "rust:path" },
        );
      }
    }
  }
  const scanned = new Set(analyses.keys());
  for (const info of crates) {
    for (const file of snapshot.files(`${info.directory}/src/**`)) {
      if (
        !file.endsWith(".rs") ||
        scanned.has(file) ||
        testFiles.has(file) ||
        file.includes("/src/bin/")
      )
        continue;
      graph.leave(`unreferenced@${file}`, {
        kind: "unreferenced-file",
        subject: info.crateId,
        reason:
          "Rust file under src/ that no product module or binary declares (test-only module, or not compiled)",
        evidence: graph.evidence(file, 1),
      });
    }
  }
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

function observe(repository, revision) {
  const snapshot = new Snapshot(repository, revision);
  try {
    const graph = new Graph(snapshot);
    const crates = observeCargo(snapshot, graph);
    observeRust(snapshot, graph, crates);
    for (const edge of graph.edges.values()) {
      for (const end of [edge.from, edge.to]) {
        if (!graph.nodes.has(end))
          graph.leave(`dangling@${edge.id}`, {
            kind: "dangling-edge",
            subject: edge.id,
            reason: `${end} is not an observed node`,
          });
      }
    }
    const order = (list) =>
      [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const tidy = (item) => {
      const copy = {};
      for (const [key, value] of Object.entries(item))
        if (value !== undefined && key !== "evidence") copy[key] = value;
      copy.evidence = [...item.evidence].sort(
        (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
      );
      return copy;
    };
    return {
      tree: snapshot.tree,
      nodes: order(graph.nodes.values()).map(tidy),
      edges: order(graph.edges.values()).map(tidy),
      unresolved: order(graph.unresolved.values()),
      lock: snapshot.has("Cargo.lock") ? snapshot.read("Cargo.lock") : "",
    };
  } finally {
    snapshot.close();
  }
}

function lockReach(text, from) {
  const packages = new Map();
  for (const block of text.split(/\n\[\[package\]\]\n/).slice(1)) {
    const name = /^name = "([^"]+)"/m.exec(block)?.[1];
    const dependencies =
      /^dependencies = \[([\s\S]*?)\]/m.exec(block)?.[1] ?? "";
    packages.set(
      name,
      [...dependencies.matchAll(/"([^" ]+)/g)].map((match) => match[1]),
    );
  }
  if (!packages.has(from)) return null;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length)
    for (const next of packages.get(queue.shift()) ?? [])
      if (!seen.has(next)) (seen.add(next), queue.push(next));
  seen.delete(from);
  return [...seen].sort();
}

module.exports = { observe, lockReach };
