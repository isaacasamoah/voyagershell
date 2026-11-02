import { parseGraph, explore } from "./graph.js";

const element = id => document.getElementById(id);

async function read(name) {
  const response = await fetch(name);
  if (!response.ok) throw new Error(`Could not load ${name}: HTTP ${response.status}.`);
  return response.text();
}

function inspectStructure() {
  const source = element("schema").value;
  const definitions = [...source.matchAll(/node\s+(\w+)\s*\{([^}]+)\}/g)];
  const selected = element("record-type").value;
  element("record-type").replaceChildren(...definitions.map(match => new Option(match[1], match[1])));
  if (definitions.some(match => match[1] === selected)) element("record-type").value = selected;
  const definition = definitions.find(match => match[1] === element("record-type").value);
  element("type-fields").replaceChildren();
  if (!definition) {
    element("type-fields").textContent = "No record types recognized. This preview is not a schema validator.";
    return;
  }
  const fields = document.createElement("p");
  fields.textContent = definition[2].trim().split("\n").map(line => line.trim()).join(" · ");
  const relations = document.createElement("p");
  relations.textContent = [...source.matchAll(/edge\s+(\w+):\s*(\w+)\s*->\s*(\w+)/g)]
    .filter(match => match[2] === definition[1] || match[3] === definition[1])
    .map(match => `${match[1]}: ${match[2]} → ${match[3]}`).join(" · ");
  element("type-fields").append(fields, relations);
}

function inspectBindings() {
  element("bindings").replaceChildren();
  const matches = [...element("binding-source").value.matchAll(/^  (\w+): \{node: (\w+)/gm)];
  for (const match of matches) {
    const role = document.createElement("dt");
    const node = document.createElement("dd");
    role.textContent = match[1];
    node.textContent = match[2];
    element("bindings").append(role, node);
  }
  if (!matches.length) element("bindings").textContent = "No bindings recognized in this draft. Inspect the source; no adapter is running.";
}

async function start() {
  const [schema, usage, queries, records, rawMetadata] = await Promise.all(
    ["progress.pg", "usage.yaml", "progress.gq", "export.jsonl", "snapshot.json"].map(read));
  const metadata = JSON.parse(rawMetadata);
  const graph = parseGraph(records);
  const mapping = usage.match(/^  roles:\n[\s\S]*?(?=^  operations:)/m);
  if (!mapping) throw new Error("The recorded profile has no recognizable role and relation bindings.");
  element("schema").value = schema;
  element("binding-source").value = mapping[0].replace(/^  /gm, "");
  element("usage").value = usage.replace(mapping[0], "  bindings: bindings.yaml\n");
  element("queries").value = queries;
  inspectStructure();
  inspectBindings();
  element("schema").addEventListener("input", inspectStructure);
  element("record-type").addEventListener("change", inspectStructure);
  element("binding-source").addEventListener("input", inspectBindings);
  element("snapshot-source").textContent = `Recorded OmniGraph trial ${metadata.record} · ${graph.nodes.length} nodes · ${graph.edges.length} edges`;
  element("provenance").textContent = `Source: export.jsonl · SHA-256 ${metadata.export_sha256}. D3 ${window.d3.version}.`;
  explore(graph);
  element("setup").addEventListener("submit", event => {
    event.preventDefault();
    const inputs = ["voyage-name", "objective", "schema", "binding-source", "usage", "queries"].map(element);
    inputs.forEach(input => input.setCustomValidity(input.value.trim() ? "" : "Enter a value before exporting."));
    const invalid = inputs.find(input => !input.checkValidity());
    if (invalid) {
      let details = invalid.closest("details");
      while (details) {
        details.open = true;
        details = details.parentElement.closest("details");
      }
      element("export-status").textContent = `Enter ${invalid.labels[0].textContent.trim()} before exporting.`;
      event.target.reportValidity();
      return;
    }
    const draft = {
      kind: "voyage-setup-preview", active: false, engine_validated: false,
      voyage: { name: element("voyage-name").value.trim(), objective: element("objective").value.trim() },
      graph_structure: { file: "progress.pg", source: element("schema").value,
        bindings: { file: "bindings.yaml", source: element("binding-source").value } },
      agent_use: { file: "usage.yaml", source: element("usage").value, queries: element("queries").value },
      recorded_snapshot: metadata,
      effect: "Configuration export only. No Voyage, graph or policy was created or activated."
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "voyage-research-draft.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    element("export-status").textContent = "Setup draft exported. The recorded graph is unchanged. No Voyage or graph was created or activated.";
  });
  document.querySelectorAll("input, textarea").forEach(input => input.addEventListener("input", () => {
    input.setCustomValidity("");
    element("export-status").textContent = "Draft changed. The recorded graph is unchanged.";
  }));
  element("loading").hidden = true;
  element("content").hidden = false;
}

start().catch(error => {
  element("loading").hidden = true;
  element("error").textContent = `The preview could not open. ${error.message} No graph or configuration was changed.`;
  element("error").hidden = false;
});
