const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");

function fixture(status) {
  const source = fs
    .readFileSync(`${__dirname}/mods/header/main.js`, "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace("export default class", "return class");
  const layout = {
    selectedVoyage: "voyage",
    selectedFleet: "fleet",
    voyages: [
      {
        id: "voyage",
        fleets: [{ id: "fleet", vessels: [{ content: "content" }] }],
      },
    ],
  };
  let opened = 0;
  const Workspace = new Function(
    "View",
    "invoke",
    "openTerminal",
    "TerminalState",
    source,
  )(
    class {},
    async () => ({ status: "applied", version: "1", layout, fresh: true }),
    async () => {
      opened += 1;
      return { status, message: "open failed" };
    },
    { new: () => ({}) },
  );
  const view = new Workspace();
  Object.assign(view, {
    version: "1",
    layout,
    busy: false,
    terminals: new Map(),
    attempted: new Set(),
    refused: new Set(),
  });
  const task = { notify() {} };
  const pending = [];
  const cx = {
    notify() {},
    spawn(callback) {
      pending.push(callback(task));
    },
  };
  return { view, task, cx, pending, count: () => opened };
}

test("explicit Refresh retries a known refusal after inspection", async () => {
  const { view, task, cx, pending, count } = fixture("rejected");
  await assert.rejects(view.prepare(task), /open failed/);
  view.run({ operation: "inspect" }, cx);
  await pending.at(-1);
  assert.equal(count(), 2);
});

test("explicit Refresh never repeats an uncertain start", async () => {
  const { view, task, cx, pending, count } = fixture("uncertain");
  await assert.rejects(view.prepare(task), /open failed/);
  view.run({ operation: "inspect" }, cx);
  await pending.at(-1);
  assert.equal(count(), 1);
});
