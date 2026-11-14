const fs = require("node:fs");

module.exports = function workspaceSource(
  environmentKey,
  declaration = "class",
  filename = "main.js",
) {
  const source = fs
    .readFileSync(
      process.env[environmentKey] || `${__dirname}/mods/header/${filename}`,
      "utf8",
    )
    .replace(/^import [\s\S]*?;\n/gm, "")
    .replace(/^export \{[^}]+\} from [^;]+;\n/gm, "")
    .replace("export default class", declaration)
    .replace("export class", declaration)
    .replaceAll(
      "export function",
      declaration.includes("function") ? declaration : "function",
    );
  const helpers =
    filename === "main.js"
      ? [
          "worktrees.js",
          "voyage-close.js",
          "voyage-colours.js",
          "process-icons.js",
          "panels.js",
          "panel-view.js",
          "navigation-view.js",
        ]
          .map((name) =>
            fs
              .readFileSync(`${__dirname}/mods/header/${name}`, "utf8")
              .replace(/^import [\s\S]*?;\n/gm, "")
              .replace(/^export /gm, ""),
          )
          .join("\n")
      : "";
  const ui =
    filename === "main.js"
      ? fs
          .readFileSync(`${__dirname}/../content/ui.js`, "utf8")
          .replace(/^import [\s\S]*?;\n/gm, "")
          .replace(/^export /gm, "")
      : "";
  const marker =
    filename === "main.js"
      ? [
          'const Marker = { new: (role, key = "", label) => ({ marker: label === undefined ? [role, key] : [role, key, label] }) };',
          'const EditorMarker = { new: (key, state) => ({ marker: ["name-editor", key, state] }) };',
        ].join("\n")
      : "";
  return marker + "\n" + ui + "\n" + helpers + "\n" + source;
};
