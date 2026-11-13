const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { analyse, modules, call, statementEnd, depthAt } = require("./rust.cjs");
const { relative, literal } = require("./snapshot.cjs");

function observeCargo(snapshot, graph, config) {
  if (!snapshot.has("Cargo.toml")) return [];
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--format-version",
        "1",
        "--no-deps",
        "--offline",
        "--locked",
        "--manifest-path",
        path.join(snapshot.root, "Cargo.toml"),
      ],
      {
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  const local = (absolute) =>
    path.relative(snapshot.root, absolute).split(path.sep).join("/");
  const members = new Set(metadata.workspace_members);
  const crates = [];
  graph.node("group:external-crates", {
    kind: "container",
    name: "External crates",
    basis: "declared",
  });
  for (const pack of metadata.packages
    .filter((item) => members.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const manifest = local(pack.manifest_path);
    const directory = path.posix.dirname(manifest);
    const lines = snapshot.read(manifest).split("\n");
    const find = (pattern) => {
      const index = lines.findIndex((text) => pattern.test(text));
      return index < 0 ? null : graph.evidence(manifest, index + 1);
    };
    const features = Object.fromEntries(
      Object.entries(pack.features)
        .filter(([name]) => name !== "default")
        .sort(),
    );
    const crate = graph.node(
      `crate:${pack.name}`,
      {
        kind: "crate",
        name: pack.name,
        area: directory,
        file: manifest,
        basis: "declared",
        extract_by: "cargo-metadata",
        features: Object.keys(features).length ? features : undefined,
      },
      find(new RegExp(`^\\s*name\\s*=\\s*"${pack.name}"`)),
    );
    const info = {
      name: pack.name,
      directory,
      crateId: crate.id,
      spaces: [],
      dependencies: new Map(),
    };
    for (const dependency of pack.dependencies) {
      const key = dependency.rename ?? dependency.name;
      const ident = key.replace(/-/g, "_");
      const evidence = find(
        new RegExp(
          `^\\s*(${key.replace(/[-]/g, "\\-")}\\s*=|\\[[^\\]]*dependencies\\.${key}\\])`,
        ),
      );
      if (dependency.kind === "dev") {
        info.dependencies.set(ident, null);
        continue;
      }
      const fields = {
        dependency_kind: dependency.kind ?? "normal",
        condition: dependency.target ?? undefined,
        optional: dependency.optional || undefined,
      };
      if (dependency.path) {
        info.dependencies.set(ident, `crate:${dependency.name}`);
        graph.edge(
          "depends_on",
          crate.id,
          `crate:${dependency.name}`,
          evidence,
          { basis: "declared", extract_by: "cargo-metadata", ...fields },
        );
      } else {
        const id = `dep:${dependency.name}`;
        graph.node(id, {
          kind: "dependency",
          name:
            key === dependency.name
              ? dependency.name
              : `${key} (${dependency.name})`,
          parent: "group:external-crates",
          area: "external",
          basis: "declared",
          source: dependency.source ?? undefined,
        });
        info.dependencies.set(ident, id);
        graph.edge("depends_on", crate.id, id, evidence, {
          basis: "declared",
          extract_by: "cargo-metadata",
          requirement: dependency.req,
          ...fields,
        });
      }
    }
    for (const target of [...pack.targets].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const source = local(target.src_path);
      if (target.kind.includes("lib")) {
        const ident = target.name.replace(/-/g, "_");
        graph.node(
          `rs:${ident}`,
          {
            kind: "module",
            name: `${ident} (crate root)`,
            parent: crate.id,
            area: directory,
            file: source,
            basis: "declared",
            extract_by: "cargo-metadata",
          },
          graph.evidence(source, 1),
        );
        info.spaces.push({
          ident,
          root: `rs:${ident}`,
          prefix: `rs:${ident}`,
          file: source,
          lib: true,
        });
      } else if (target.kind.includes("bin")) {
        const ident = target.name.replace(/-/g, "_");
        const declared =
          find(new RegExp(`^\\s*name\\s*=\\s*"${target.name}"`)) ??
          graph.evidence(source, 1);
        graph.node(
          `bin:${target.name}`,
          {
            kind: "binary",
            name: target.name,
            parent: crate.id,
            area: directory,
            file: source,
            basis: "declared",
            extract_by: "cargo-metadata",
          },
          declared,
        );
        info.spaces.push({
          ident,
          root: `bin:${target.name}`,
          prefix: `rs:${ident}`,
          file: source,
          lib: false,
        });
      }
    }
    crates.push(info);
  }
  return crates;
}

function observeRust(snapshot, graph, config, crates) {
  const known = new Set();
  const analyses = new Map();
  const childNames = new Map();
  const segments = new Map();
  const spaceOf = new Map();
  const infoOf = new Map();
  const ownership = new Map();
  const testFiles = new Set();
  const libraries = new Map();
  for (const info of crates)
    for (const space of info.spaces)
      if (space.lib) libraries.set(space.ident, { info, space });
  const moduleId = (space, list) =>
    list.length ? `${space.prefix}::${list.join("::")}` : space.root;
  const walk = (info, space, file, id, list, modRs) => {
    if (!snapshot.has(file)) {
      graph.leave(`module-file@${id}`, {
        kind: "module-file",
        subject: id,
        reason: `Module source ${file} is not in the commit`,
      });
      return;
    }
    const analysis = analyse(snapshot.read(file));
    analyses.set(file, { analysis, info, space, id });
    known.add(id);
    segments.set(id, list);
    spaceOf.set(id, space);
    infoOf.set(id, info);
    if (!childNames.has(id)) childNames.set(id, new Set());
    const declarations = modules(analysis);
    const inline = declarations.filter((item) => item.inline);
    const ranges = [];
    for (const declaration of declarations) {
      const chain = inline
        .filter(
          (item) =>
            item !== declaration &&
            item.range[0] < declaration.start &&
            item.range[1] > declaration.start,
        )
        .sort((a, b) => a.range[0] - b.range[0]);
      if (declaration.path !== null)
        graph.count(
          "#[path]",
          declaration.test || chain.some((item) => item.test)
            ? "test"
            : "facts",
        );
      if (declaration.test || chain.some((item) => item.test)) {
        if (!declaration.inline && !chain.length) {
          const directory = modRs
            ? path.posix.dirname(file)
            : path.posix.join(
                path.posix.dirname(file),
                path.posix.basename(file, ".rs"),
              );
          testFiles.add(
            declaration.path !== null
              ? path.posix.normalize(
                  path.posix.join(path.posix.dirname(file), declaration.path),
                )
              : path.posix.join(directory, `${declaration.name}.rs`),
          );
        }
        continue;
      }
      const childList = [
        ...list,
        ...chain.map((item) => item.name),
        declaration.name,
      ];
      const childId = moduleId(space, childList);
      const parentId = chain.length
        ? moduleId(space, [...list, ...chain.map((item) => item.name)])
        : id;
      const parent =
        parentId === space.root && space.lib ? info.crateId : parentId;
      if (!childNames.has(parentId)) childNames.set(parentId, new Set());
      childNames.get(parentId).add(declaration.name);
      const conditions = declaration.conditions.length
        ? declaration.conditions
        : undefined;
      if (declaration.inline) {
        graph.node(
          childId,
          {
            kind: "module",
            name: declaration.name,
            parent,
            area: info.directory,
            file,
            inline: true,
            condition: conditions,
            basis: "parsed",
            extract_by: "rust:mod",
          },
          graph.evidence(file, declaration.line),
        );
        known.add(childId);
        segments.set(childId, childList);
        spaceOf.set(childId, space);
        infoOf.set(childId, info);
        if (!childNames.has(childId)) childNames.set(childId, new Set());
        ranges.push({ range: declaration.range, id: childId });
        continue;
      }
      const directory = modRs
        ? path.posix.dirname(file)
        : path.posix.join(
            path.posix.dirname(file),
            path.posix.basename(file, ".rs"),
          );
      const base = path.posix.join(
        declaration.path !== null && chain.length === 0
          ? path.posix.dirname(file)
          : directory,
        ...chain.map((item) => item.name),
      );
      let childFile;
      let childModRs;
      if (declaration.path !== null) {
        childFile = path.posix.normalize(
          path.posix.join(base, declaration.path),
        );
        childModRs = true;
      } else {
        childFile =
          [
            path.posix.join(base, `${declaration.name}.rs`),
            path.posix.join(base, declaration.name, "mod.rs"),
          ].find((candidate) => snapshot.has(candidate)) ??
          path.posix.join(base, `${declaration.name}.rs`);
        childModRs = path.posix.basename(childFile) === "mod.rs";
      }
      const outside = !childFile.startsWith(`${info.directory}/`);
      graph.node(
        childId,
        {
          kind: "module",
          name: declaration.name,
          parent,
          area: info.directory,
          file: childFile,
          condition: conditions,
          source_outside_crate: outside || undefined,
          basis: "parsed",
          extract_by: declaration.path !== null ? "rust:mod+path" : "rust:mod",
        },
        graph.evidence(
          file,
          declaration.path !== null ? declaration.pathLine : declaration.line,
        ),
      );
      if (outside) {
        const sourceId = `source:${childFile}`;
        graph.node("group:experiment-sources", {
          kind: "container",
          name: "Sources outside product crates",
          basis: "parsed",
        });
        graph.node(sourceId, {
          kind: "source",
          name: childFile,
          parent: "group:experiment-sources",
          area: childFile.split("/")[0],
          file: childFile,
          basis: "parsed",
        });
        graph.edge(
          "includes",
          parentId === space.root && space.lib ? space.root : parentId,
          sourceId,
          graph.evidence(file, declaration.pathLine),
          {
            basis: "parsed",
            extract_by: "rust:mod+path",
            condition: conditions,
          },
        );
      }
      walk(info, space, childFile, childId, childList, childModRs);
    }
    ownership.set(file, { id, ranges });
  };
  for (const info of crates)
    for (const space of info.spaces)
      walk(info, space, space.file, space.root, [], true);
  const constants = new Map();
  for (const [file, { analysis }] of analyses) {
    const pattern =
      /\bconst\s+([A-Z_][A-Z0-9_]*)\s*:\s*&(?:'static\s+)?str\s*=\s*(?:"([^"]*)"\s*;|r#*")/g;
    for (let match; (match = pattern.exec(analysis.masked));)
      constants.set(`${file}#${match[1]}`, {
        value: match[2] ?? null,
        file,
        line: analysis.line(match.index),
      });
  }
  const resolve = (ownerId, first, rest) => {
    const space = spaceOf.get(ownerId);
    const info = infoOf.get(ownerId);
    let targetSpace = space;
    let base;
    let tail = rest;
    if (first === "crate") base = [];
    else if (first === "self") base = segments.get(ownerId);
    else if (first === "super") {
      base = segments.get(ownerId).slice(0, -1);
      while (tail[0] === "super")
        ((base = base.slice(0, -1)), (tail = tail.slice(1)));
    } else if (libraries.has(first) && first !== space.ident) {
      targetSpace = libraries.get(first).space;
      base = [];
    } else if (childNames.get(ownerId)?.has(first)) {
      base = segments.get(ownerId);
      tail = [first, ...rest];
    } else if (libraries.has(first) && first === space.ident && !space.lib) {
      base = [];
    } else if (info.dependencies.get(first))
      return info.dependencies.get(first);
    else return null;
    for (let size = tail.length; size >= 0; size -= 1) {
      const candidate = moduleId(targetSpace, [
        ...base,
        ...tail.slice(0, size),
      ]);
      if (known.has(candidate)) return candidate;
    }
    return null;
  };
  const constant = (file, ownerId, expression) => {
    const parts = expression.replace(/\s+/g, "").replace(/^&/, "").split("::");
    const name = parts.pop();
    if (!parts.length) return constants.get(`${file}#${name}`) ?? null;
    const target = resolve(ownerId, parts[0], parts.slice(1));
    const node = target && graph.nodes.get(target);
    return node?.file ? (constants.get(`${node.file}#${name}`) ?? null) : null;
  };
  const ownerOf = (file, position) => {
    const entry = ownership.get(file);
    const range = entry.ranges
      .filter((item) => item.range[0] < position && item.range[1] > position)
      .sort((a, b) => b.range[0] - a.range[0])[0];
    return range ? range.id : entry.id;
  };
  const owned = (file, entry, position) => {
    const id = ownerOf(file, position);
    return id === entry.space.root && entry.space.lib ? entry.space.root : id;
  };
  const owner = (file) => {
    for (const pack of graph.packages ?? [])
      if (file.startsWith(`${pack.directory}/`)) return pack.id;
    for (const [output, id] of graph.artifacts ?? [])
      if (file === output || file.startsWith(`${output}/`)) return id;
    return null;
  };
  for (const [file, entry] of [...analyses].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const { analysis } = entry;
    const { bare, masked } = analysis;
    const paths = /(?<![\w:])([a-z_][a-z0-9_]*)\s*::\s*/g;
    for (let match; (match = paths.exec(bare));) {
      if (analysis.inTest(match.index)) continue;
      const lists = readPath(bare, match.index + match[0].length);
      const from = owned(file, entry, match.index);
      for (const rest of lists) {
        const target = resolve(ownerOf(file, match.index), match[1], rest);
        if (!target || target === from) continue;
        const kind =
          target.startsWith("dep:") || target.startsWith("crate:")
            ? "uses_crate"
            : "uses";
        graph.edge(
          kind,
          from,
          target,
          graph.evidence(file, analysis.line(match.index)),
          { basis: "parsed", extract_by: "rust:path" },
        );
      }
    }
    const triggers = [
      ["Command::new(", /\bCommand\s*::\s*new\s*\(/g],
      ["HostModule::new(", /\bHostModule\s*::\s*new\s*\(/g],
      ["ComponentRegistry::new(", /\bComponentRegistry\s*::\s*new\s*\(/g],
      ["include_str!/include_bytes!(", /\binclude_(?:str|bytes)\s*!\s*\(/g],
      ["import_types!(", /\bimport_types\s*!\s*\(/g],
      ["env::var(", /\benv\s*::\s*var(?:_os)?\s*\(/g],
      ...config.locationRoots.map((root) => [
        `${root}.join(`,
        new RegExp(`\\b${root}\\s*\\.\\s*join\\s*\\(`, "g"),
      ]),
      ...config.structLiterals.map((rule) => [
        `${rule.type} {`,
        new RegExp(`(?<!struct\\s+)\\b${rule.type}\\s*\\{`, "g"),
        rule,
      ]),
    ];
    for (const [token, pattern, rule] of triggers) {
      for (let match; (match = pattern.exec(bare));) {
        if (analysis.inTest(match.index)) {
          graph.count(token, "test");
          continue;
        }
        const line = analysis.line(match.index);
        const evidence = graph.evidence(file, line);
        const from = owned(file, entry, match.index);
        const open = match.index + match[0].length - 1;
        const argument = call(analysis, open);
        const text = argument ? argument.text.trim() : "";
        const unresolved = (reason) => {
          graph.count(token, "unresolved");
          graph.leave(
            `${token}@${from}(${text.replace(/\s+/g, " ").slice(0, 60)})`,
            {
              kind: token,
              subject: from,
              argument: text.replace(/\s+/g, " ").slice(0, 120),
              reason,
              evidence,
            },
          );
        };
        if (token === "Command::new(") {
          const direct = literal(text);
          const fallback =
            /var_os\s*\(\s*"([A-Z0-9_]+)"\s*\)[\s\S]*?"([^"]+)"/.exec(text);
          const program = direct ?? fallback?.[2];
          if (!program) {
            unresolved("The program comes from a runtime value");
            continue;
          }
          const name = path.posix.basename(program);
          graph.node(`program:${name}`, {
            kind: "program",
            name,
            area: "external",
            basis: "parsed",
          });
          graph.edge("spawns", from, `program:${name}`, evidence, {
            basis: "parsed",
            extract_by: "rust:Command::new",
            override: fallback ? `env:${fallback[1]}` : undefined,
          });
          if (fallback) {
            graph.node("group:environment", {
              kind: "container",
              name: "Environment variables",
              basis: "parsed",
            });
            graph.node(`env:${fallback[1]}`, {
              kind: "environment",
              name: fallback[1],
              parent: "group:environment",
              area: "external",
              basis: "parsed",
            });
          }
          graph.count(token, "facts");
        } else if (token === "HostModule::new(") {
          const named =
            literal(text) ??
            constant(file, ownerOf(file, match.index), text)?.value;
          if (!named) {
            unresolved(
              "The host module name is not a literal or a resolvable string constant",
            );
            continue;
          }
          const functions = [];
          let declarations;
          const chains = [argument.close + 1];
          const binding = /\blet\s+(?:mut\s+)?(\w+)\s*=\s*$/.exec(
            masked.slice(Math.max(0, match.index - 80), match.index),
          );
          const limit = enclosingEnd(analysis, match.index);
          if (binding) {
            const rebind = new RegExp(
              `\\b(?:let\\s+(?:mut\\s+)?)?${binding[1]}\\s*=\\s*${binding[1]}\\b`,
              "g",
            );
            rebind.lastIndex = argument.close;
            for (
              let again;
              (again = rebind.exec(masked)) && again.index < limit;
            )
              chains.push(again.index + again[0].length);
          }
          for (const start of chains) {
            const end = statementEnd(analysis, start);
            const chain = masked.slice(start, end);
            const builder =
              /\.\s*(async_function|function|declarations)\s*\(\s*/g;
            for (let step; (step = builder.exec(chain));) {
              if (depthAt(analysis, start, start + step.index) !== 0) continue;
              const inner = call(
                analysis,
                start + step.index + step[0].trimEnd().length - 1,
              );
              if (!inner) continue;
              if (step[1] === "declarations")
                declarations = constant(
                  file,
                  ownerOf(file, match.index),
                  inner.text.trim(),
                );
              else {
                const name = /^\s*"([^"]+)"/.exec(inner.text);
                if (name) functions.push(name[1]);
              }
            }
          }
          const id = `host-module:${named}`;
          graph.node("group:script-interface", {
            kind: "container",
            name: "Script modules from Rust",
            basis: "parsed",
          });
          const node = graph.node(id, {
            kind: "host-module",
            name: named,
            parent: "group:script-interface",
            area: "script-host",
            basis: "parsed",
            extract_by: "rust:HostModule",
          });
          node.functions = [
            ...new Set([...(node.functions ?? []), ...functions]),
          ].sort();
          if (declarations) {
            node.declarations = {
              path: declarations.file,
              line: declarations.line,
              generated: (graph.artifacts ?? []).some(
                ([output]) =>
                  declarations.file === output ||
                  declarations.file.startsWith(`${output}/`),
              ),
            };
            graph.attach(
              node,
              graph.evidence(declarations.file, declarations.line),
            );
          }
          graph.edge("exposes", from, id, evidence, {
            basis: "parsed",
            extract_by: "rust:HostModule",
            functions: functions.length,
          });
          graph.count(token, "facts");
        } else if (token === "ComponentRegistry::new(") {
          const named = /"([^"]+)"\s*,?\s*$/.exec(text)?.[1];
          if (!named) {
            unresolved("The component module name is not a literal");
            continue;
          }
          graph.node("group:script-interface", {
            kind: "container",
            name: "Script modules from Rust",
            basis: "parsed",
          });
          graph.node(`host-module:${named}`, {
            kind: "host-module",
            name: named,
            parent: "group:script-interface",
            area: "script-host",
            provides: "components",
            basis: "parsed",
            extract_by: "rust:ComponentRegistry",
          });
          graph.edge("exposes", from, `host-module:${named}`, evidence, {
            basis: "parsed",
            extract_by: "rust:ComponentRegistry",
          });
          graph.count(token, "facts");
        } else if (token === "include_str!/include_bytes!(") {
          const value = literal(text);
          const target = value && relative(file, value);
          if (!target || !snapshot.has(target)) {
            unresolved("The embedded path is not a literal file in the commit");
            continue;
          }
          let id = owner(target);
          if (!id) {
            const directory = path.posix.dirname(target);
            id = `files:${directory}`;
            graph.node("group:embedded-files", {
              kind: "container",
              name: "Embedded files",
              basis: "parsed",
            });
            graph.node(id, {
              kind: "files",
              name: directory,
              parent: "group:embedded-files",
              area: directory.split("/")[0],
              basis: "parsed",
            });
          }
          const edge = graph.edge("embeds", from, id, evidence, {
            basis: "parsed",
            extract_by: "rust:include",
          });
          edge.files = [...new Set([...(edge.files ?? []), target])].sort();
          graph.count(token, "facts");
        } else if (token === "import_types!(") {
          const value = /"([^"]+)"/.exec(text)?.[1];
          const target = value && path.posix.join(entry.info.directory, value);
          const id = target && owner(target);
          if (!id) {
            unresolved(
              "The schema path does not belong to a known generated artifact",
            );
            continue;
          }
          graph.edge("generated_from", from, id, evidence, {
            basis: "parsed",
            extract_by: "rust:import_types",
            file: target,
          });
          graph.count(token, "facts");
        } else if (token === "env::var(") {
          const name = literal(text);
          if (!name) {
            unresolved("The variable name is not a literal");
            continue;
          }
          graph.node("group:environment", {
            kind: "container",
            name: "Environment variables",
            basis: "parsed",
          });
          graph.node(`env:${name}`, {
            kind: "environment",
            name,
            parent: "group:environment",
            area: "external",
            basis: "parsed",
          });
          graph.edge("reads_env", from, `env:${name}`, evidence, {
            basis: "parsed",
            extract_by: "rust:env::var",
          });
          graph.count(token, "facts");
        } else if (rule) {
          const close = analysis.partner.get(open);
          const body = masked.slice(open + 1, close);
          const field = new RegExp(`\\b${rule.field}\\s*:\\s*"([^"]+)"`, "g");
          let name = null;
          for (let item; (item = field.exec(body));)
            if (depthAt(analysis, open + 1, open + 1 + item.index) === 0)
              name = name ?? item[1];
          if (!name) {
            unresolved(`The ${rule.type} literal has no literal ${rule.field}`);
            continue;
          }
          graph.node(`group:${rule.kind}s`, {
            kind: "container",
            name: rule.group ?? `${rule.kind}s`,
            basis: "parsed",
          });
          graph.node(`${rule.kind}:${name}`, {
            kind: rule.kind,
            name,
            parent: `group:${rule.kind}s`,
            area: "agent",
            basis: "parsed",
            extract_by: `rust:${rule.type}`,
          });
          graph.edge(rule.edge, from, `${rule.kind}:${name}`, evidence, {
            basis: "parsed",
            extract_by: `rust:${rule.type}`,
          });
          graph.count(token, "facts");
        } else {
          const value = literal(text);
          if (!value) {
            unresolved("The joined path is not a literal");
            continue;
          }
          graph.node("group:profile", {
            kind: "container",
            name: "Installed profile",
            basis: "parsed",
          });
          graph.node(`location:profile/${value}`, {
            kind: "location",
            name: `<profile>/${value}`,
            parent: "group:profile",
            area: "profile",
            basis: "parsed",
          });
          graph.edge(
            "uses_location",
            from,
            `location:profile/${value}`,
            evidence,
            { basis: "parsed", extract_by: `rust:${token}` },
          );
          graph.count(token, "facts");
        }
      }
    }
  }
  const scanned = new Set(analyses.keys());
  for (const info of crates) {
    for (const file of snapshot.files(`${info.directory}/src/**`)) {
      if (
        !file.endsWith(".rs") ||
        scanned.has(file) ||
        testFiles.has(file) ||
        file.includes("/src/bin/")
      )
        continue;
      graph.leave(`unreferenced@${file}`, {
        kind: "unreferenced-file",
        subject: info.crateId,
        reason:
          "Rust file under src/ that no product module or binary declares (test-only module, or not compiled)",
        evidence: graph.evidence(file, 1),
      });
    }
  }
}

function enclosingEnd(analysis, position) {
  let depth = 0;
  for (let index = position; index >= 0; index -= 1) {
    const char = analysis.bare[index];
    if (char === "}") depth += 1;
    else if (char === "{") {
      if (depth === 0)
        return analysis.partner.get(index) ?? analysis.bare.length;
      depth -= 1;
    }
  }
  return analysis.bare.length;
}

function readPath(bare, start) {
  const results = [];
  const walk = (position, prefix) => {
    let cursor = position;
    const list = [...prefix];
    for (;;) {
      while (/\s/.test(bare[cursor] ?? "")) cursor += 1;
      if (bare[cursor] === "{") {
        let depth = 0;
        let itemStart = cursor + 1;
        for (let index = cursor; index < bare.length; index += 1) {
          const char = bare[index];
          if (char === "{") depth += 1;
          else if (char === "}") depth -= 1;
          if ((char === "," && depth === 1) || depth === 0) {
            walk(itemStart, list);
            itemStart = index + 1;
          }
          if (depth === 0) break;
        }
        return;
      }
      const name = /^[A-Za-z_]\w*/.exec(bare.slice(cursor, cursor + 80));
      if (!name) break;
      list.push(name[0]);
      cursor += name[0].length;
      const separator = /^\s*::\s*/.exec(bare.slice(cursor, cursor + 20));
      if (!separator) break;
      cursor += separator[0].length;
    }
    results.push(list.filter((item) => item !== "self"));
  };
  walk(start, []);
  return results;
}

module.exports = { observeCargo, observeRust };
