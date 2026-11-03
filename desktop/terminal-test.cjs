const assert = require("node:assert/strict");
const fs = require("node:fs");
const workspaceSource = require("./workspace-fixture.cjs");
const { test } = require("node:test");

function fixture(
  status,
  inspected = "applied",
  createdWorkspace = false,
  createdContents = [],
) {
  const source = workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class");
  const layout = {
    selectedVoyage: "voyage",
    selectedFleet: "fleet",
    contents: [{ id: "content", typeId: "terminal", backend: null }],
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
  const actions = [];
  const versions = [];
  const Workspace = new Function(
    "View",
    "invoke",
    "openTerminal",
    "TerminalState",
    "window_epoch",
    "workspace_notice",
    source,
  )(
    class {},
    async (action, expectedVersion) => {
      actions.push(action.operation);
      versions.push(expectedVersion);
      return {
        status: inspected,
        requestId: "dock-receipt",
        version: String(version),
        layout,
        fresh: inspected === "applied",
        createdWorkspace,
        createdContents,
      };
    },
    async (content) => {
      opened += 1;
      version += 1;
      return {
        status: typeof status === "function" ? status(content) : status,
        message: "open failed",
      };
    },
    { new: () => ({}) },
    () => "9",
    () => ({ revision: String(version), packageRevision: "1" }),
  );
  const view = new Workspace();
  Object.assign(view, {
    version: "1",
    workspaceNotice: { revision: "1", packageRevision: "0" },
    splitReset: 0,
    layout,
    busy: false,
    terminals: new Map(),
    attempted: new Set(),
    refused: new Set(),
    openings: new Map(),
    pendingShortcuts: [],
    focus: { focus() {} },
    names: new Map(),
  });
  const task = { notify() {}, focus_handle: () => ({ focus() {} }) };
  const pending = [];
  const cx = {
    notify() {},
    stop_propagation() {},
    spawn(callback) {
      pending.push(callback(task));
    },
  };
  task.spawn = cx.spawn;
  return {
    view,
    task,
    cx,
    pending,
    layout,
    count: () => opened,
    versions,
    version: () => String(version),
    actions,
  };
}

test("Notes placements never open a terminal, including owner-created content", async () => {
  const { view, task, layout, count } = fixture("applied");
  layout.contents[0].typeId = "notes";
  await view.prepare(task, false, new Set(), new Set(["content"]));
  assert.equal(count(), 0);
  assert.equal(view.openings.size, 0);
  assert.equal(view.terminals.size, 0);
});

test("explicit Refresh retries a known refusal after inspection", async () => {
  const { view, task, cx, pending, count } = fixture("rejected");
  await assert.rejects(view.prepare(task), /open failed/);
  view.inspectNotice(cx);
  await pending.at(-1);
  assert.equal(count(), 1, "An owner notice must not retry a refused start");
  view.run({ operation: "inspect" }, cx);
  await pending.at(-1);
  assert.equal(count(), 2);
});

test("drag targets preserve identity and stale gestures dispatch nothing", () => {
  const { view, cx } = fixture("applied");
  const calls = [];
  view.run = (action) => calls.push(action);
  const point = {
    position: { x: 10, y: 10 },
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
  for (const [kind, expected] of [
    ["vessel", "move-vessel"],
    ["fleet", "move-fleet"],
    ["voyage", "move-voyage"],
  ]) {
    view.startDrag(kind, "first", point, cx);
    view.drag.moved = true;
    view.targetDrag(kind, "second", point, cx);
    view.finishDrag(10, 10, cx);
    assert.equal(calls.at(-1).operation, expected);
    assert.equal(calls.at(-1).id, "first");
    assert.equal(calls.at(-1).target, "second");
  }
  view.startDrag("vessel", "first", point, cx);
  view.drag.moved = true;
  view.targetDrag("vessel", "second", point, cx);
  view.version = "2";
  view.finishDrag(10, 10, cx);
  assert.equal(calls.length, 3);
});

test("starting a drag directs Escape to the workspace", () => {
  const { view, cx } = fixture("applied");
  let focused = 0;
  view.focus = {
    focus() {
      focused += 1;
    },
  };
  view.startDrag("vessel", "first", { position: { x: 10, y: 10 } }, cx);
  assert.equal(focused, 0);
  view.moveDrag(30, 30, cx);
  assert.equal(focused, 1);
});

test("Create Fleet and Refresh expose native buttons while preserving their press and click", () => {
  const source = workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class");
  function div() {
    const calls = {};
    const node = new Proxy(calls, {
      get(target, name) {
        if (name === "calls") return target;
        return (...args) => {
          target[name] = args;
          return node;
        };
      },
    });
    return node;
  }
  const Workspace = new Function("View", "div", "Button", "projection", source)(
    class {},
    div,
    { new: div },
    () => ({ foreground: "fg", muted: "muted" }),
  );
  const view = new Workspace();
  view.names = new Map();
  const actions = [];
  view.run = (action) => actions.push(action);
  for (const operation of ["create-fleet", "inspect"]) {
    const button = view.action(operation, { operation });
    let stopped = false;
    button.calls.on_mouse_down[1](
      {},
      {
        stop_propagation() {
          stopped = true;
        },
      },
    );
    assert.equal(stopped, true);
    button.calls.on_click[0]({}, {});
  }
  assert.deepEqual(
    actions.map((action) => action.operation),
    ["create-fleet", "inspect"],
  );
});

test("shortcuts target the focused Vessel and queue only while busy", () => {
  const { view, cx } = fixture("applied");
  const fleet = view.layout.voyages[0].fleets[0];
  fleet.vessels.push({ id: "second", content: "other" });
  view.focused = "second";
  const calls = [];
  view.run = (action) => calls.push(action);
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  view.shortcut({ key: "o", modifiers }, cx);
  assert.equal(calls[0].after, "second");
  view.busy = true;
  view.shortcut({ key: "e", modifiers }, cx);
  assert.deepEqual(view.pendingShortcuts, ["e"]);
  view.flushShortcuts(cx, false);
  assert.deepEqual(view.pendingShortcuts, []);
});

test("selection focus uses the actual current-Fleet terminal and preserves outside focus", async () => {
  for (const eligible of [true, false]) {
    const { view, cx, pending, layout } = fixture("applied");
    const calls = [];
    const fleet = layout.voyages[0].fleets[0];
    fleet.vessels.push({ id: "second", content: "other" });
    view.focused = "second";
    view.terminals.set("content", {
      rememberFocus() {
        calls.push("remember");
        return eligible;
      },
      focusIfUnchanged() {
        calls.push("focus");
      },
    });
    view.terminals.set("other", {
      rememberFocus() {
        calls.push("other");
        return false;
      },
    });
    view.openings.set("content", { status: "applied" });
    view.openings.set("other", { status: "applied" });
    view.run({ operation: "select-fleet", id: "fleet" }, cx);
    await pending[0];
    assert.deepEqual(
      calls,
      eligible ? ["remember", "focus"] : ["remember", "other"],
    );
  }
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
  layout.contents.push({
    id: "portal-content",
    typeId: "terminal",
    backend: null,
  });
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
  layout.contents.push({
    id: "portal-content",
    typeId: "terminal",
    backend: null,
  });
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

test("workspace shortcuts use the selected Fleet and focused Vessel", () => {
  const { view, cx } = fixture("applied");
  view.layout.voyages[0].fleets[0].vessels.push({
    id: "second",
    content: "other",
  });
  view.layout.voyages[0].fleets[0].vessels[0].id = "first";
  view.focused = "second";
  const calls = [];
  view.run = (action) => calls.push(action);
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  for (const key of ["o", "e", "t"]) view.shortcut({ key, modifiers }, cx);
  assert.deepEqual(calls, [
    { operation: "split", fleet: "fleet", after: "second", axis: "horizontal" },
    { operation: "split", fleet: "fleet", after: "second", axis: "vertical" },
    { operation: "create-fleet", voyage: "voyage", name: "Fleet 2" },
  ]);
  view.shortcut({ key: "o", modifiers: { ...modifiers, shift: false } }, cx);
  assert.equal(calls.length, 3);
  view.shortcut(
    { key: "O", modifiers: { ...modifiers, control: false, platform: true } },
    cx,
  );
  assert.equal(calls.at(-1).axis, "horizontal");
  view.shortcut({ key: "o", modifiers: { ...modifiers, alt: true } }, cx);
  view.shortcut({ key: "o", modifiers: { ...modifiers, function: true } }, cx);
  assert.equal(calls.length, 4);
});

test("shortcuts wait in order for a confirmed workspace action", async () => {
  const { view, cx, pending } = fixture("applied");
  view.pendingShortcuts = [];
  const calls = [];
  view.busy = true;
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  view.shortcut({ key: "o", modifiers }, cx);
  view.shortcut({ key: "e", modifiers }, cx);
  assert.deepEqual(view.pendingShortcuts, ["o", "e"]);
  view.run = (action) => calls.push(action);
  view.busy = false;
  view.flushShortcuts(cx, true);
  assert.equal(calls[0].axis, "horizontal");
  assert.deepEqual(view.pendingShortcuts, ["e"]);
  view.flushShortcuts(cx, false);
  assert.deepEqual(view.pendingShortcuts, []);
  assert.equal(pending.length, 0);
});

test("pending shortcut intents run only after success and stop after failed preparation", async () => {
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  for (const status of ["applied", "rejected", "uncertain"]) {
    const { view, cx, pending } = fixture(status, "applied", true);
    view.layout.voyages[0].fleets[0].vessels[0].id = "first";
    view.run({ operation: "inspect" }, cx);
    if (status === "applied") {
      view.openings.set("content", { status: "applied" });
      view.workspaceNotice.packageRevision = "1";
      view.refreshRequested = true;
    }
    view.shortcut({ key: "o", modifiers }, cx);
    view.shortcut({ key: "e", modifiers }, cx);
    await pending[0];
    if (status === "applied") {
      assert.equal(pending.length, 2);
      await pending[1];
      assert.equal(pending.length, 3);
      await pending[2];
    } else {
      assert.equal(pending.length, 1);
    }
    assert.deepEqual(view.pendingShortcuts, []);
  }
});

test("refused and uncertain workspace outcomes discard unsent shortcuts", async () => {
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  for (const outcome of ["rejected", "uncertain"]) {
    const { view, cx, pending, count } = fixture("applied", outcome);
    view.run({ operation: "inspect" }, cx);
    view.shortcut({ key: "o", modifiers }, cx);
    await pending[0];
    assert.equal(pending.length, 1);
    assert.equal(count(), 0);
    assert.deepEqual(view.pendingShortcuts, []);
  }
});

test("Home never starts content and loaded layouts prepare only visible bound content", async () => {
  const opened = [];
  const { view, task, layout } = fixture((content) => {
    opened.push(content);
    return "applied";
  });
  const fleet = layout.voyages[0].fleets[0];
  fleet.root = { kind: "leaf", placement: "shown" };
  fleet.vessels = [
    { id: "shown", content: "live" },
    { id: "hidden", content: "unbound" },
  ];
  layout.voyages[0].portals = [{ id: "portal", content: "unbound-portal" }];
  layout.contents = [
    { id: "live", typeId: "terminal", backend: "t1" },
    { id: "unbound", typeId: "terminal", backend: null },
    { id: "unbound-portal", typeId: "terminal", backend: null },
  ];
  layout.view = "home";
  await view.prepare(task, true);
  assert.deepEqual(opened, []);
  layout.view = "fleet";
  await view.prepare(task, true);
  assert.deepEqual(opened, ["live"]);
});

test("only a newly created workspace starts an unbound initial terminal", async () => {
  for (const created of [false, true]) {
    const { view, cx, pending, layout, count } = fixture(
      "applied",
      "applied",
      created,
    );
    layout.contents = [{ id: "content", typeId: "terminal", backend: null }];
    view.run({ operation: "inspect" }, cx);
    await pending[0];
    assert.equal(count(), created ? 1 : 0);
    if (!created)
      assert.equal(
        view.terminalStatus(layout.contents[0]),
        "No terminal is bound.",
      );
  }
});

test("new content does not start an older unbound placement", async () => {
  const opened = [];
  const { view, task, layout } = fixture((content) => {
    opened.push(content);
    return "applied";
  });
  const fleet = layout.voyages[0].fleets[0];
  fleet.vessels.push({ content: "new" });
  layout.contents = [
    { id: "content", typeId: "terminal", backend: null },
    { id: "new", typeId: "terminal", backend: null },
  ];
  await view.prepare(task, true, new Set(), new Set(["new"]));
  assert.deepEqual(opened, ["new"]);
  layout.contents[0].backend = "externally-bound";
  await view.prepare(task, true);
  assert.deepEqual(opened, ["new", "content"]);
});

test("navigation waits for a layout save and is cleared on refusal or uncertainty", async () => {
  for (const status of ["applied", "rejected", "uncertain"]) {
    const { view, cx, pending, layout } = fixture("applied", status);
    layout.contents = [];
    view.savingLayout = true;
    view.run(
      { operation: "save-layout", fleet: "fleet", name: "Focus" },
      cx,
      () => {
        view.savingLayout = false;
      },
    );
    view.run({ operation: "home" }, cx);
    await pending[0];
    if (pending[1]) await pending[1];
    assert.equal(pending.length, status === "applied" ? 2 : 1);
    assert.equal(view.afterRename, null);
  }
});

test("Home is retained while an entity rename is saving", () => {
  const { view, cx } = fixture("applied");
  view.busy = true;
  view.editing = { saving: true };
  view.run({ operation: "home" }, cx);
  assert.deepEqual(view.afterRename, { operation: "home" });
});

test("a pending layout save cannot open another name editor", () => {
  const { view, cx } = fixture("applied");
  view.savingLayout = true;
  view.saveLayout("fleet", cx);
  assert.equal(view.layoutName, undefined);
});

test("a layout save begun during an existing request waits before navigation", async () => {
  const { view, cx, pending, layout, actions } = fixture("applied");
  layout.contents = [];
  view.run({ operation: "inspect" }, cx);
  view.savingLayout = true;
  view.run({ operation: "save-layout", fleet: "fleet", name: "Focus" }, cx);
  view.run({ operation: "home" }, cx);
  for (let index = 0; index < pending.length; index++) await pending[index];
  assert.deepEqual(actions, ["inspect", "save-layout", "home"]);
});

test("layout shortcuts ignore a retained hidden Vessel", () => {
  const { view, cx, layout } = fixture("applied");
  const fleet = layout.voyages[0].fleets[0];
  fleet.vessels = [
    { id: "hidden", content: "old" },
    { id: "visible", content: "content" },
  ];
  fleet.root = { kind: "leaf", placement: "visible" };
  view.focused = "hidden";
  const calls = [];
  view.run = (action) => calls.push(action);
  view.dispatchShortcut("o", cx);
  assert.equal(calls[0].after, "visible");
});

test("workspace shortcuts leave the layout-name editor alone", () => {
  const { view, cx } = fixture("applied");
  view.layoutName = { state: {}, fleet: "fleet", submitted: false };
  const calls = [];
  view.run = (action) => calls.push(action);
  view.shortcut(
    {
      key: "o",
      modifiers: { control: true, shift: true, alt: false, platform: false },
    },
    cx,
  );
  assert.deepEqual(calls, []);
});

test("owner-created content is prepared without starting older unbound content", async () => {
  const opened = [];
  const { view, cx, pending, layout } = fixture(
    (content) => {
      opened.push(content);
      return "applied";
    },
    "applied",
    false,
    ["new"],
  );
  const fleet = layout.voyages[0].fleets[0];
  fleet.vessels = [
    { id: "old", content: "content" },
    { id: "new", content: "new" },
  ];
  layout.contents.push({ id: "new", typeId: "terminal", backend: null });
  view.run({ operation: "inspect" }, cx);
  await pending[0];
  assert.deepEqual(opened, ["new"]);
});

test("a non-Error open rejection remains uncertain and is not replayed", async () => {
  const { view, task, cx, pending, count } = fixture(
    () => {
      throw "lost confirmation";
    },
    "applied",
    true,
  );
  view.run({ operation: "inspect" }, cx);
  await pending.at(-1);
  assert.equal(view.busy, false);
  assert.equal(view.status, "lost confirmation");
  assert.equal(view.openings.get("content").status, "uncertain");
  assert.equal(view.openings.get("content").message, "lost confirmation");
  assert.equal(view.fresh, false);
  view.run({ operation: "inspect" }, cx);
  await pending.at(-1);
  assert.equal(count(), 1, "An unknown rejection caused an uncertain replay");
});

test("Home presents the retained out-of-view avatar without docking or starting content", () => {
  const source = workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class");
  let ownerRevision = "7";
  let packageRevision = "0";
  const targets = [];
  const nodes = [];
  function div() {
    const calls = {};
    const node = new Proxy(calls, {
      get(target, name) {
        if (name === "calls") return target;
        return (...args) => {
          target[name] = args;
          return node;
        };
      },
    });
    nodes.push(node);
    return node;
  }
  const component = { new: () => div() };
  const target = {
    new(id, props) {
      targets.push({ id, ...props });
      return div();
    },
  };
  const layers = [];
  const layer = {
    new(id, props) {
      layers.push({ id, ...props });
      return div();
    },
  };
  const Workspace = new Function(
    "View",
    "div",
    "Button",
    "projection",
    "Brand",
    "Speech",
    "Layer",
    "Target",
    "take_result",
    "homeOverview",
    "workspace_notice",
    "composeCanvas",
    source,
  )(
    class {},
    div,
    component,
    () => ({ background: "bg", foreground: "fg", muted: "muted" }),
    component,
    component,
    layer,
    target,
    () => null,
    () => div(),
    () => ({ revision: ownerRevision, packageRevision }),
    new Function(
      "div",
      fs
        .readFileSync(`${__dirname}/mods/header/canvas.js`, "utf8")
        .replace(/^import [\s\S]*?;\n/gm, "")
        .replaceAll("export function", "function") + "\nreturn composeCanvas;",
    )(div),
  );
  const view = new Workspace();
  const context = { kind: "vessel", id: "vessel" };
  Object.assign(view, {
    version: "7",
    workspaceNotice: { revision: "7", packageRevision: "0" },
    sidebar: true,
    dockReceipt: "",
    dockEpoch: "",
    fresh: true,
    layout: {
      view: "home",
      canvas: JSON.parse(
        fs.readFileSync(
          `${__dirname}/../contract/generated/response.schema.json`,
          "utf8",
        ),
      ).definitions.Layout.properties.canvas.default,
      context,
      selectedVoyage: "voyage",
      selectedFleet: "fleet",
      contents: [{ id: "content", cwd: "/tmp" }],
      voyages: [
        {
          id: "voyage",
          name: "Voyage",
          portals: [],
          fleets: [
            {
              id: "fleet",
              name: "Fleet",
              vessels: [{ id: "vessel", content: "content" }],
            },
          ],
        },
      ],
    },
    focus: { focus() {} },
    names: new Map(),
    status: "Avatar unavailable",
    editing: null,
    drag: null,
    layoutName: null,
    chat: { toggleView: div, render: () => null },
  });
  const actions = [];
  view.run = (action) => actions.push(action);
  view.render({});
  assert.ok(
    nodes.some((node) => node.calls.child?.[0] === "Avatar unavailable"),
  );
  assert.ok(
    nodes.some((node) => node.calls.accessibility_label?.[0] === "Refresh"),
  );
  assert.deepEqual(JSON.parse(layers[0].scope), context);
  assert.ok(
    targets.some(
      (item) =>
        item.id === "out-of-view-avatar" &&
        item.fallback &&
        JSON.parse(item.scope).id === "vessel",
    ),
  );
  assert.deepEqual(actions, []);
  const goThere = nodes.find((node) => node.calls.child?.[0] === "Go there");
  assert.ok(goThere);
  goThere.calls.on_click[0]({ click_count: 1 }, {});
  assert.deepEqual(actions, [{ operation: "reveal-vessel", id: "vessel" }]);
  actions.length = 0;
  packageRevision = "1";
  view.render({});
  view.render({});
  assert.deepEqual(actions, [{ operation: "inspect" }]);
  assert.equal(view.version, "7", "The test retains an unconfirmed refresh");
  packageRevision = "2";
  view.render({});
  assert.deepEqual(actions, [
    { operation: "inspect" },
    { operation: "inspect" },
  ]);
  ownerRevision = "10";
  view.version = "10";
  view.render({});
  assert.equal(
    actions.length,
    2,
    "A caught-up layout notice must not prepare again",
  );
  view.busy = true;
  ownerRevision = "11";
  view.render({});
  assert.equal(view.refreshRequested, true);
  assert.equal(view.workspaceNotice.revision, "10");
  view.version = "11";
  view.busy = false;
  view.inspectNotice({});
  assert.equal(
    actions.length,
    2,
    "A completed action already consumed this layout",
  );
  assert.equal(view.refreshRequested, false);
});

test("canvas-only Inspect retains a prior refused opening without retrying it", async () => {
  const { view, cx, pending, count } = fixture("rejected", "applied", true);
  view.run({ operation: "inspect" }, cx);
  await pending.at(-1);
  const opening = view.openings.get("content");
  assert.equal(count(), 1);
  view.run({ operation: "inspect" }, cx, undefined, view.version, false);
  await pending.at(-1);
  assert.equal(count(), 1);
  assert.equal(view.openings.get("content"), opening);
  assert.equal(opening.status, "rejected");
});

test("a confirmed dock retains its request and initiating window epoch", async () => {
  const { view, cx, pending } = fixture("applied");
  view.run({ operation: "dock", context: { kind: "workspace" } }, cx);
  await pending.at(-1);
  assert.equal(view.dockReceipt, "dock-receipt");
  assert.equal(view.dockEpoch, "9");
});

test("a delayed request cannot rewind a newer native dock snapshot", async () => {
  const { view, cx, task, pending, layout, count } = fixture("applied");
  view.run({ operation: "inspect" }, cx);
  const latest = { ...layout, context: { kind: "workspace" } };
  const response = {
    status: "applied",
    fresh: true,
    version: "8",
    layout: latest,
  };
  view.acceptSnapshot(response, task);
  await pending.at(-1);
  assert.equal(view.version, "8");
  assert.equal(view.layout, latest);
  assert.equal(count(), 0, "A stale response prepared a terminal");
  view.acceptSnapshot(
    {
      ...response,
      version: "7",
      status: "uncertain",
      message: "Unconfirmed request",
    },
    task,
  );
  assert.equal(view.version, "8");
  assert.equal(view.status, "Unconfirmed request");
});

test("resize dispatch keeps the captured revision and restores a busy preview without sending", async () => {
  const { view, cx, pending, versions } = fixture("applied");
  const action = {
    operation: "resize-split",
    fleet: "fleet",
    path: [],
    share: 3500,
  };
  view.version = "8";
  view.run(action, cx, undefined, "3");
  await pending.at(-1);
  assert.deepEqual(versions, ["3"]);
  const reset = view.splitReset;
  view.busy = true;
  view.run(action, cx, undefined, "3");
  assert.deepEqual(versions, ["3"]);
  assert.equal(view.splitReset, reset + 1);
  assert.match(view.status, /not saved/);
});
