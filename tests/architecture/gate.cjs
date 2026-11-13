const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { observe, lockReach } = require("./observe.cjs");
const { parse } = require("./yaml.cjs");

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

function cycles(edges) {
  const graph = new Map();
  for (const edge of edges) {
    if (edge.kind !== "uses") continue;
    const from = topModule(edge.from);
    const to = topModule(edge.to);
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
    return cycles(facts.edges).map((members) => ({
      id: `${rule.id}: ${members.join(" <-> ")}`,
      at: null,
    }));
  }
  throw new Error(`Rule ${rule.id} has unknown check ${rule.check}`);
}

function gate({
  repository,
  revision,
  rules = path.join(HERE, "rules.yaml"),
  known = path.join(HERE, "known-violations.yaml"),
}) {
  const tree = revision ?? workingTree(repository);
  const facts = observe(repository, tree);
  const ruleList = parse(fs.readFileSync(rules, "utf8")).rules;
  const entries = parse(fs.readFileSync(known, "utf8")).known ?? [];
  for (const entry of entries)
    if (!entry.id || !entry.owner || !entry.reason)
      throw new Error(
        `Known violation needs id, owner and reason: ${JSON.stringify(entry)}`,
      );
  const found = new Map();
  for (const rule of ruleList)
    for (const item of violations(rule, facts)) found.set(item.id, item.at);
  const accepted = new Set(entries.map((entry) => entry.id));
  const fresh = [...found.keys()].filter((id) => !accepted.has(id)).sort();
  const stale = [...accepted].filter((id) => !found.has(id)).sort();
  const lines = [
    `architecture gate: ${ruleList.length} rules, ${found.size} violations, ${found.size - fresh.length} known`,
  ];
  for (const id of fresh)
    lines.push(`NEW ${id}${found.get(id) ? ` (${found.get(id)})` : ""}`);
  for (const id of stale)
    lines.push(
      `STALE ${id} (no longer found, remove it from known-violations.yaml)`,
    );
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
  const result = gate({
    repository: path.resolve(
      option("--repository") ?? path.join(HERE, "../.."),
    ),
    revision: option("--rev"),
    rules: option("--rules") && path.resolve(option("--rules")),
    known: option("--known") && path.resolve(option("--known")),
  });
  process.stdout.write(result.report);
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = { gate };
