const assert = require("node:assert/strict");
const workspaceSource = require("./workspace-fixture.cjs");
const { test } = require("node:test");

function fixture(status, inspected = "applied") {
  const source = workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class");
  const layout = {
    selectedVoyage: "voyage",
    selectedFleet: "fleet",
    voyages: [
      {
        id: "voyage",
        portals: [],
        fleets: [{ id: "fleet", vessels: [{ content: "content" }] }],
      },
    ],
  };
  let opened = 0;
  let version = 1;
  const Workspace = new Function(
    "View",
    "invoke",
    "openTerminal",
    "TerminalState",
    source,
  )(
    class {},
    async () => ({
      status: inspected,
      version: String(version),
      layout,
      fresh: inspected === "applied",
    }),
    async (content) => {
      opened += 1;
      version += 1;
      return {
        status: typeof status === "function" ? status(content) : status,
        message: "open failed",
      };
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
    openings: new Map(),
    names: new Map(),
  });
  const task = { notify() {}, focus_handle: () => ({ focus() {} }) };
  const pending = [];
  const cx = {
    notify() {},
    spawn(callback) {
      pending.push(callback(task));
    },
  };
  return {
    view,
    task,
    cx,
    pending,
    layout,
    count: () => opened,
    version: () => String(version),
  };
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

test("a Voyage Portal retains its terminal view while Fleets change", async () => {
  const { view, task, layout, count } = fixture("applied");
  layout.voyages[0].portals.push({ id: "portal", content: "portal-content" });
  await view.prepare(task);
  assert.ok(
    view.terminals.has("portal-content"),
    "The visible Portal never opened",
  );
  const retained = view.terminals.get("portal-content");
  layout.voyages[0].fleets.push({ id: "other-fleet", vessels: [] });
  layout.selectedFleet = "other-fleet";
  await view.prepare(task);
  assert.equal(view.terminals.get("portal-content"), retained);
  assert.equal(count(), 2, "Fleet selection reconstructed the Portal viewer");
});

test("a known refusal reconciles revision and permits another visible Portal", async () => {
  const { view, task, layout, version } = fixture((content) =>
    content === "content" ? "rejected" : "applied",
  );
  layout.voyages[0].portals.push({ id: "portal", content: "portal-content" });
  await assert.rejects(view.prepare(task), /open failed/);
  assert.equal(
    view.version,
    version(),
    "Known refusal left a stale workspace revision",
  );
  assert.ok(
    view.terminals.has("portal-content"),
    "One refused Vessel blocked its live Portal",
  );
});

test("an applied viewer survives an unconfirmed workspace refresh", async () => {
  const { view, task, cx, pending, count } = fixture("applied", "uncertain");
  await assert.rejects(view.prepare(task), /refresh is unconfirmed/);
  assert.ok(
    view.terminals.has("content"),
    "Confirmed attachment lost its view",
  );
  view.run({ operation: "inspect" }, cx);
  await pending.at(-1);
  assert.equal(count(), 1, "An unconfirmed read caused attachment replay");
});

test("an unrelated action keeps the refusal visible without retry", async () => {
  const { view, task, cx, pending, count } = fixture("rejected");
  await assert.rejects(view.prepare(task), /open failed/);
  const before = view.terminalStatus({ id: "content" });
  assert.match(before, /unavailable: open failed/);
  view.run({ operation: "select-fleet", id: "fleet" }, cx);
  await pending.at(-1);
  assert.equal(view.terminalStatus({ id: "content" }), before);
  assert.equal(count(), 1, "An unrelated action retried the refusal");
});
