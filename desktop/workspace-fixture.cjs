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
    .replace("export default class", declaration)
    .replace("export class", declaration)
    .replaceAll(
      "export function",
      declaration.includes("function") ? declaration : "function",
    );
  const helpers =
    filename === "main.js"
      ? ["panels.js", "panel-view.js", "navigation-view.js"]
          .map((name) =>
            fs
              .readFileSync(`${__dirname}/mods/header/${name}`, "utf8")
              .replace(/^import [\s\S]*?;\n/gm, "")
              .replace(/^export /gm, ""),
          )
          .join("\n")
      : "";
  return helpers + "\n" + source;
};
