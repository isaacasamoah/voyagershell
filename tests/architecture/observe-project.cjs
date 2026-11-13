const path = require("node:path");
const { analyse, call } = require("./rust.cjs");

function observePackages(snapshot, graph, config) {
  graph.packages = [];
  for (const root of config.packageRoots) {
    for (const manifest of snapshot.files(`${root}/**/mod.json`)) {
      const directory = path.posix.dirname(manifest);
      let parsed = {};
      try {
        parsed = JSON.parse(snapshot.read(manifest));
      } catch {
        graph.leave(`manifest@${manifest}`, {
          kind: "manifest",
          subject: manifest,
          reason: "mod.json is not valid JSON",
        });
      }
      const lines = snapshot.read(manifest).split("\n");
      const entryLine = lines.findIndex((text) => /"entry"\s*:/.test(text)) + 1;
      const id = `package:${directory}`;
      graph.node(
        id,
        {
          kind: "package",
          name: parsed.name ? `${parsed.name} (${directory})` : directory,
          area: directory.split("/")[0],
          file: manifest,
          entry: parsed.entry,
          basis: "declared",
          extract_by: "manifest:mod.json",
          files: snapshot.files(`${directory}/**`).length,
        },
        graph.evidence(manifest, entryLine || 1),
      );
      graph.packages.push({ id, directory, entry: parsed.entry });
    }
  }
}

