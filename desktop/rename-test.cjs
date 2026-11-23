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
        fleets: [{ id: target.id, name: "Original", placements: [] }],
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
  const Canvas = vm.runInNewContext(`${source}\nCanvas`, {
    View: class {},
    WorkspaceMenu: vm.runInNewContext(
      `${workspaceSource("VOYAGER_MENU_SOURCE", "class", "menu.js")}\nWorkspaceMenu`,
    ),
    request_id: () => "canvas-generation",
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
      { ComposerState: { new: state } },
    ),
    projection: () => ({}),
    workspace_notice: () => ({ revision: "0", dockRevision: "0" }),
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
  const view = new Canvas();
  view.startContext = () => {};
  view.init(null, cx);
  async function reply(status = "applied", fresh = true, message = null) {
    request({ status, fresh, version: "1", layout, message });
    await tasks[tasks.length - 1];
  }
  async function unanswered(status, message) {
    request({ requestId: "canvas-generation", status, message });
    await tasks[tasks.length - 1];
  }
  return { view, cx, target, calls, reply, unanswered, layout };
}

test("chat retains its named native composer and submit event", () => {
  const { view } = fixture();
  assert.equal(view.chat.input.text, "Message Voyager");
  assert.equal(typeof view.chat.input.events.submit, "function");
});

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

test("terminal headings show their description while rename keeps the actual name", async () => {
  const { view, cx, reply } = fixture();
  await reply();
  const target = { kind: "vessel", id: "vessel-1" };
  const terminal = view.action(
    "Terminal",
    null,
    false,
    target,
    "bash · project",
  );
  assert.equal(terminal.children.at(-1), "bash · project");
  assert.deepEqual(
    [...terminal.children[0].marker],
    ["vessel-name", "vessel-1", "bash · project"],
  );
  assert.equal(terminal.accessibility_label, "Terminal");
  assert.equal(
    view.action("Build", null, false, target).children.at(-1),
    "Build",
  );
  terminal.on_click({ click_count: 2 }, cx);
  assert.equal(view.editing.state.text, "Terminal");
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
  assert.equal(
    view.action("Refresh", { operation: "inspect" }).sourceKind,
    "native-button",
  );
  button.on_key_down({ key: "f2" }, cx);
  assert.ok(view.editing);
});

test("renaming a Fleet by double-click and by F2 sends the same workspace operation", async () => {
  const { view, cx, target, calls, reply } = fixture();
  await reply();
  const send = async (open) => {
    const button = view.action("Original", null, false, target);
    open(button);
    view.editing.state.text = "Renamed";
    view.editing.state.events.submit(null, cx);
    const action = calls.at(-1);
    await reply();
    return action;
  };
  const clicked = await send((button) =>
    button.on_click({ click_count: 2 }, cx),
  );
  const keyed = await send((button) => button.on_key_down({ key: "f2" }, cx));
  const expected = { operation: "rename", target, name: "Renamed" };
  assert.equal(JSON.stringify(clicked), JSON.stringify(expected));
  assert.equal(JSON.stringify(keyed), JSON.stringify(clicked));
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
  await reply("refused", false);
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

test("a refusal the owner answered shows its reason", async () => {
  const { view, cx, target, reply } = fixture();
  await reply();
  view.editName(target, "Original", cx);
  view.editing.state.text = "Changed";
  view.editing.state.events.submit(null, cx);
  await reply(
    "refused",
    true,
    "invalid_workspace: A name must contain 1 to 128 bytes",
  );
  assert.equal(
    view.status,
    "Refused. invalid_workspace: A name must contain 1 to 128 bytes",
  );
  assert.equal(view.fresh, true);
});

test("a request refused before the owner took it shows its reason and may be sent again", async () => {
  const { view, cx, target, calls, reply, unanswered } = fixture();
  await reply();
  view.editName(target, "Original", cx);
  const editing = view.editing;
  editing.state.text = "Changed";
  editing.state.events.submit(null, cx);
  await unanswered(
    "refused",
    "Workspace busy or unavailable; nothing was queued",
  );
  assert.equal(
    view.status,
    "Refused. Workspace busy or unavailable; nothing was queued",
  );
  assert.equal(view.fresh, true, "A known refusal made the canvas stale");
  editing.state.events.submit(null, cx);
  assert.equal(calls.length, 3, "A refused edit could not be sent again");
  assert.equal(calls.at(-1).name, "Changed");
  await reply();
  assert.equal(view.editing, null);
});

test("a request the owner never answered shows as uncertain and is not sent again", async () => {
  const { view, cx, target, calls, reply, unanswered } = fixture();
  await reply();
  view.editName(target, "Original", cx);
  const editing = view.editing;
  editing.state.text = "Changed";
  editing.state.events.submit(null, cx);
  await unanswered(
    "uncertain",
    "Workspace result unconfirmed; do not repeat the request",
  );
  assert.equal(
    view.status,
    "Uncertain. Workspace result unconfirmed; do not repeat the request",
  );
  assert.equal(view.fresh, false);
  editing.state.events.blur(null, cx);
  editing.state.events.submit(null, cx);
  assert.equal(calls.length, 2, "An uncertain edit was sent again");
  assert.equal(
    view.status,
    "Name change not confirmed. Refresh before a new edit.",
  );
  view.run({ operation: "inspect" }, cx);
  await reply();
  editing.state.events.submit(null, cx);
  assert.equal(calls.length, 3, "An unchanged uncertain edit was repeated");
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

test("missing owner references fail with explicit invariant errors", async () => {
  const { view, cx, reply, layout } = fixture();
  await reply();
  assert.throws(
    () => view.pane({ kind: "leaf", placement: "missing" }, { members: [] }),
    /Split placement is unavailable/,
  );
  layout.vessels = [];
  assert.throws(
    () =>
      view.content({ content: "missing" }, { kind: "vessel", id: "missing" }),
    /Placement content is unavailable/,
  );
  view.editName({ kind: "fleet", id: "missing" }, "Original", cx);
  view.editing.state.text = "Changed";
  assert.throws(
    () => view.editing.state.events.blur(null, cx),
    /Rename target has no retained name/,
  );
});
