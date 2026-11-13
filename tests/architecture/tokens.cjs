const path = require("node:path");
const { call, scan, ENDS_BLOCK, ENDS_STATEMENT } = require("./rust.cjs");
const { relative, literal } = require("./snapshot.cjs");
const {
  container,
  sourceNode,
  hostModuleNode,
  environmentNode,
} = require("./nodes.cjs");

function spawnsProgram(site, { graph }) {
  const direct = literal(site.text);
  const fallback = /var_os\s*\(\s*"([A-Z0-9_]+)"\s*\)[\s\S]*?"([^"]+)"/.exec(
    site.text,
  );
  const program = direct ?? fallback?.[2];
  if (!program) return "The program comes from a runtime value";
  const name = path.posix.basename(program);
  graph.node(`program:${name}`, {
    kind: "program",
    name,
    area: "external",
    basis: "parsed",
  });
  graph.edge("spawns", site.from, `program:${name}`, site.evidence, {
    basis: "parsed",
    extract_by: "rust:Command::new",
    override: fallback ? `env:${fallback[1]}` : undefined,
  });
  if (fallback) environmentNode(graph, fallback[1]);
}

function builderCalls(analysis, chain, start) {
  const functions = [];
  let declarations;
  const builder = /\.\s*(async_function|function|declarations)\s*\(\s*/g;
  for (let step; (step = builder.exec(chain));) {
    if (scan(analysis, start, start + step.index).depth !== 0) continue;
    const inner = call(
      analysis,
      start + step.index + step[0].trimEnd().length - 1,
    );
    if (!inner) continue;
    if (step[1] === "declarations") declarations = inner.text.trim();
    else {
      const name = /^\s*"([^"]+)"/.exec(inner.text);
      if (name) functions.push(name[1]);
    }
  }
  return { functions, declarations };
}

function exposesHostModule(site, { graph, constant }) {
  const { analysis, file, index } = site;
  const named =
    literal(site.text) ?? constant(file, site.ownerId, site.text)?.value;
  if (!named)
    return "The host module name is not a literal or a resolvable string constant";
  const chains = [site.argument.close + 1];
  const binding = /\blet\s+(?:mut\s+)?(\w+)\s*=\s*$/.exec(
    analysis.masked.slice(Math.max(0, index - 80), index),
  );
  if (binding) {
    const limit = scan(analysis, index, analysis.bare.length, ENDS_BLOCK).index;
    const rebind = new RegExp(
      `\\b(?:let\\s+(?:mut\\s+)?)?${binding[1]}\\s*=\\s*${binding[1]}\\b`,
      "g",
    );
    rebind.lastIndex = site.argument.close;
    for (
      let again;
      (again = rebind.exec(analysis.masked)) && again.index < limit;
    )
      chains.push(again.index + again[0].length);
  }
  const functions = [];
  let declarations;
  for (const start of chains) {
    const end = scan(
      analysis,
      start,
      analysis.bare.length,
      ENDS_STATEMENT,
    ).index;
    const found = builderCalls(
      analysis,
      analysis.masked.slice(start, end),
      start,
    );
    functions.push(...found.functions);
    if (found.declarations !== undefined)
      declarations = constant(file, site.ownerId, found.declarations);
  }
  const node = hostModuleNode(graph, named, {
    extractBy: "rust:HostModule",
  });
  node.functions = [
    ...new Set([...(node.functions ?? []), ...functions]),
  ].sort();
  if (declarations) {
    node.declarations = {
      path: declarations.file,
      line: declarations.line,
      generated: graph.artifactOf(declarations.file) !== null,
    };
    graph.attach(node, graph.evidence(declarations.file, declarations.line));
  }
  graph.edge("exposes", site.from, node.id, site.evidence, {
    basis: "parsed",
    extract_by: "rust:HostModule",
    functions: functions.length,
  });
}

function exposesComponents(site, { graph }) {
  const named = /"([^"]+)"\s*,?\s*$/.exec(site.text)?.[1];
  if (!named) return "The component module name is not a literal";
  const node = hostModuleNode(graph, named, {
    provides: "components",
    extractBy: "rust:ComponentRegistry",
  });
  graph.edge("exposes", site.from, node.id, site.evidence, {
    basis: "parsed",
    extract_by: "rust:ComponentRegistry",
  });
}

function embedsFile(site, { snapshot, graph }) {
  const value = literal(site.text);
  const target = value && relative(site.file, value);
  if (!target || !snapshot.has(target))
    return "The embedded path is not a literal file in the commit";
  let id = graph.ownerOf(target);
  if (!id) {
    const directory = path.posix.dirname(target);
    id = `files:${directory}`;
    container(graph, "group:embedded-files", "Embedded files");
    graph.node(id, {
      kind: "files",
      name: directory,
      parent: "group:embedded-files",
      area: directory.split("/")[0],
      basis: "parsed",
    });
  }
  const edge = graph.edge("embeds", site.from, id, site.evidence, {
    basis: "parsed",
    extract_by: "rust:include",
  });
  edge.files = [...new Set([...(edge.files ?? []), target])].sort();
}

