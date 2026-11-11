const { execFileSync } = require("node:child_process");
const { digest } = require("./observe.cjs");

const IGNORED = new Set(["evidence", "evidence_total", "occurrences"]);

const VERBS = {
  depends_on: ["now depends on", "no longer depends on"],
  uses: ["now uses", "no longer uses"],
  uses_crate: ["now uses", "no longer uses"],
  spawns: ["now starts the program", "no longer starts the program"],
  exposes: ["now gives scripts", "no longer gives scripts"],
  imports: ["now imports", "no longer imports"],
  embeds: ["now embeds", "no longer embeds"],
  includes: ["now compiles", "no longer compiles"],
  generates: ["now generates", "no longer generates"],
  runs: ["now runs", "no longer runs"],
  reads_env: ["now reads", "no longer reads"],
  uses_location: ["now uses", "no longer uses"],
  offers: ["now offers the agent", "no longer offers the agent"],
  generated_from: ["is now generated from", "is no longer generated from"],
};

function label(node, id) {
  if (!node) return id;
  switch (node.kind) {
    case "crate":
      return `the ${node.name} crate`;
    case "module":
      return `\`${node.id.slice(3).replace(/ \(crate root\)$/, "")}\``;
    case "binary":
      return `the ${node.name} binary`;
    case "package":
      return `the ${node.name} package`;
    case "script":
      return `\`${node.file}\``;
    case "host-module":
      return `the \`${node.name}\` script module`;
    case "runtime-module":
      return `the \`${node.name}\` runtime module`;
    case "agent-tool":
      return `the \`${node.name}\` agent tool`;
    case "program":
      return `\`${node.name}\``;
    case "environment":
      return `\`${node.name}\``;
    case "location":
      return `\`${node.name}\``;
    case "dependency":
      return `the ${node.name} crate dependency`;
    case "artifact":
      return `the generated \`${node.name}\``;
    case "generator":
      return `the generator \`${node.name}\``;
    case "source":
      return `\`${node.name}\``;
    case "files":
      return `files in \`${node.name}\``;
    case "container":
      return node.name;
    default:
      return node.name ?? id;
  }
}

function strip(item) {
  return JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !IGNORED.has(key))));
}

function diff(before, after) {
  const result = { nodes: { added: [], removed: [], changed: [] }, edges: { added: [], removed: [], changed: [] } };
  for (const key of ["nodes", "edges"]) {
    const old = new Map(before[key].map((item) => [item.id, item]));
    const now = new Map(after[key].map((item) => [item.id, item]));
    for (const [id, item] of now) {
      if (!old.has(id)) result[key].added.push(id);
      else if (strip(old.get(id)) !== strip(item)) {
        const fields = Object.keys({ ...old.get(id), ...item }).filter((field) => !IGNORED.has(field) && JSON.stringify(old.get(id)[field]) !== JSON.stringify(item[field]));
        result[key].changed.push({ id, fields: fields.sort() });
      }
    }
    for (const id of old.keys()) if (!now.has(id)) result[key].removed.push(id);
    result[key].added.sort();
    result[key].removed.sort();
    result[key].changed.sort((a, b) => a.id.localeCompare(b.id));
  }
  return result;
}

function top(nodes, id) {
  let current = nodes.get(id);
  while (current?.parent && nodes.has(current.parent) && nodes.get(current.parent).kind !== "container") current = nodes.get(current.parent);
  return current?.id ?? id;
}

