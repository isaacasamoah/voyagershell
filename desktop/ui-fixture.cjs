const fs = require("node:fs");
const ts = require("typescript");

module.exports = function uiModule(element, Button, Switch = Button) {
  const exports = {};
  const source = fs.readFileSync(
    process.env.VOYAGER_UI_SOURCE || `${__dirname}/../content/ui.ts`,
    "utf8",
  );
  const emitted = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("exports", "require", emitted)(exports, (name) =>
    name === "gpui-kit" ? { div: element } : { Button, Switch },
  );
  return exports;
};
