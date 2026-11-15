const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { observe } = require("./observe.cjs");

const HERE = __dirname;
const SCHEMA = "architecture-delta/v0";
const OFFERED = new Set(["offers", "exposes"]);
const USAGE =
  "usage: delta.cjs <base> <head> [--repository <path>] [--format table|json]";

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (values) => [...values].sort(compareText);

function difference(left, right) {
  return sorted([...right.keys()].filter((id) => !left.has(id))).map((id) =>
    right.get(id),
  );
}

function sides(base, head) {
  return { added: difference(base, head), removed: difference(head, base) };
}

function byId(list) {
  return new Map(list.map((item) => [item.id, item]));
}

function relations(edges, end, other) {
  const grouped = new Map();
  for (const edge of edges) {
    if (!grouped.has(edge[end])) grouped.set(edge[end], new Set());
    grouped.get(edge[end]).add(edge[other]);
  }
  return grouped;
}

function modules(edges) {
  const found = new Map();
  const note = (module, role, direction, ids) => {
    if (!found.has(module))
      found.set(module, {
        users: { added: [], removed: [] },
        dependencies: { added: [], removed: [] },
      });
    found.get(module)[role][direction] = sorted(ids);
  };
  for (const direction of ["added", "removed"]) {
    for (const [module, ids] of relations(edges[direction], "to", "from"))
      note(module, "users", direction, ids);
    for (const [module, ids] of relations(edges[direction], "from", "to"))
      note(module, "dependencies", direction, ids);
  }
  return sorted(found.keys()).map((id) => ({ id, ...found.get(id) }));
}

function hostFunctions(nodes) {
  const functions = new Map();
  for (const node of nodes.values())
    if (node.kind === "host-module")
      for (const name of node.functions ?? [])
        functions.set(`${node.name}.${name}`, {
          module: node.name,
          function: name,
        });
  return functions;
}

function summarise(edge) {
  return { kind: edge.kind, from: edge.from, to: edge.to };
}

function compare(baseSide, headSide) {
  const base = baseSide.observed;
  const head = headSide.observed;
  const baseNodes = byId(base.nodes);
  const headNodes = byId(head.nodes);
  const edges = sides(byId(base.edges), byId(head.edges));
  const nodes = sides(baseNodes, headNodes);
  const functions = sides(hostFunctions(baseNodes), hostFunctions(headNodes));
  const tools = (list) =>
    byId(list.filter((node) => node.kind === "agent-tool"));
  const agentTools = sides(tools(base.nodes), tools(head.nodes));
  const offered = (direction) =>
    edges[direction].filter((edge) => OFFERED.has(edge.kind));
  const ids = (list) => list.map((item) => item.id);
  const delta = {
    schema: SCHEMA,
    base: {
      revision: baseSide.revision,
      commit: base.provenance.source.commit,
    },
    head: {
      revision: headSide.revision,
      commit: head.provenance.source.commit,
    },
    nodes: { added: ids(nodes.added), removed: ids(nodes.removed) },
    edges: {
      added: edges.added.map(summarise),
      removed: edges.removed.map(summarise),
    },
    modules: modules(edges),
    surface: {
      hostFunctions: { added: functions.added, removed: functions.removed },
      agentTools: {
        added: ids(agentTools.added),
        removed: ids(agentTools.removed),
      },
      offered: {
        added: offered("added").map(summarise),
        removed: offered("removed").map(summarise),
      },
    },
  };
  delta.empty = !(
    delta.nodes.added.length +
    delta.nodes.removed.length +
    delta.edges.added.length +
    delta.edges.removed.length +
    functions.added.length +
    functions.removed.length
  );
  return delta;
}

function resolve(repository, revision) {
  try {
    execFileSync(
      "git",
      [
        "-C",
        repository,
        "rev-parse",
        "--verify",
        "--quiet",
        `${revision}^{tree}`,
      ],
      {
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    throw new Error(`${revision} is not a revision in ${repository}`);
  }
}

function delta({ repository, base, head }) {
  try {
    execFileSync("git", ["-C", repository, "rev-parse", "--git-dir"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(`${repository} is not a git repository`);
  }
  resolve(repository, base);
  resolve(repository, head);
  const read = (revision) => ({
    revision,
    ...observe(repository, revision),
  });
  return compare(read(base), read(head));
}

function line(sign, text) {
  return `  ${sign} ${text}`;
}

function section(title, added, removed) {
  if (!added.length && !removed.length) return [];
  return [
    title,
    ...added.map((text) => line("+", text)),
    ...removed.map((text) => line("-", text)),
  ];
}

function edgeText(edge) {
  return `${edge.from} -> ${edge.to} (${edge.kind})`;
}

function label(side) {
  const short = side.commit?.slice(0, 7);
  return !short || side.commit.startsWith(side.revision)
    ? side.revision
    : `${side.revision} (${short})`;
}

function table(result) {
  const lines = [
    `architecture delta ${label(result.base)} .. ${label(result.head)}`,
  ];
  if (result.empty) {
    lines.push("no structural change");
    return `${lines.join("\n")}\n`;
  }
  const { edges, nodes, modules: touched, surface } = result;
  lines.push(
    `nodes +${nodes.added.length} -${nodes.removed.length}, edges +${edges.added.length} -${edges.removed.length}`,
  );
  lines.push(
    ...section("Edges", edges.added.map(edgeText), edges.removed.map(edgeText)),
  );
  const fan = (module, role) =>
    `${role} +${module[role].added.length} -${module[role].removed.length}`;
  const fanLines = touched.map(
    (module) =>
      `  ${module.id}  ${fan(module, "users")}  ${fan(module, "dependencies")}`,
  );
  lines.push("Fan-in and fan-out", ...fanLines);
  const functionText = (item) => `${item.module}.${item.function}`;
  lines.push(
    ...section(
      "Host functions",
      surface.hostFunctions.added.map(functionText),
      surface.hostFunctions.removed.map(functionText),
    ),
    ...section(
      "Agent tools",
      surface.agentTools.added,
      surface.agentTools.removed,
    ),
    ...section(
      "Offered operations",
      surface.offered.added.map(edgeText),
      surface.offered.removed.map(edgeText),
    ),
  );
  return `${lines.join("\n")}\n`;
}

function parse(args) {
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repository" || arg === "--format") {
      if (index + 1 >= args.length || args[index + 1].startsWith("--"))
        throw new Error(`${arg} needs a value\n${USAGE}`);
      options[arg.slice(2)] = args[(index += 1)];
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else positional.push(arg);
  }
  const [base, head, ...extra] = positional;
  if (!base) throw new Error(`missing base revision\n${USAGE}`);
  if (!head) throw new Error(`missing head revision\n${USAGE}`);
  if (extra.length)
    throw new Error(`unexpected argument ${extra[0]}\n${USAGE}`);
  const format = options.format ?? "both";
  if (!["table", "json", "both"].includes(format))
    throw new Error(`unknown format ${format}\n${USAGE}`);
  return {
    base,
    head,
    format,
    repository: path.resolve(options.repository ?? path.join(HERE, "../..")),
  };
}

function render(result, format) {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (format === "json") return json;
  if (format === "table") return table(result);
  return `${table(result)}\n${json}`;
}

if (require.main === module) {
  try {
    const request = parse(process.argv.slice(2));
    process.stdout.write(render(delta(request), request.format));
  } catch (error) {
    process.stderr.write(`architecture delta: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { compare, delta, table, render };
