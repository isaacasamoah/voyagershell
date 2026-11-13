function container(graph, id, name) {
  return graph.node(id, { kind: "container", name, basis: "parsed" });
}

function sourceNode(graph, file) {
  container(
    graph,
    "group:experiment-sources",
    "Sources outside product crates",
  );
  return graph.node(`source:${file}`, {
    kind: "source",
    name: file,
    parent: "group:experiment-sources",
    area: file.split("/")[0],
    file,
    basis: "parsed",
  });
}

function hostModuleNode(graph, name, { provides, extractBy }) {
  container(graph, "group:script-interface", "Script modules from Rust");
  return graph.node(`host-module:${name}`, {
    kind: "host-module",
    name,
    parent: "group:script-interface",
    area: "script-host",
    provides,
    basis: "parsed",
    extract_by: extractBy,
  });
}

function environmentNode(graph, name) {
  container(graph, "group:environment", "Environment variables");
  return graph.node(`env:${name}`, {
    kind: "environment",
    name,
    parent: "group:environment",
    area: "external",
    basis: "parsed",
  });
}

module.exports = {
  container,
  sourceNode,
  hostModuleNode,
  environmentNode,
};
