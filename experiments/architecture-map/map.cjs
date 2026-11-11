const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { observe, lockReach, glob } = require("./observe.cjs");
const { compare, fingerprint } = require("./compare.cjs");
const { diff, walkthrough, merges, hunks, changeKey } = require("./history.cjs");
const { stringify, parse } = require("./yaml.cjs");

const repository = path.resolve(__dirname, "../..");

function options(argv) {
  const out = { command: argv[0], spec: [] };
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index].replace(/^--/, "");
    const value = argv[index + 1];
    index += 1;
    if (key === "spec") out.spec.push(path.resolve(value));
    else out[key] = value;
  }
  return out;
}

function load(file) {
  return file ? parse(fs.readFileSync(file, "utf8")) : null;
}

function reader(commit) {
  const cache = new Map();
  return (file, line) => {
    if (!cache.has(file)) {
      let text = "";
      try {
        text = execFileSync("git", ["-C", repository, "show", `${commit}:${file}`], { encoding: "utf8", maxBuffer: 1 << 28 });
      } catch {
        text = "";
      }
      cache.set(file, text.split("\n"));
    }
    return (cache.get(file)[line - 1] ?? "").trim();
  };
}

function comparison(observed, intended, annotations) {
  const commit = observed.provenance.source.commit;
  return compare(observed, intended, annotations, { read: reader(commit), reach: (name) => lockReach(repository, commit, name) });
}

function history(config, revision, cache) {
  const list = merges(repository, revision ?? config.history.branch, config.history.from);
  const snapshots = list.map((entry) => ({ ...entry, observed: cache(entry.commit) }));
  const changes = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const before = snapshots[index - 1];
    const after = snapshots[index];
    const change = diff(before.observed, after.observed);
    const sections = walkthrough(change, before.observed, after.observed);
    const files = new Set(sections.flatMap((section) => section.steps.map((step) => step.evidence?.path).filter(Boolean)));
    changes.push({
      before: before.commit,
      after: after.commit,
      pull: after.pull,
      branch: after.branch,
      title: after.title,
      key: changeKey(change),
      totals: Object.fromEntries(["nodes", "edges"].map((key) => [key, Object.fromEntries(Object.entries(change[key]).map(([kind, items]) => [kind, items.length]))])),
      change,
      walkthrough: sections,
      documents: changedDocuments(config, before.commit, after.commit),
      hunks: hunks(repository, before.commit, after.commit, files),
      removed: {
        nodes: before.observed.nodes.filter((node) => change.nodes.removed.includes(node.id)),
        edges: before.observed.edges.filter((edge) => change.edges.removed.includes(edge.id)),
      },
    });
  }
  return { snapshots: snapshots.map(({ observed, ...rest }) => ({ ...rest, nodes: observed.nodes.length, edges: observed.edges.length })), changes };
}

function changedDocuments(config, before, after) {
  const patterns = config.docs.map(glob);
  return execFileSync("git", ["-C", repository, "diff", "--name-only", before, after], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file && patterns.some((regex) => regex.test(file)))
    .sort();
}

function render(data) {
  const template = fs.readFileSync(path.join(__dirname, "view.html"), "utf8");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return template.replace("__ARCHITECTURE_DATA__", () => json);
}

function main(argv) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  const args = options(argv);
  const intended = load(args.intended);
  const annotations = load(args.annotations);
  const specs = [...args.spec, ...(intended?.sources ?? []).map((source) => source.path).filter((file) => fs.existsSync(file) && !file.startsWith(`${repository}/`))];
  if (args.command === "observe") {
    const result = observe(repository, args.rev ?? "HEAD", config, { specs });
    const text = stringify(result.observed);
    if (args.out) fs.writeFileSync(args.out, text);
    else process.stdout.write(text);
    return;
  }
  if (args.command === "compare") {
    const result = observe(repository, args.rev ?? "HEAD", config, { specs });
    const text = stringify(comparison(result.observed, intended, annotations));
    if (args.out) fs.writeFileSync(args.out, text);
    else process.stdout.write(text);
    return;
  }
  if (args.command === "diff") {
    const before = observe(repository, args.from, config).observed;
    const after = observe(repository, args.to ?? "HEAD", config).observed;
    const change = diff(before, after);
    process.stdout.write(stringify({ schema: "architecture-map/v0", layer: "change", before: before.provenance.source.commit, after: after.provenance.source.commit, change, walkthrough: walkthrough(change, before, after) }));
    return;
  }
  if (args.command === "build") {
    const out = path.resolve(args.out ?? path.join(__dirname, "out"));
    fs.mkdirSync(out, { recursive: true });
    const current = observe(repository, args.rev ?? "HEAD", config, { specs });
    const cache = new Map();
    const cached = (commit) => {
      if (commit === current.observed.provenance.source.commit) return current.observed;
      if (!cache.has(commit)) cache.set(commit, observe(repository, commit, config).observed);
      return cache.get(commit);
    };
    const past = history(config, args.history ?? current.observed.provenance.source.commit, cached);
    const compared = intended ? comparison(current.observed, intended, annotations) : null;
    fs.writeFileSync(path.join(out, "observed.yaml"), stringify(current.observed));
    fs.writeFileSync(path.join(out, "specs.yaml"), stringify(current.specs));
    fs.writeFileSync(path.join(out, "history.yaml"), stringify({ schema: "architecture-map/v0", layer: "history", snapshots: past.snapshots, changes: past.changes.map(({ hunks: omitted, removed, ...rest }) => rest) }));
    if (compared) fs.writeFileSync(path.join(out, "comparison.yaml"), stringify(compared));
    if (intended) fs.writeFileSync(path.join(out, "intended.yaml"), stringify(intended));
    const narratives = annotations?.narratives ?? [];
    fs.writeFileSync(
      path.join(out, "graph.html"),
      render({
        repository: config.repository,
        observed: current.observed,
        specs: current.specs,
        texts: current.texts,
        intended,
        intendedTexts: Object.fromEntries((intended?.sources ?? []).filter((source) => fs.existsSync(source.path)).map((source) => [source.id, fs.readFileSync(source.path, "utf8")])),
        comparison: compared,
        history: past,
        narratives,
        notes: annotations?.notes ?? [],
      }),
    );
    process.stdout.write(`${out}\n`);
    return;
  }
  if (args.command === "evidence") {
    const commit = execFileSync("git", ["-C", repository, "rev-parse", args.rev ?? "HEAD"], { encoding: "utf8" }).trim();
    const read = reader(commit);
    const evidence = argv.slice(1).filter((item) => /^[^-].*:\d+$/.test(item)).map((item) => {
      const [file, line] = [item.slice(0, item.lastIndexOf(":")), Number(item.slice(item.lastIndexOf(":") + 1))];
      return { path: file, line, text: read(file, line) };
    });
    process.stdout.write(stringify({ commit, fingerprint: fingerprint(evidence, read), evidence }));
    return;
  }
  process.stderr.write("Usage: node map.cjs observe|compare|diff|build|evidence [--rev REV] [--intended FILE] [--annotations FILE] [--spec FILE] [--out PATH]\n");
  process.exitCode = 2;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, comparison, render };
