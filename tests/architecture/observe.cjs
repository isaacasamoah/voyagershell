const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { digest, Snapshot, Graph } = require("./snapshot.cjs");
const { observeCargo, observeRust } = require("./observe-rust.cjs");
const {
  observePackages,
  observeGenerators,
  observeScopes,
  observeTypeScript,
} = require("./observe-project.cjs");
const defaults = require("./config.json");

const SCHEMA = "architecture-map/v0";
const EXTRACTOR_FILES = [
  "observe-project.cjs",
  "observe-rust.cjs",
  "observe.cjs",
  "rust.cjs",
  "snapshot.cjs",
];

function toolVersion() {
  return digest(
    EXTRACTOR_FILES.map(
      (name) =>
        `${name}\0${fs.readFileSync(path.join(__dirname, name), "utf8")}`,
    ).join("\0"),
    16,
  );
}

function observeSizes(snapshot) {
  const sizes = {};
  for (const file of snapshot.blobs.keys()) {
    if (!/\.(rs|ts|js|cjs)$/.test(file)) continue;
    const text = snapshot.read(file);
    sizes[file] = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  }
  return sizes;
}

function observe(repository, revision, config = defaults) {
  const snapshot = new Snapshot(repository, revision);
  try {
    const graph = new Graph(snapshot);
    const crates = observeCargo(snapshot, graph);
    observePackages(snapshot, graph, config);
    observeGenerators(snapshot, graph, config);
    observeRust(snapshot, graph, config, crates);
    observeScopes(snapshot, graph, config);
    const typescript = observeTypeScript(snapshot, graph, config);
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
      const evidence = [...item.evidence].sort(
        (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
      );
      copy.evidence = evidence.slice(0, 8);
      if (evidence.length > 8) copy.evidence_total = evidence.length;
      return copy;
    };
    const cargoVersion = snapshot.has("Cargo.toml")
      ? execFileSync("cargo", ["--version"], { encoding: "utf8" }).trim()
      : undefined;
    const observed = {
      schema: SCHEMA,
      layer: "observed",
      subject: { repository: config.repository },
      provenance: {
        source: { kind: "git", commit: snapshot.commit, tree: snapshot.tree },
        generator: {
          name: "tests/architecture",
          version: toolVersion(),
          rules: digest(JSON.stringify(config), 16),
        },
        tools: {
          node: process.version,
          typescript: typescript ?? undefined,
          cargo: cargoVersion,
        },
        files: Object.fromEntries(
          [...graph.cited]
            .sort()
            .map((file) => [file, snapshot.blobs.get(file)]),
        ),
      },
      coverage: Object.fromEntries(
        [...graph.coverage].sort(([a], [b]) => a.localeCompare(b)),
      ),
      nodes: order(graph.nodes.values()).map(tidy),
      edges: order(graph.edges.values()).map(tidy),
      unresolved: order(graph.unresolved.values()),
    };
    return {
      observed,
      sizes: observeSizes(snapshot),
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

module.exports = { observe, lockReach, digest };
