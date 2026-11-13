const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

class Snapshot {
  constructor(repository, revision) {
    this.repository = repository;
    this.tree = this.git([
      "rev-parse",
      "--verify",
      `${revision}^{tree}`,
    ]).trim();
    this.commit =
      this.git(["cat-file", "-t", revision]).trim() === "tree"
        ? null
        : this.git(["rev-parse", `${revision}^{commit}`]).trim();
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
    this.coverage = new Map();
    this.cited = new Set();
    this.packages = [];
    this.artifacts = [];
  }
  packageOf(file) {
    return (
      this.packages.find((pack) => file.startsWith(`${pack.directory}/`))?.id ??
      null
    );
  }
  artifactOf(file) {
    return (
      this.artifacts.find(
        ([output]) => file === output || file.startsWith(`${output}/`),
      )?.[1] ?? null
    );
  }
  ownerOf(file) {
    return this.packageOf(file) ?? this.artifactOf(file);
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
  count(token, outcome) {
    if (!this.coverage.has(token))
      this.coverage.set(token, { total: 0, facts: 0, test: 0, unresolved: 0 });
    const entry = this.coverage.get(token);
    entry.total += 1;
    entry[outcome] += 1;
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

function literal(text) {
  const match = /^\s*(?:b?r#*"([\s\S]*?)"#*|"((?:[^"\\]|\\.)*)")\s*,?\s*$/.exec(
    text,
  );
  if (!match) return null;
  return match[1] ?? match[2];
}

module.exports = { digest, Snapshot, Graph, relative, literal };
