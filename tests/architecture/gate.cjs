const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { observe, lockReach } = require("./observe.cjs");
const { parse } = require("./yaml.cjs");
const vocabulary = require("./vocabulary.cjs");
const literals = require("./literals.cjs");
const ownersOf = require("./owners.cjs");

const HERE = __dirname;

function wildcard(pattern) {
  return new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
}

function matcher(patterns) {
  const regexes = (patterns ?? []).map(wildcard);
  return (id) => regexes.some((regex) => regex.test(id));
}

function workingTree(repository) {
  const index = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "architecture-index-")),
    "index",
  );
  try {
    const env = { ...process.env, GIT_INDEX_FILE: index };
    execFileSync("git", ["-C", repository, "add", "-A"], { env });
    return execFileSync("git", ["-C", repository, "write-tree"], {
      env,
      encoding: "utf8",
    }).trim();
  } finally {
    fs.rmSync(path.dirname(index), { recursive: true, force: true });
  }
}

function topModule(id) {
  const parts = id.replace(/^rs:/, "").split("::");
  return parts.length < 2 ? null : `rs:${parts[0]}::${parts[1]}`;
}

const UNIT = { uses: topModule, imports: (id) => id };

const SEPARATOR = { uses: "::" };

function childCycles(edges, kind) {
  const separator = SEPARATOR[kind];
  if (!separator)
    throw new Error(`No parent and child modules for edge kind ${kind}`);
  const within = (inner, outer) => inner.startsWith(`${outer}${separator}`);
  const childOf = (parent, id) => {
    const rest = id.slice(parent.length + separator.length);
    const end = rest.indexOf(separator);
    return `${parent}${separator}${end < 0 ? rest : rest.slice(0, end)}`;
  };
  const down = new Set();
  const up = new Set();
  for (const edge of edges) {
    if (edge.kind !== kind || edge.from === edge.to) continue;
    if (within(edge.to, edge.from) && edge.from.split(separator).length > 1)
      down.add(`${edge.from}\0${childOf(edge.from, edge.to)}`);
    if (within(edge.from, edge.to) && edge.to.split(separator).length > 1)
      up.add(`${edge.to}\0${childOf(edge.to, edge.from)}`);
  }
  return [...down]
    .filter((pair) => up.has(pair))
    .map((pair) => pair.split("\0"))
    .sort((a, b) => a.join().localeCompare(b.join()));
}

function cycles(edges, kind) {
  const unit = UNIT[kind];
  if (!unit) throw new Error(`No cycle unit for edge kind ${kind}`);
  const graph = new Map();
  for (const edge of edges) {
    if (edge.kind !== kind) continue;
    const from = unit(edge.from);
    const to = unit(edge.to);
    if (!from || !to || from === to) continue;
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from).add(to);
    if (!graph.has(to)) graph.set(to, new Set());
  }
  const index = new Map();
  const low = new Map();
  const stack = [];
  const open = new Set();
  const found = [];
  const visit = (node) => {
    index.set(node, index.size);
    low.set(node, index.get(node));
    stack.push(node);
    open.add(node);
    for (const next of [...graph.get(node)].sort()) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (open.has(next))
        low.set(node, Math.min(low.get(node), index.get(next)));
    }
    if (low.get(node) === index.get(node)) {
      const members = [];
      let top;
      do {
        top = stack.pop();
        open.delete(top);
        members.push(top);
      } while (top !== node);
      if (members.length > 1) found.push(members.sort());
    }
  };
  for (const node of [...graph.keys()].sort())
    if (!index.has(node)) visit(node);
  return found.sort((a, b) => a.join().localeCompare(b.join()));
}