function includesSource(site, { snapshot, graph }) {
  const value = literal(site.text);
  const target = value && relative(site.file, value);
  if (!target || !snapshot.has(target))
    return "The included path is not a literal file in the commit";
  const source = sourceNode(graph, target);
  graph.edge("includes", site.from, source.id, site.evidence, {
    basis: "parsed",
    extract_by: "rust:include",
  });
}

function generatedFrom(site, { graph }) {
  const value = /"([^"]+)"/.exec(site.text)?.[1];
  const target = value && path.posix.join(site.entry.info.directory, value);
  const id = target && graph.ownerOf(target);
  if (!id)
    return "The schema path does not belong to a known generated artifact";
  graph.edge("generated_from", site.from, id, site.evidence, {
    basis: "parsed",
    extract_by: "rust:import_types",
    file: target,
  });
}

function readsEnvironment(site, { graph }) {
  const name = literal(site.text);
  if (!name) return "The variable name is not a literal";
  environmentNode(graph, name);
  graph.edge("reads_env", site.from, `env:${name}`, site.evidence, {
    basis: "parsed",
    extract_by: "rust:env::var",
  });
}

function usesLocation(token) {
  return (site, { graph }) => {
    const value = literal(site.text);
    if (!value) return "The joined path is not a literal";
    container(graph, "group:profile", "Installed profile");
    graph.node(`location:profile/${value}`, {
      kind: "location",
      name: `<profile>/${value}`,
      parent: "group:profile",
      area: "profile",
      basis: "parsed",
    });
    graph.edge(
      "uses_location",
      site.from,
      `location:profile/${value}`,
      site.evidence,
      { basis: "parsed", extract_by: `rust:${token}` },
    );
  };
}

function namesStructLiteral(rule) {
  return (site, { graph }) => {
    const { analysis } = site;
    const body = analysis.masked.slice(
      site.open + 1,
      analysis.partner.get(site.open),
    );
    const field = new RegExp(`\\b${rule.field}\\s*:\\s*"([^"]+)"`, "g");
    let name = null;
    for (let item; (item = field.exec(body));)
      if (scan(analysis, site.open + 1, site.open + 1 + item.index).depth === 0)
        name = name ?? item[1];
    if (!name) return `The ${rule.type} literal has no literal ${rule.field}`;
    container(graph, `group:${rule.kind}s`, rule.group ?? `${rule.kind}s`);
    graph.node(`${rule.kind}:${name}`, {
      kind: rule.kind,
      name,
      parent: `group:${rule.kind}s`,
      area: "agent",
      basis: "parsed",
      extract_by: `rust:${rule.type}`,
    });
    graph.edge(rule.edge, site.from, `${rule.kind}:${name}`, site.evidence, {
      basis: "parsed",
      extract_by: `rust:${rule.type}`,
    });
  };
}

function macroCall(name) {
  return new RegExp(`\\b${name}\\s*!\\s*[(\\[{]`, "g");
}

function tokenHandlers(config) {
  return [
    {
      token: "Command::new(",
      pattern: /\bCommand\s*::\s*new\s*\(/g,
      resolve: spawnsProgram,
    },
    {
      token: "HostModule::new(",
      pattern: /\bHostModule\s*::\s*new\s*\(/g,
      resolve: exposesHostModule,
    },
    {
      token: "ComponentRegistry::new(",
      pattern: /\bComponentRegistry\s*::\s*new\s*\(/g,
      resolve: exposesComponents,
    },
    {
      token: "include_str!/include_bytes!(",
      pattern: macroCall("include_(?:str|bytes)"),
      resolve: embedsFile,
    },
    {
      token: "include!(",
      pattern: macroCall("include"),
      resolve: includesSource,
    },
    {
      token: "import_types!(",
      pattern: macroCall("import_types"),
      resolve: generatedFrom,
    },
    {
      token: "env::var(",
      pattern: /\benv\s*::\s*var(?:_os)?\s*\(/g,
      resolve: readsEnvironment,
    },
    ...config.locationRoots.map((root) => ({
      token: `${root}.join(`,
      pattern: new RegExp(`\\b${root}\\s*\\.\\s*join\\s*\\(`, "g"),
      resolve: usesLocation(`${root}.join(`),
    })),
    ...config.structLiterals.map((rule) => ({
      token: `${rule.type} {`,
      pattern: new RegExp(`(?<!struct\\s+)\\b${rule.type}\\s*\\{`, "g"),
      resolve: namesStructLiteral(rule),
    })),
  ];
}

module.exports = { tokenHandlers };
