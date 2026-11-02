const fs = require("node:fs");

module.exports = function workspaceSource(
  environmentKey,
  declaration = "class",
) {
  return fs
    .readFileSync(
      process.env[environmentKey] || `${__dirname}/mods/header/main.js`,
      "utf8",
    )
    .replace(/^import .*;\n/gm, "")
    .replace("export default class", declaration);
};