function walkthrough(change, before, after) {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  const node = (id) => afterNodes.get(id) ?? beforeNodes.get(id);
  const sections = new Map();
  const add = (area, step) => {
    if (!sections.has(area)) sections.set(area, []);
    sections.get(area).push(step);
  };
  const area = (id) => top(afterNodes.has(id) ? afterNodes : beforeNodes, id);
  for (const id of change.nodes.added) add(area(id), { change: "added", subject: id, text: `${capital(label(node(id), id))} appears.`, side: "after", evidence: afterNodes.get(id).evidence[0] });
  for (const id of change.nodes.removed) add(area(id), { change: "removed", subject: id, text: `${capital(label(node(id), id))} is gone.`, side: "before", evidence: beforeNodes.get(id).evidence[0] });
  for (const { id, fields } of change.nodes.changed) {
    const was = beforeNodes.get(id);
    const now = afterNodes.get(id);
    const details = fields.map((field) => describe(field, was[field], now[field]));
    add(area(id), { change: "changed", subject: id, text: `${capital(label(now, id))} changed: ${details.join("; ")}.`, side: "after", evidence: now.evidence[0] });
  }
  const sentence = (edge, verb) => `${capital(label(node(edge.from), edge.from))} ${verb} ${label(node(edge.to), edge.to)}.`;
  for (const id of change.edges.added) {
    const edge = afterEdges.get(id);
    add(area(edge.from), { change: "added", subject: id, text: sentence(edge, (VERBS[edge.kind] ?? ["now relates to"])[0]), side: "after", evidence: edge.evidence[0] });
  }
  for (const id of change.edges.removed) {
    const edge = beforeEdges.get(id);
    add(area(edge.from), { change: "removed", subject: id, text: sentence(edge, (VERBS[edge.kind] ?? ["", "no longer relates to"])[1]), side: "before", evidence: edge.evidence[0] });
  }
  for (const { id, fields } of change.edges.changed) {
    const was = beforeEdges.get(id);
    const now = afterEdges.get(id);
    add(area(now.from), { change: "changed", subject: id, text: `${sentence(now, (VERBS[now.kind] ?? ["relates to"])[0]).slice(0, -1).replace(" now ", " still ")}, with changed ${fields.map((field) => describe(field, was[field], now[field])).join("; ")}.`, side: "after", evidence: now.evidence[0] });
  }
  const order = { added: 0, changed: 1, removed: 2 };
  return [...sections]
    .map(([id, steps]) => {
      const counts = steps.reduce((out, step) => ({ ...out, [step.change]: (out[step.change] ?? 0) + 1 }), {});
      const headline = `${capital(label(node(id), id))}: ${Object.entries(counts)
        .sort(([a], [b]) => order[a] - order[b])
        .map(([kind, count]) => `${count} ${kind}`)
        .join(", ")}`;
      return { area: id, headline, steps: steps.sort((a, b) => order[a.change] - order[b.change] || a.subject.localeCompare(b.subject)) };
    })
    .sort((a, b) => b.steps.length - a.steps.length || a.area.localeCompare(b.area));
}

function describe(field, was, now) {
  if (Array.isArray(was) || Array.isArray(now)) {
    const old = new Set(was ?? []);
    const next = new Set(now ?? []);
    const gained = [...next].filter((item) => !old.has(item));
    const lost = [...old].filter((item) => !next.has(item));
    return `${field} ${[...gained.map((item) => `+${item}`), ...lost.map((item) => `-${item}`)].join(", ")}`;
  }
  const show = (value) => (value === undefined ? "none" : typeof value === "object" ? JSON.stringify(value) : String(value));
  return `${field} ${show(was)} to ${show(now)}`;
}

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function merges(repository, branch, from) {
  const list = execFileSync("git", ["-C", repository, "rev-list", "--first-parent", "--reverse", `${from}^..${branch}`], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  return list.map((commit) => {
    const [subject, ...body] = execFileSync("git", ["-C", repository, "log", "-1", "--format=%s%n%b", commit], { encoding: "utf8" }).trim().split("\n");
    const pull = /^Merge pull request #(\d+) from \S+?\/(\S+)/.exec(subject);
    return { commit, pull: pull ? Number(pull[1]) : null, branch: pull ? pull[2] : null, title: pull ? body.find((line) => line.trim())?.trim() ?? subject : subject };
  });
}

function hunks(repository, before, after, files) {
  const out = {};
  for (const file of [...files].sort()) {
    let text;
    try {
      text = execFileSync("git", ["-C", repository, "diff", "--no-color", "-U2", before, after, "--", file], { encoding: "utf8", maxBuffer: 1 << 26 });
    } catch {
      continue;
    }
    const list = [];
    for (const block of text.split(/\n(?=@@ )/).slice(1)) {
      const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(block);
      if (!header) continue;
      const lines = block.split("\n");
      list.push({ before: [Number(header[1]), Number(header[1]) + Number(header[2] ?? 1)], after: [Number(header[3]), Number(header[3]) + Number(header[4] ?? 1)], text: lines.slice(0, 60).join("\n") });
    }
    if (list.length) out[file] = list;
  }
  return out;
}

function changeKey(change) {
  return digest(JSON.stringify(change), 16);
}

module.exports = { diff, walkthrough, merges, hunks, changeKey, label };