function observeGenerators(snapshot, graph, config) {
  graph.artifacts = [];
  if (!snapshot.has("package.json")) return;
  const lines = snapshot.read("package.json").split("\n");
  const scripts = JSON.parse(snapshot.read("package.json")).scripts ?? {};
  for (const [name, command] of Object.entries(scripts).sort()) {
    const match = /^node\s+(\S+\.c?js)\b/.exec(command);
    if (!match || !config.generators[match[1]]) continue;
    const file = match[1];
    const id = `generator:${file}`;
    const line = lines.findIndex((text) => text.includes(`"${name}"`)) + 1;
    const node = graph.node(
      id,
      {
        kind: "generator",
        name: file,
        area: file.split("/")[0],
        file,
        basis: "declared",
        extract_by: "package.json+config",
        commands: [],
      },
      graph.evidence("package.json", line),
    );
    node.commands = [...new Set([...node.commands, `npm run ${name}`])].sort();
  }
  for (const [file, outputs] of Object.entries(config.generators).sort()) {
    const id = `generator:${file}`;
    if (!snapshot.has(file)) continue;
    if (!graph.nodes.has(id))
      graph.node(
        id,
        {
          kind: "generator",
          name: file,
          area: file.split("/")[0],
          file,
          basis: "declared",
          extract_by: "config",
          commands: [],
        },
        graph.evidence(file, 1),
      );
    for (const output of outputs) {
      if (graph.nodes.has(`package:${output}`)) {
        graph.edge(
          "generates",
          id,
          `package:${output}`,
          graph.evidence(file, 1),
          {
            basis: "declared",
            extract_by: "config",
            writes: "compiled scripts",
          },
        );
        continue;
      }
      const files =
        snapshot.files(`${output}/**`).length + (snapshot.has(output) ? 1 : 0);
      if (!files) {
        graph.leave(`artifact@${output}`, {
          kind: "artifact",
          subject: id,
          reason: `Declared output ${output} is not in the commit`,
        });
        continue;
      }
      const artifact = `artifact:${output}`;
      graph.node(artifact, {
        kind: "artifact",
        name: output,
        area: output.split("/")[0],
        file: output,
        files,
        committed: true,
        basis: "declared",
        extract_by: "config",
      });
      graph.artifacts.push([output, artifact]);
      graph.edge("generates", id, artifact, graph.evidence(file, 1), {
        basis: "declared",
        extract_by: "config",
      });
    }
    const analysis = analyse(snapshot.read(file));
    const runs = /\b(execFileSync|spawnSync|execSync|spawn|execFile)\s*\(/g;
    for (let match; (match = runs.exec(analysis.bare));) {
      const argument = call(analysis, match.index + match[0].length - 1);
      const evidence = graph.evidence(file, analysis.line(match.index));
      const program =
        argument && /^\s*["'`]([^"'`]+)["'`]/.exec(argument.text)?.[1];
      if (!program) {
        graph.count(`${match[1]}(`, "unresolved");
        graph.leave(`${match[1]}@${id}`, {
          kind: match[1],
          subject: id,
          reason: "The program is not a literal",
          evidence,
        });
        continue;
      }
      const bin = /"--bin"\s*,\s*"([^"]+)"/.exec(argument.text)?.[1];
      if (program === "cargo" && bin)
        graph.edge("runs", id, `bin:${bin}`, evidence, {
          basis: "parsed",
          extract_by: "node:execFileSync",
        });
      else {
        graph.node(`program:${program}`, {
          kind: "program",
          name: program,
          area: "external",
          basis: "parsed",
        });
        graph.edge("runs", id, `program:${program}`, evidence, {
          basis: "parsed",
          extract_by: "node:execFileSync",
        });
      }
      graph.count(`${match[1]}(`, "facts");
    }
  }
}

function observeScopes(snapshot, graph, config) {
  const settings = config.scriptScopes;
  if (!settings || !snapshot.has(settings.file)) return;
  const lines = snapshot.read(settings.file).split("\n");
  const inventory = JSON.parse(snapshot.read(settings.file));
  for (const [scope, entry] of Object.entries(inventory).sort()) {
    const directory = settings.packages[scope];
    const pack = directory && graph.nodes.get(`package:${directory}`);
    if (pack)
      pack.scope = {
        name: scope,
        modules: [...entry.modules].sort(),
        declared_in: settings.file,
      };
    let cursor = lines.findIndex((text) => text.includes(`"${scope}"`));
    for (const name of entry.modules) {
      const index = lines.findIndex(
        (text, at) => at > cursor && text.includes(`"${name}"`),
      );
      if (index >= 0) cursor = index;
      const evidence =
        index >= 0 ? graph.evidence(settings.file, index + 1) : null;
      let node = graph.nodes.get(`host-module:${name}`);
      if (!node) {
        graph.node("group:script-runtime", {
          kind: "container",
          name: "Script runtime modules",
          basis: "declared",
        });
        node = graph.node(`runtime-module:${name}`, {
          kind: "runtime-module",
          name,
          parent: "group:script-runtime",
          area: "script-host",
          basis: "declared",
          extract_by: `artifact:${settings.file}`,
        });
      }
      node.scopes = [...new Set([...(node.scopes ?? []), scope])].sort();
      if (evidence) graph.attach(node, evidence);
    }
  }
}

function observeTypeScript(snapshot, graph, config) {
  if (!config.typescript) return null;
  const ts = require(
    require.resolve("typescript", {
      paths: [snapshot.repository, __dirname, process.cwd()],
    }),
  );
  const settings = config.typescript;
  let options = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ES2022,
  };
  if (snapshot.has(settings.tsconfig)) {
    const absolute = path.join(snapshot.root, settings.tsconfig);
    const parsed = ts.parseJsonConfigFileContent(
      ts.readConfigFile(absolute, ts.sys.readFile).config,
      ts.sys,
      path.dirname(absolute),
    );
    options = parsed.options;
  }
  const files = [
    ...new Set(
      settings.roots.flatMap((root) => snapshot.files(`${root}/**/*.ts`)),
    ),
  ]
    .filter((file) => !file.endsWith(".d.ts"))
    .sort();
  const host = {
    ...ts.sys,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
  };
  for (const file of files) {
    const container =
      (graph.packages ?? []).find((pack) =>
        file.startsWith(`${pack.directory}/`),
      )?.id ??
      (graph.artifacts ?? []).find(([output]) =>
        file.startsWith(`${output}/`),
      )?.[1];
    graph.node(`ts:${file}`, {
      kind: "script",
      name: path.posix.basename(file),
      parent: container,
      area: file.split("/")[0],
      file,
      generated: container?.startsWith("artifact:") || undefined,
      basis: "parsed",
      extract_by: "typescript",
    });
    const text = snapshot.read(file);
    const info = ts.preProcessFile(text, true, true);
    const lineOf = (position) => text.slice(0, position).split("\n").length;
    for (const imported of info.importedFiles) {
      const specifier = imported.fileName;
      const evidence = graph.evidence(file, lineOf(imported.pos));
      const provided = [
        `host-module:${specifier}`,
        `runtime-module:${specifier}`,
      ].find((id) => graph.nodes.has(id));
      if (provided) {
        graph.edge("imports", `ts:${file}`, provided, evidence, {
          basis: "resolved",
          extract_by: "typescript+script-scope",
        });
        graph.count("import", "facts");
        continue;
      }
      const result = ts.resolveModuleName(
        specifier,
        path.join(snapshot.root, file),
        options,
        host,
      ).resolvedModule;
      if (!result) {
        graph.count("import", "unresolved");
        graph.leave(`import@ts:${file}(${specifier})`, {
          kind: "import",
          subject: `ts:${file}`,
          argument: specifier,
          reason:
            "Neither the TypeScript configuration nor a host module resolves this specifier",
          evidence,
        });
        continue;
      }
      let target = path
        .relative(snapshot.root, result.resolvedFileName)
        .split(path.sep)
        .join("/");
      if (
        target.endsWith(".js") &&
        snapshot.has(target.replace(/\.js$/, ".ts"))
      )
        target = target.replace(/\.js$/, ".ts");
      const viaRootDirs =
        specifier.startsWith(".") &&
        path.posix.dirname(target) !==
          path.posix.dirname(
            path.posix.join(path.posix.dirname(file), specifier),
          );
      const container = (graph.artifacts ?? []).find(([output]) =>
        target.startsWith(`${output}/`),
      )?.[1];
      const to = files.includes(target) ? `ts:${target}` : container;
      if (!to) {
        graph.count("import", "unresolved");
        graph.leave(`import@ts:${file}(${specifier})`, {
          kind: "import",
          subject: `ts:${file}`,
          argument: specifier,
          reason: `Resolves to ${target}, outside the scanned script roots`,
          evidence,
        });
        continue;
      }
      graph.edge("imports", `ts:${file}`, to, evidence, {
        basis: "resolved",
        extract_by: "typescript",
        via: viaRootDirs ? "rootDirs" : undefined,
        file: to === container ? target : undefined,
      });
      graph.count("import", "facts");
    }
  }
  for (const pack of graph.packages ?? []) {
    const entry =
      pack.entry && `${pack.directory}/${pack.entry.replace(/\.js$/, ".ts")}`;
    const node = graph.nodes.get(pack.id);
    if (entry && graph.nodes.has(`ts:${entry}`))
      node.entry_script = `ts:${entry}`;
  }
  return ts.version;
}

module.exports = {
  observePackages,
  observeGenerators,
  observeScopes,
  observeTypeScript,
};
