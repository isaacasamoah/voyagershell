const fs = require("node:fs");
const path = require("node:path");
const { digest } = require("./snapshot.cjs");

function indexDocuments(snapshot, graph, config, external) {
  const handles = new Map();
  const add = (handle, id, quoted = false) => {
    if (!handle) return;
    const key = `${quoted ? "`" : ""}${handle}`;
    if (!handles.has(key)) handles.set(key, new Set());
    handles.get(key).add(id);
  };
  const basenames = new Map();
  for (const node of graph.nodes.values())
    if (node.file && !node.inline)
      basenames.set(
        path.posix.basename(node.file),
        (basenames.get(path.posix.basename(node.file)) ?? 0) + 1,
      );
  for (const node of graph.nodes.values()) {
    if (node.kind === "container") continue;
    if (node.file && !node.inline && node.kind !== "crate") {
      add(node.file, node.id);
      const base = path.posix.basename(node.file);
      if (
        basenames.get(base) === 1 &&
        !["lib.rs", "main.rs", "mod.json", "main.ts", "mod.rs"].includes(base)
      )
        add(base, node.id);
    }
    if (node.kind === "crate")
      (add(node.name, node.id), add(`${node.area}/`, node.id));
    if (node.kind === "module" && !node.name.includes(" "))
      add(node.id.slice(3), node.id);
    if (
      ["host-module", "agent-tool", "environment", "binary"].includes(node.kind)
    )
      add(node.name, node.id);
    if (node.kind === "program") add(node.name, node.id, node.name.length < 5);
    if (node.kind === "dependency")
      add(node.id.slice(4), node.id, !/[-_]/.test(node.id.slice(4)));
    if (["package", "files", "artifact"].includes(node.kind))
      add(node.kind === "package" ? node.id.slice(8) : node.name, node.id);
  }
  const patterns = [...handles.keys()]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((key) => {
      const quoted = key.startsWith("`");
      const text = quoted ? key.slice(1) : key;
      const escaped = text.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
      return {
        key,
        ids: [...handles.get(key)].sort(),
        regex: new RegExp(
          quoted
            ? `\`${escaped}[\`\\s]`
            : `(?<![\\w/.-])${escaped}(?![\\w-]|/\\w)`,
          "g",
        ),
      };
    });
  const documents = [];
  const sources = [
    ...new Set(config.docs.flatMap((pattern) => snapshot.files(pattern))),
  ].map((file) => ({
    file,
    text: snapshot.read(file),
    blob: snapshot.blobs.get(file),
    tracked: true,
  }));
  for (const file of external)
    sources.push({
      file,
      text: fs.readFileSync(file, "utf8"),
      sha256: digest(fs.readFileSync(file)),
      tracked: false,
    });
  for (const source of sources) {
    const lines = source.text.split("\n");
    const sections = [];
    let current = null;
    let fence = false;
    lines.forEach((line, index) => {
      if (/^\s*```/.test(line)) fence = !fence;
      const heading = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading || !current) {
        current = {
          heading: heading ? heading[2].trim() : "(preamble)",
          level: heading ? heading[1].length : 0,
          line: index + 1,
          end: index + 1,
          mentions: new Map(),
        };
        sections.push(current);
      }
      current.end = index + 1;
      const claimed = [];
      for (const { ids, regex } of patterns) {
        regex.lastIndex = 0;
        for (let match; (match = regex.exec(line));) {
          const span = [match.index, match.index + match[0].length];
          if (claimed.some(([from, to]) => span[0] < to && span[1] > from))
            continue;
          claimed.push(span);
          for (const id of ids) {
            if (!current.mentions.has(id)) current.mentions.set(id, []);
            const list = current.mentions.get(id);
            if (!list.includes(index + 1)) list.push(index + 1);
          }
        }
      }
    });
    const title =
      sections.find((section) => section.level > 0)?.heading ?? source.file;
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
          mentions: [...section.mentions]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([node, list]) => ({ node, lines: list })),
        })),
    });
  }
  return documents.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = { indexDocuments };
