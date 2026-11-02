const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { compile } = require("./typecheck.cjs");

test("the real generated APIs reject wrong workspace and native calls", () => {
  const filename = path.join(__dirname, "../target/script-types/rejected.ts");
  fs.writeFileSync(
    filename,
    `import { invoke } from "../../contract/generated/workspace.js";
import { terminal_open } from "voyager_workspace";
import { ArrangementCapture } from "voyager_native";
import { Target, window_epoch } from "voyager_avatar";
import { observe, send } from "../../contract/generated/conversation.js";
invoke({ operation: "select-fleet", id: 12 }, "0");
invoke({ operation: "mistyped-operation" }, "0");
terminal_open(12);
terminal_open(null);
ArrangementCapture.new(12);
Target.new("dock", { scope: 1, fallback: false });
window_epoch(1);
observe(12);
send({ operation: "unknown" });
`,
  );
  const diagnostics = compile([filename]);
  assert.deepEqual(
    diagnostics.map((entry) => entry.code),
    [2322, 2322, 2345, 2345, 2345, 2322, 2554, 2345, 2322],
  );
  assert.ok(diagnostics.every((entry) => entry.file.fileName === filename));
  fs.writeFileSync(
    path.join(__dirname, "../target/script-types/rejected-diagnostics.json"),
    JSON.stringify(
      diagnostics.map(({ code, messageText }) => ({ code, messageText })),
      null,
      2,
    ) + "\n",
  );
});