function violations(rule, facts) {
  if (rule.check === "forbid_code") {
    const from = matcher(rule.from);
    const to = matcher(rule.to);
    return facts.edges
      .filter(
        (edge) =>
          from(edge.from) &&
          to(edge.to) &&
          (!rule.kinds?.length || rule.kinds.includes(edge.kind)),
      )
      .map((edge) => ({
        id: `${rule.id}: ${edge.kind}(${edge.from},${edge.to})`,
        at: `${edge.evidence[0].path}:${edge.evidence[0].line}`,
      }));
  }
  if (rule.check === "forbid_cross") {
    const root = rule.group.replace(/::$/, "");
    const family = (id) =>
      id === root
        ? ""
        : id.startsWith(rule.group)
          ? id.slice(rule.group.length).split("::")[0]
          : null;
    return facts.edges
      .filter(
        (edge) =>
          family(edge.from) !== null &&
          family(edge.to) !== null &&
          family(edge.from) !== family(edge.to) &&
          (!rule.kinds?.length || rule.kinds.includes(edge.kind)),
      )
      .map((edge) => ({
        id: `${rule.id}: ${edge.kind}(${edge.from},${edge.to})`,
        at: `${edge.evidence[0].path}:${edge.evidence[0].line}`,
      }));
  }
  if (rule.check === "forbid_unresolved") {
    return facts.unresolved
      .filter((item) => rule.kinds.includes(item.kind))
      .map((item) => ({
        id: `${rule.id}: ${item.id}`,
        at: item.evidence
          ? `${item.evidence.path}:${item.evidence.line}`
          : null,
      }));
  }
  if (rule.check === "forbid_reach") {
    const to = matcher(rule.to);
    const reached = lockReach(facts.lock, rule.from);
    if (!reached)
      return [
        {
          id: `${rule.id}: ${rule.from} is not in Cargo.lock`,
          at: "Cargo.lock",
        },
      ];
    return reached.filter(to).map((name) => ({
      id: `${rule.id}: ${rule.from} reaches ${name}`,
      at: "Cargo.lock",
    }));
  }
  if (rule.check === "acyclic") {
    const found = rule.children
      ? childCycles(facts.edges, rule.kind)
      : cycles(facts.edges, rule.kind);
    return found.map((members) => ({
      id: `${rule.id}: ${members.join(" <-> ")}`,
      at: null,
    }));
  }
  if (rule.check === "max_lines") {
    const inside = matcher(rule.roots);
    const outside = matcher(rule.exclude);
    return Object.entries(facts.sizes)
      .filter(
        ([file, count]) =>
          count > rule.limit &&
          inside(file) &&
          !outside(file) &&
          !(
            file.endsWith(".js") && file.replace(/\.js$/, ".ts") in facts.sizes
          ),
      )
      .map(([file, count]) => ({
        id: `${rule.id}: ${file}`,
        at: file,
        count,
        unit: "lines",
        limit: rule.limit,
      }));
  }
  if (rule.check === "forbid_terms" || rule.check === "forbid_literal") {
    return [...facts.terms.get(rule.id)].map(([id, hits]) => ({
      id: `${rule.id}: ${id}`,
      at: `${hits[0].file}:${hits[0].line}`,
      count: hits.length,
      unit: rule.check === "forbid_literal" ? "literals" : "hits",
      limit: 0,
    }));
  }
  if (rule.check === "one_owner") {
    return ownersOf
      .ownership(facts.contexts, facts.sizes)
      .map((item) => ({ ...item, id: `${rule.id}: ${item.id}` }));
  }
  if (rule.check === "intended_edges") {
    return ownersOf
      .intendedViolations(facts.crossEdges, facts.intended)
      .map((item) => ({ ...item, id: `${rule.id}: ${item.id}` }));
  }
  throw new Error(`Rule ${rule.id} has unknown check ${rule.check}`);
}

