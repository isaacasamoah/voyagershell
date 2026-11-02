const d3 = window.d3;
const label = row => row.data?.label || row.data?.name || row.data?.key || row.id;
const title = row => row.type ? `${row.type}: ${label(row)}` : `${row.edge}: ${row.from} → ${row.to}`;

export function parseGraph(text) {
  const rows = text.trim().split("\n").map(line => JSON.parse(line));
  const nodes = rows.filter(row => row.type);
  const edges = rows.filter(row => row.edge);
  const keys = new Set(nodes.map(node => node.data.key));
  if (!nodes.length || keys.size !== nodes.length || edges.some(edge => !keys.has(edge.from) || !keys.has(edge.to))) {
    throw new Error("The recorded graph has missing nodes, duplicate keys or unresolved edges.");
  }
  return { nodes, edges };
}

export function explore(graph) {
  const svg = d3.select("#graph");
  const layer = svg.append("g");
  const marker = svg.append("defs").append("marker")
    .attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 22)
    .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto");
  marker.append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#7f9489");
  const zoom = d3.zoom().scaleExtent([0.35, 4]).filter(event => event.type !== "wheel" && !event.button)
    .on("zoom", event => layer.attr("transform", event.transform));
  svg.call(zoom);
  const find = document.querySelector("#find-record");
  const fields = document.querySelector("#metadata-fields");
  const related = document.querySelector("#related");
  const types = [...new Set(graph.nodes.map(node => node.type))];
  const color = d3.scaleOrdinal(types, ["#245a43", "#516d98", "#956125", "#7c4f7e", "#3c7381", "#7b674b", "#52694b", "#88625d", "#425c86", "#67627b", "#477a68"]);
  let visibleNodes = [];
  let visibleEdges = [];
  let nodeElements;
  let edgeElements;
  let pinned;

  function pick(row, preview = false) {
    if (!preview) pinned = row;
    document.querySelector("#selection-state").textContent = preview ? "Hover preview" : "Selected record";
    document.querySelector("#metadata-heading").textContent = title(row);
    fields.replaceChildren();
    const values = row.type ? { type: row.type, ...row.data } : { relation: row.edge, id: row.id, from: row.from, to: row.to, ...row.data };
    const primary = ["type", "relation", "key", "result", "review", "status", "statement", "question", "objective", "content", "summary", "reason", "rationale", "origin", "from", "to"];
    const keys = [...new Set([...primary.filter(key => key in values), ...Object.keys(values)])];
    for (const key of keys) {
      const value = values[key];
      const term = document.createElement("dt");
      term.textContent = key.replaceAll("_", " ");
      const definition = document.createElement("dd");
      definition.textContent = value === null ? "Not recorded" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
      fields.append(term, definition);
    }
    nodeElements.classed("selected", node => node.record === row);
    edgeElements.classed("selected", edge => edge.record === row);
    related.replaceChildren();
    const relations = row.type
      ? visibleEdges.filter(edge => edge.from === row.data.key || edge.to === row.data.key)
      : visibleNodes.filter(node => node.data.key === row.from || node.data.key === row.to);
    for (const other of relations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "related";
      button.textContent = title(other);
      button.addEventListener("click", () => pick(other));
      related.append(button);
    }
    if (!preview) find.value = row.type ? `node:${row.data.key}` : `edge:${row.id}`;
  }

  function interactions(selection) {
    selection.on("pointerenter", (event, item) => pick(item.record, true))
      .on("pointerleave", () => pinned && pick(pinned))
      .on("focus", (event, item) => pick(item.record))
      .on("click", (event, item) => pick(item.record))
      .on("keydown", (event, item) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          pick(item.record);
        }
      });
  }

  function render(scope) {
    const allowed = new Set(scope === "all" ? graph.nodes.map(node => node.data.key) : [scope]);
    if (scope !== "all") {
      let changed = true;
      const participants = new Set(graph.nodes.filter(node => node.type === "Participant").map(node => node.data.key));
      while (changed) {
        changed = false;
        for (const edge of graph.edges) {
          if (participants.has(edge.from) || participants.has(edge.to)) continue;
          if (allowed.has(edge.from) === allowed.has(edge.to)) continue;
          allowed.add(edge.from);
          allowed.add(edge.to);
          changed = true;
        }
      }
      for (const edge of graph.edges) {
        if (allowed.has(edge.from) && participants.has(edge.to)) allowed.add(edge.to);
        if (allowed.has(edge.to) && participants.has(edge.from)) allowed.add(edge.from);
      }
    }
    visibleNodes = graph.nodes.filter(node => allowed.has(node.data.key));
    visibleEdges = graph.edges.filter(edge => allowed.has(edge.from) && allowed.has(edge.to));
    document.querySelector("#graph-count").textContent = `${visibleNodes.length} nodes · ${visibleEdges.length} edges.`;
    find.replaceChildren(new Option("Choose a record", ""));
    for (const node of visibleNodes) find.add(new Option(title(node), `node:${node.data.key}`));
    for (const edge of visibleEdges) find.add(new Option(title(edge), `edge:${edge.id}`));
    layer.selectAll("*").remove();
    const nodes = visibleNodes.map(record => ({ id: record.data.key, record }));
    const edges = visibleEdges.map(record => ({ source: record.from, target: record.to, record }));
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id(node => node.id).distance(95))
      .force("charge", d3.forceManyBody().strength(-220))
      .force("collide", d3.forceCollide(22))
      .force("center", d3.forceCenter(500, 290)).stop();
    simulation.tick(240);
    nodes.forEach(node => {
      node.x = Math.max(30, Math.min(970, node.x));
      node.y = Math.max(30, Math.min(550, node.y));
    });
    const path = edge => {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const radius = Math.hypot(dx, dy) * 1.4;
      return `M${edge.source.x},${edge.source.y}A${radius},${radius} 0 0,1 ${edge.target.x},${edge.target.y}`;
    };
    edgeElements = layer.append("g").selectAll("path").data(edges).join("path")
      .attr("class", "edge").attr("d", path).attr("marker-end", "url(#arrow)");
    const hit = layer.append("g").selectAll("path").data(edges).join("path")
      .attr("class", "edge-hit").attr("d", path).attr("tabindex", 0)
      .attr("role", "button").attr("aria-label", edge => title(edge.record));
    nodeElements = layer.append("g").selectAll("g").data(nodes).join("g")
      .attr("class", "node").attr("transform", node => `translate(${node.x},${node.y})`)
      .attr("tabindex", 0).attr("role", "button").attr("aria-label", node => title(node.record));
    nodeElements.append("circle").attr("r", node => node.record.type === "Problem" ? 15 : 10)
      .attr("fill", node => color(node.record.type));
    nodeElements.append("title").text(node => title(node.record));
    interactions(hit);
    interactions(nodeElements);
    svg.call(zoom.transform, d3.zoomIdentity);
    pick(visibleNodes.find(node => node.type === "Problem") || visibleNodes[0]);
  }

  find.addEventListener("change", () => {
    const row = visibleNodes.find(node => `node:${node.data.key}` === find.value)
      || visibleEdges.find(edge => `edge:${edge.id}` === find.value);
    if (row) pick(row);
  });
  document.querySelector("#scope").addEventListener("change", event => render(event.target.value));
  document.querySelector("#zoom-in").addEventListener("click", () => svg.call(zoom.scaleBy, 1.3));
  document.querySelector("#zoom-out").addEventListener("click", () => svg.call(zoom.scaleBy, 1 / 1.3));
  document.querySelector("#reset-view").addEventListener("click", () => svg.call(zoom.transform, d3.zoomIdentity));
  render("all");
}
