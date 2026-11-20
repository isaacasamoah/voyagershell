const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { compile, describeDiagnostics } = require("./typecheck.cjs");

test("the registered occluding API retains style chains and refuses id", () => {
  const filename = path.join(__dirname, "../target/script-types/occluding.ts");
  const valid = `import { div } from "gpui-kit";
window.open_dialog(() => div().child("Worktrees"));
window.close_dialog();
import { Occluding } from "voyager_native";
Occluding.new().absolute().right(12).top(52).bottom(12).w(430).flex().flex_col().gap(12).p(16).rounded(8).bg("#16181c").border_1().border_color("#ffffff1c").child("Layout");
`;
  fs.writeFileSync(filename, valid);
  assert.deepEqual(
    compile([filename]).map((entry) => entry.code),
    [],
  );
  fs.writeFileSync(
    filename,
    valid +
      `window.open_dialog("unsupported");
Occluding.new().id("unsupported");
Occluding.new().w(30).id("unsupported");
`,
  );
  const diagnostics = compile([filename]);
  assert.deepEqual(
    diagnostics.map((entry) => entry.code),
    [2345, 2345, 2345],
  );
  assert.ok(diagnostics.every((entry) => entry.file.fileName === filename));
});

test("Notes checks its actual private native and content signatures", () => {
  const filename = path.join(
    __dirname,
    "../target/script-types/notes-signatures.ts",
  );
  const valid = `import { Title, TitleState, Body, BodyState, SessionState, RetainedTitleState, RetainedTitle, RetainedBodyState, RetainedBody } from "voyager_input";
import { invoke, changed } from "voyager_vessel";
import type { Request } from "../../contract/generated/contentRequest";
Title.new(TitleState.new("")).w_full();
Body.new(BodyState.new("")).min_h(180);
SessionState.new().status();
const heading: boolean = SessionState.new().show_heading();
RetainedTitle.new(RetainedTitleState.new()).w_full();
RetainedBody.new(RetainedBodyState.new()).min_h(180);
invoke("{}", "request", "");
changed(null);
const request: Request = { version: "1", operation: "content.update", requestId: "r", vesselId: "notes", expectedRevision: "base", data: { title: "Title", text: "Body" } };
`;
  fs.writeFileSync(filename, valid);
  assert.deepEqual(
    compile([filename], "notes").map((entry) => entry.code),
    [],
  );
  fs.writeFileSync(
    filename,
    valid +
      `TitleState.new(12);
Title.new(TitleState.new("")).missing_property();
invoke("{}", "request");
const invalid: Request = { ...request, data: { title: 12, text: "Body" } };
import { TerminalState } from "voyager_native";
RetainedTitleState.new().set_value("Overwrite during staging");
RetainedBodyState.new().focus();
`,
  );
  const diagnostics = compile([filename], "notes");
  assert.deepEqual(
    diagnostics.map((entry) => entry.code),
    [2345, 2339, 2554, 2322, 2307, 2339, 2339],
  );
  assert.ok(diagnostics.every((entry) => entry.file.fileName === filename));
});

test("the real generated APIs reject wrong workspace and native calls", () => {
  const filename = path.join(__dirname, "../target/script-types/rejected.ts");
  fs.writeFileSync(
    filename,
    `import { invoke } from "../../contract/generated/workspace.js";
import { terminal_open, launches } from "voyager_workspace";
import { ArrangementCapture } from "voyager_native";
import { Target, window_epoch } from "voyager_avatar";
import { observe, send } from "../../contract/generated/conversation.js";
invoke({ operation: "select-fleet", id: 12 }, "0");
invoke({ operation: "mistyped-operation" }, "0");
terminal_open(12);
terminal_open(null);
launches("unsupported");
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
    [2322, 2322, 2345, 2345, 2554, 2345, 2322, 2554, 2345, 2322],
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

test("a wrong argument type is refused with the operation's name before its location", () => {
  const filename = path.join(__dirname, "../target/script-types/operations.ts");
  fs.writeFileSync(
    filename,
    `import { invoke } from "../../contract/generated/workspace";
import { processes } from "voyager_workspace";
export function renameWithANumber() {
  return invoke({ operation: "rename", target: { kind: "fleet", id: "fleet-1" }, name: 7 }, "1");
}
export function readProcessesWithANumber() {
  return processes(1);
}
`,
  );
  const lines = describeDiagnostics(compile([filename])).split("\n");
  assert.equal(lines.length, 2);
  assert.match(
    lines[0],
    /^rename: target\/script-types\/operations\.ts\(4,\d+\): error TS2322: Type 'number' is not assignable to type 'string'\.$/,
  );
  assert.match(
    lines[1],
    /^processes: target\/script-types\/operations\.ts\(7,\d+\): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'\.$/,
  );
});

test("a host function the catalogue does not declare is refused by name", () => {
  const filename = path.join(__dirname, "../target/script-types/undeclared.ts");
  fs.writeFileSync(
    filename,
    `import { ghost } from "voyager_workspace";
ghost();
`,
  );
  assert.match(
    describeDiagnostics(compile([filename])),
    /Module '"voyager_workspace"' has no exported member 'ghost'/,
  );
});