function gate({
  repository,
  revision,
  rules = path.join(HERE, "rules.yaml"),
  known = path.join(HERE, "known-violations.yaml"),
  intended = path.join(HERE, "intended.yaml"),
  write = false,
}) {
  const tree = revision ?? workingTree(repository);
  const ruleList = parse(fs.readFileSync(rules, "utf8")).rules;
  const tables = new Map(
    ruleList
      .filter((rule) => rule.check === "forbid_terms")
      .map((rule) => [
        rule.id,
        vocabulary.load(path.join(path.dirname(rules), rule.table)),
      ]),
  );
  const exact = ruleList
    .filter((rule) => rule.check === "forbid_literal")
    .map((rule) => literals.load(rule));
  const observation = observe(
    repository,
    tree,
    undefined,
    (snapshot) =>
      new Map([
        ...[...tables].map(([id, table]) => [
          id,
          vocabulary.scanSnapshot(table, snapshot),
        ]),
        ...exact.map((table) => [
          table.id,
          literals.scanSnapshot(table, snapshot),
        ]),
      ]),
  );
  const contexts = parse(
    fs.readFileSync(path.join(path.dirname(rules), "vocabulary.yaml"), "utf8"),
  ).contexts;
  const crossEdges = ownersOf.crossEdges(
    contexts,
    observation.observed.nodes,
    observation.observed.edges,
  );
  if (write) {
    fs.writeFileSync(intended, ownersOf.intendedText(crossEdges));
    return {
      report: `wrote ${crossEdges.length} cross-owner edges to ${path.basename(intended)}\n`,
      ok: true,
    };
  }
  const facts = {
    contexts,
    crossEdges,
    intended: ownersOf.loadIntended(intended),
    terms: observation.scanned,
    edges: observation.observed.edges,
    unresolved: observation.observed.unresolved,
    sizes: observation.sizes,
    lock: observation.lock,
  };
  const entries = parse(fs.readFileSync(known, "utf8")).known ?? [];
  for (const entry of entries)
    if (!entry.id || !entry.owner || !entry.reason)
      throw new Error(
        `Known violation needs id, owner and reason: ${JSON.stringify(entry)}`,
      );
  const found = new Map();
  for (const rule of ruleList)
    for (const item of violations(rule, facts)) found.set(item.id, item);
  const recorded = new Map(entries.map((entry) => [entry.id, entry]));
  const fresh = [];
  const stale = [];
  for (const [id, item] of [...found].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const entry = recorded.get(id);
    const where = item.at ? ` (${item.at})` : "";
    if (!entry) {
      (item.label === "STALE" ? stale : fresh).push(
        item.count === undefined
          ? `${item.label ?? "NEW"} ${id}${where}`
          : `NEW ${id} has ${item.count} ${item.unit}, over the limit of ${item.limit}`,
      );
    } else if (item.count !== undefined) {
      if (typeof entry.limit !== "number")
        throw new Error(`Known size violation needs a numeric limit: ${id}`);
      if (item.count > entry.limit)
        fresh.push(
          `NEW ${id} has ${item.count} ${item.unit}, over its recorded limit of ${entry.limit}`,
        );
      else if (item.count < entry.limit)
        stale.push(
          `STALE ${id} has ${item.count} ${item.unit}, lower its recorded limit from ${entry.limit} to ${item.count} in known-violations.yaml`,
        );
    }
  }
  for (const id of [...recorded.keys()].sort())
    if (!found.has(id))
      stale.push(
        `STALE ${id} (no longer found, remove it from known-violations.yaml)`,
      );
  const lines = [
    `architecture gate: ${ruleList.length} rules, ${found.size} violations, ${[...found.keys()].filter((id) => recorded.has(id)).length} known`,
    ...fresh,
    ...stale,
  ];
  lines.push(fresh.length || stale.length ? "FAIL" : "PASS");
  return {
    report: `${lines.join("\n")}\n`,
    ok: !fresh.length && !stale.length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  try {
    const result = gate({
      repository: path.resolve(
        option("--repository") ?? path.join(HERE, "../.."),
      ),
      revision: option("--rev"),
      rules: option("--rules") && path.resolve(option("--rules")),
      known: option("--known") && path.resolve(option("--known")),
      intended: option("--intended") && path.resolve(option("--intended")),
      write: args.includes("--write-intended"),
    });
    process.stdout.write(result.report);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`architecture gate: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { gate };
