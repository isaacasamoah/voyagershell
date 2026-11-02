const assert = require("node:assert/strict");
const workspaceSource = require("./workspace-fixture.cjs");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  let request;
  const calls = [];
  const tasks = [];
  const target = { kind: "fleet", id: "fleet-1" };
  const layout = {
    voyages: [
      {
        id: "voyage-1",
        portals: [],
        fleets: [{ id: target.id, name: "Original", vessels: [] }],
      },
    ],
  };
  const div = () => {
    const values = {};
    const proxy = new Proxy(values, {
      get: (object, key) =>
        object[key] ??
        ((value) => {
          object[key] = value;
          return proxy;
        }),
    });
    return proxy;
  };
  const state = (value) => ({
    text: value,
    events: {},
    value() {
      return this.text;
    },
    on(event, handler) {
      this.events[event] = handler;
    },
    focus() {},
    release() {},
  });
  const source = workspaceSource("VOYAGER_RENAME_SOURCE");
  const Workspace = vm.runInNewContext(`${source}\nWorkspace`, {
    View: class {},
    div,
    Button: {
      new() {
        const button = div();
        button.sourceKind = "native-button";
        return button;
      },
    },
    NameState: { new: state },
    Name: { new: div },
    Chat: vm.runInNewContext(
      `${workspaceSource("VOYAGER_CHAT_SOURCE", "class", "chat.js")}\nChat`,
      { InputState: { new: state } },
    ),
    projection: () => ({}),
    invoke(action) {
      calls.push(action);
      return new Promise((resolve) => {
        request = resolve;
      });
    },
  });
  const cx = {
    notify() {},
    stop_propagation() {},
    focus_handle: () => ({ focus() {} }),
    spawn(body) {
      tasks.push(body(cx));
    },
  };
  const view = new Workspace();
  view.init(null, cx);
  async function reply(status = "applied", fresh = true) {
    request({ status, fresh, version: "1", layout });
    await tasks[tasks.length - 1];
  }
  return { view, cx, target, calls, reply, layout };
}

test("ordinary blur commits once", async () => {
  const { view, cx, target, calls, reply } = fixture();
  await reply();
  view.editName(target, "Original", cx);
  const editing = view.editing;
  editing.state.text = "Changed";
  editing.state.events.blur(null, cx);
  assert.equal(calls.at(-1).operation, "rename");
  assert.equal(calls.at(-1).name, "Changed");
  editing.state.events.submit(null, cx);
  assert.equal(calls.length, 2);
  await reply();
  assert.equal(view.editing, null);
});

test("F2 targets are tab stops and a plus name keeps its accessible name", async () => {
  const { view, cx, target, reply } = fixture();
  await reply();
  const button = view.action(
    "+",
    { operation: "select-fleet", id: target.id },
    false,
    target,
  );
  assert.equal(button.accessibility_label, "+");
  assert.equal(button.sourceKind, "native-button");
  assert.equal(button.tab_stop, true);
  assert.equal(
    view.action("+", null, false, { kind: "portal", id: "portal-1" })
      .accessibility_label,
    "+",
  );
  assert.notEqual(
    view.action("Refresh", { operation: "inspect" }).sourceKind,
    "native-button",
  );
  button.on_key_down({ key: "f2" }, cx);
  assert.ok(view.editing);
});

test("navigation after a name save follows the latest selected destination", async () => {
  const { view, cx, target, calls, reply } = fixture();
  await reply();
  view.editName(target, "Original", cx);
  view.editing.state.text = "Changed";
  view.editing.state.events.submit(null, cx);
  view.run({ operation: "select-fleet", id: "fleet-2" }, cx);
  view.run({ operation: "select-fleet", id: "fleet-3" }, cx);
  await reply();
  assert.equal(calls.at(-1).id, "fleet-3");
  await reply();
});

test("a pending selection preserves rename and clears later navigation on refusal", async () => {
  const { view, cx, target, calls, reply } = fixture();
  await reply();
  view.run({ operation: "select-fleet", id: target.id }, cx);
  view.editName(target, "Original", cx);
  assert.ok(view.editing, "A slow selection swallowed the double-click");
  view.editing.state.text = "Changed";
  view.editing.state.events.submit(null, cx);
  view.run({ operation: "select-fleet", id: "fleet-2" }, cx);
  await reply("rejected", false);
  view.run({ operation: "inspect" }, cx);
  await reply();
  assert.equal(
    calls.length,
    3,
    "A failed prerequisite left an action to run later",
  );
});

test("an unconfirmed name is not replayed on blur or Enter", async () => {
  const { view, cx, target, calls, reply } = fixture();
  await reply();
  view.editName(target, "Original", cx);
  const editing = view.editing;
  editing.state.text = "Changed";
  editing.state.events.submit(null, cx);
  await reply("uncertain", false);
  view.run({ operation: "inspect" }, cx);
  await reply();
  editing.state.events.blur(null, cx);
  editing.state.events.submit(null, cx);
  assert.equal(calls.length, 3, "An unchanged uncertain edit was repeated");
  editing.state.text = "A distinct edit";
  editing.state.events.submit(null, cx);
  assert.equal(calls.at(-1).name, "A distinct edit");
  await reply();
});

test("an edit back to the old label after refresh is a new intent", async () => {
  const { view, cx, target, calls, reply, layout } = fixture();
  await reply();
  view.editName(target, "Original", cx);
  view.editing.state.text = "Changed";
  view.editing.state.events.submit(null, cx);
  await reply("uncertain", false);
  layout.voyages[0].fleets[0].name = "Changed";
  view.run({ operation: "inspect" }, cx);
  await reply();
  view.editing.state.text = "Original";
  view.editing.state.events.submit(null, cx);
  assert.equal(calls.at(-1).operation, "rename");
  assert.equal(calls.at(-1).name, "Original");
  await reply();
});
