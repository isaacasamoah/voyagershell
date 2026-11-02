const fs = require("node:fs");

module.exports = function workspaceSource(
  environmentKey,
  declaration = "class",
  filename = "main.js",
) {
  return fs
    .readFileSync(
      process.env[environmentKey] || `${__dirname}/mods/header/${filename}`,
      "utf8",
    )
    .replace(/^import .*;\n/gm, "")
    .replace("export default class", declaration)
    .replace("export class", declaration);
};
