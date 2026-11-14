const assert = require("node:assert/strict");
const fs = require("node:fs");
const workspaceSource = require("./workspace-fixture.cjs");
const { test } = require("node:test");
const activityBadge = new Function(
  workspaceSource("VOYAGER_ACTIVITY_SOURCE", "return function", "activity.js"),
)();

test("activity labels omit nonreporting shells and retain genuine observation failures", () => {
  assert.equal(activityBadge(undefined).label, "");
  assert.equal(
    activityBadge({
      state: "unknown",
      reported: false,
      reason: "No status was reported",
    }).label,
    "",
  );
  const inconsistent = activityBadge({
    state: "unknown",
    reported: false,
    reason: "Root metadata was not marked reported",
  });
  assert.equal(inconsistent.label, "Status unavailable");
  assert.equal(inconsistent.hint, "Root metadata was not marked reported");
  const failure = activityBadge({
    state: "unknown",
    reported: null,
    reason: "Program observation ended or was lost",
  });
  assert.equal(failure.label, "Status unavailable");
  assert.equal(failure.hint, "Program observation ended or was lost");
  assert.equal(
    activityBadge({ state: "blocked", reported: true }).label,
    "Blocked",
  );
  assert.match(
    activityBadge({ state: "done", reported: true }).hint,
    /not a verified/,
  );
});

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
        fleets: [
          {
            id: "fleet",
            name: "Fleet 1",
            vessels: [{ id: "vessel", name: "Terminal 1", content: "content" }],
            root: { kind: "leaf", placement: "vessel" },
          },
        ],
      },
    ],
  };
  let opened = 0;
  let version = 1;
  const actions = [];
  const choices = [];
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
      const outcome = typeof status === "function" ? status(content) : status;
      return {
        ...(typeof outcome === "string" ? { status: outcome } : outcome),
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
    pendingPresentation: null,
    processes: [],
    processError: "",
    terminals: new Map(),
    attempted: new Set(),
    refused: new Set(),
    openings: new Map(),
    pendingShortcuts: [],
    focus: { focus() {} },
    names: new Map(),
  });
  view.openSplit = (group, id, side) =>
    choices.push({ owner: group.owner, id, side, version: view.version });
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
    choices,
  };
}

test("a Portal reveal waits for successful preparation and keeps its completion callback", async () => {
  const { view, cx, pending, actions, layout, versions } = fixture("applied");
  layout.voyages[0].portalLayout = {
    visible: false,
    root: null,
    width: 340,
    mode: "overlay",
  };
  let completed = 0;
  view.run({ operation: "inspect" }, cx);
  view.run(
    { operation: "set-portal-presentation", voyage: "voyage", visible: true },
    cx,
    () => completed++,
  );
  assert.deepEqual(actions, ["inspect"]);
  await pending[0];
  await Promise.all(pending);
  assert.equal(
    actions.filter((action) => action === "set-portal-presentation").length,
    1,
  );
  assert.equal(versions.at(-1), view.version);
  assert.equal(completed, 1);
});

test("an unsent Close waits once and refuses changed placement identity", async () => {
  for (const changed of [false, true]) {
    const { view, cx, pending, actions, layout } = fixture("applied");
    view.run({ operation: "inspect" }, cx);
    view.run({ operation: "remove-panel", id: "vessel" }, cx);
    if (changed) layout.voyages[0].fleets[0].vessels[0].content = "different";
    await pending[0];
    await Promise.all(pending);
    assert.equal(
      actions.filter((action) => action === "remove-panel").length,
      changed ? 0 : 1,
    );
    if (changed) assert.match(view.status, /changed/);
  }
});

test("refused uncertain and failed preparation never submit a waiting presentation action", async () => {
  for (const [open, outcome] of [
    ["applied", "rejected"],
    ["applied", "uncertain"],
    [{ status: "uncertain" }, "applied"],
  ]) {
    const { view, cx, pending, actions } = fixture(open, outcome, true);
    view.run({ operation: "inspect" }, cx);
    view.run({ operation: "remove-panel", id: "vessel" }, cx);
    await pending[0];
    assert.equal(actions.includes("remove-panel"), false);
    assert.equal(view.pendingPresentation, null);
    assert.match(view.status, /not sent/);
  }
});

test("waiting presentation admission refuses stale competing and width-drag requests", async () => {
  const { view, cx, pending, actions, layout } = fixture("applied");
  layout.voyages[0].portalLayout = {
    visible: false,
    root: null,
    width: 340,
    mode: "overlay",
  };
  view.run({ operation: "inspect" }, cx);
  view.run({ operation: "remove-panel", id: "vessel" }, cx, undefined, "0");
  assert.match(view.status, /changed/);
  view.run(
    { operation: "set-portal-presentation", voyage: "voyage", width: 480 },
    cx,
  );
  assert.equal(view.pendingPresentation, null);
  view.run({ operation: "remove-panel", id: "vessel" }, cx);
  view.run(
    { operation: "set-portal-presentation", voyage: "voyage", visible: true },
    cx,
  );
  assert.match(view.status, /already waiting/);
  await pending[0];
  await Promise.all(pending);
  assert.equal(actions.filter((action) => action === "remove-panel").length, 1);
  assert.equal(actions.includes("set-portal-presentation"), false);
});

test("Notes placements never open a terminal, including owner-created content", async () => {
  const { view, task, layout, count } = fixture("applied");
  layout.contents[0].typeId = "notes";
  await view.prepare(task, false, new Set(), new Set(["content"]));
  assert.equal(count(), 0);
  assert.equal(view.openings.size, 0);
  assert.equal(view.terminals.size, 0);
});

test("a confirmed ended binding is neutral and Refresh never authorizes a new program", async () => {
  const { view, task, layout, cx, pending, count } = fixture({
    status: "rejected",
    reason: "ended",
  });
  layout.contents[0].backend = "t1";
  await view.prepare(task, true);
  assert.equal(
    view.terminalStatus(layout.contents[0]),
    "This program has ended.",
  );
  assert.equal(view.terminals.size, 0);
  view.run({ operation: "inspect" }, cx);
  await pending[0];
  assert.equal(count(), 2);
  assert.equal(layout.contents[0].backend, "t1");
  assert.equal(view.status, "");
});

test("Refresh does not start an unbound shell merely because its prior viewer ended", async () => {
  const { view, layout, cx, pending, count } = fixture("applied");
  view.openings.set("content", { status: "rejected", reason: "ended" });
  assert.equal(layout.contents[0].backend, null);
  view.run({ operation: "inspect" }, cx);
  await pending[0];
  assert.equal(count(), 0);
});

test("an owner-granted reopened shell replaces its retained viewer once", async () => {
  for (const status of [
    "applied",
    "unbound",
    "rejected",
    "uncertain",
    "pending",
  ]) {
    const { view, task, layout, count } = fixture(() => {
      layout.contents[0].backend = "fresh-shell";
      return "applied";
    });
    const prior = { status };
    view.openings.set("content", prior);
    view.terminals.set("content", {});
    await view.prepare(task, true, new Set(), new Set(["content"]));
    const known = ["applied", "unbound", "rejected"].includes(status);
    assert.equal(count(), known ? 1 : 0, status);
    if (!known) assert.equal(view.openings.get("content"), prior);
    await view.prepare(task, true);
    assert.equal(count(), known ? 1 : 0, "No repeated start");
  }
});

test("one fresh shell intent replaces its old opening without retrying a refusal", async () => {
  const { view, task, layout, count } = fixture("rejected");
  layout.contents[0].backend = "t1";
  layout.contents[0].shellIntent = "explicit-intent";
  view.openings.set("content", { status: "rejected", reason: "ended" });
  await assert.rejects(
    view.prepare(task, true, new Set(), new Set(["content"])),
  );
  await view.prepare(task, true, new Set(), new Set(["content"]));
  assert.equal(count(), 1);
  assert.equal(view.openings.get("content").intent, "explicit-intent");
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
  const fleet = view.layout.voyages[0].fleets[0];
  fleet.vessels = [
    { id: "first", content: "content" },
    { id: "second", content: "other" },
  ];
  fleet.root = {
    kind: "branch",
    first: { kind: "leaf", placement: "first" },
    second: { kind: "leaf", placement: "second" },
  };
  const calls = [];
  view.run = (action) => calls.push(action);
  const point = {
    position: { x: 10, y: 10 },
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
  for (const [kind, expected] of [
    ["vessel", "move-panel"],
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
  const { view, cx, choices } = fixture("applied");
  const fleet = view.layout.voyages[0].fleets[0];
  fleet.vessels.push({ id: "second", content: "other" });
  fleet.root = {
    kind: "branch",
    first: { kind: "leaf", placement: fleet.vessels[0].id },
    second: { kind: "leaf", placement: "second" },
  };
  view.focused = "second";
  const calls = [];
  view.run = (action) => calls.push(action);
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  view.shortcut({ key: "o", modifiers }, cx);
  assert.deepEqual(choices, [
    {
      owner: { kind: "fleet", id: "fleet" },
      id: "second",
      side: "right",
      version: "1",
    },
  ]);
  assert.deepEqual(calls, []);
  view.busy = true;
  view.shortcut({ key: "e", modifiers }, cx);
  assert.deepEqual(view.pendingShortcuts, ["e"]);
  view.flushShortcuts(cx, false);
  assert.deepEqual(view.pendingShortcuts, []);
  assert.equal(choices.length, 1);
});

test("selection focus uses the actual current-Fleet terminal and preserves outside focus", async () => {
  for (const eligible of [true, false]) {
    const { view, cx, pending, layout } = fixture("applied");
    const calls = [];
    const fleet = layout.voyages[0].fleets[0];
    fleet.vessels.push({ id: "second", content: "other" });
    fleet.root = {
      kind: "branch",
      first: { kind: "leaf", placement: fleet.vessels[0].id },
      second: { kind: "leaf", placement: "second" },
    };
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

test("maximizing another terminal transfers unchanged native focus to that retained target", async () => {
  for (const [eligible, status] of [
    [true, "applied"],
    [false, "applied"],
    [true, "rejected"],
  ]) {
    const { view, cx, pending, layout } = fixture("applied", status);
    const fleet = layout.voyages[0].fleets[0];
    fleet.vessels = [
      { id: "first", content: "content" },
      { id: "second", content: "other" },
    ];
    fleet.root = {
      kind: "branch",
      first: { kind: "leaf", placement: "first" },
      second: { kind: "leaf", placement: "second" },
    };
    const calls = [];
    const first = { rememberFocus: () => eligible };
    const second = {
      rememberFocus: () => false,
      focusIfUnchanged: () => calls.push("second"),
    };
    view.terminals.set("content", first);
    view.terminals.set("other", second);
    for (const id of ["content", "other"])
      view.openings.set(id, { status: "applied" });
    view.run(
      { operation: "set-panel-maximized", id: "second", maximized: true },
      cx,
    );
    fleet.maximizedPlacement = "second";
    await pending[0];
    assert.deepEqual(calls, eligible && status === "applied" ? ["second"] : []);
    assert.equal(view.terminals.get("content"), first);
    assert.equal(view.terminals.get("other"), second);
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
  layout.voyages[0].portals.push({
    id: "portal",
    name: "Terminal 2",
    content: "portal-content",
  });
  layout.voyages[0].portalLayout = {
    root: { kind: "leaf", placement: "portal" },
    visible: true,
    mode: "overlay",
    width: 340,
  };
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
  layout.voyages[0].portals.push({
    id: "portal",
    name: "Terminal 2",
    content: "portal-content",
  });
  layout.voyages[0].portalLayout = {
    root: { kind: "leaf", placement: "portal" },
    visible: true,
    mode: "overlay",
    width: 340,
  };
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
  const { view, cx, choices } = fixture("applied");
  view.layout.voyages[0].fleets[0].vessels.push({
    id: "second",
    content: "other",
  });
  view.layout.voyages[0].fleets[0].vessels[0].id = "first";
  view.layout.voyages[0].fleets[0].root = {
    kind: "branch",
    first: { kind: "leaf", placement: "first" },
    second: { kind: "leaf", placement: "second" },
  };
  view.focused = "second";
  const calls = [];
  view.run = (action) => calls.push(action);
  view.openFleetChoices = (voyage) =>
    calls.push({ picker: true, voyage: voyage.id });
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  for (const key of ["o", "e", "t"]) view.shortcut({ key, modifiers }, cx);
  assert.deepEqual(calls, [{ picker: true, voyage: "voyage" }]);
  assert.deepEqual(choices, [
    {
      owner: { kind: "fleet", id: "fleet" },
      id: "second",
      side: "right",
      version: "1",
    },
    {
      owner: { kind: "fleet", id: "fleet" },
      id: "second",
      side: "bottom",
      version: "1",
    },
  ]);
  view.shortcut({ key: "o", modifiers: { ...modifiers, shift: false } }, cx);
  assert.equal(calls.length, 1);
  assert.equal(choices.length, 2);
  view.shortcut(
    { key: "O", modifiers: { ...modifiers, control: false, platform: true } },
    cx,
  );
  assert.equal(choices.at(-1).side, "right");
  view.shortcut({ key: "o", modifiers: { ...modifiers, alt: true } }, cx);
  view.shortcut({ key: "o", modifiers: { ...modifiers, function: true } }, cx);
  assert.equal(calls.length, 1);
  assert.equal(choices.length, 3);
});

test("shortcuts wait in order for a confirmed workspace action", async () => {
  const { view, cx, pending, choices } = fixture("applied");
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
  assert.deepEqual(
    choices.map((choice) => choice.side),
    ["right", "bottom"],
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(view.pendingShortcuts, []);
  view.flushShortcuts(cx, false);
  assert.deepEqual(view.pendingShortcuts, []);
  assert.equal(pending.length, 0);
});

test("pending shortcut intents run only after success and stop after failed preparation", async () => {
  const modifiers = { control: true, shift: true, alt: false, platform: false };
  for (const status of ["applied", "rejected", "uncertain"]) {
    const { view, cx, pending, choices, actions, count } = fixture(
      status,
      "applied",
      true,
    );
    view.run({ operation: "inspect" }, cx);
    if (status === "applied") {
      view.workspaceNotice.packageRevision = "1";
      view.refreshRequested = true;
    }
    view.shortcut({ key: "o", modifiers }, cx);
    view.shortcut({ key: "e", modifiers }, cx);
    await pending[0];
    assert.equal(view.busy, false);
    assert.deepEqual(actions, ["inspect", "inspect"]);
    assert.equal(count(), 1);
    if (status === "applied") {
      assert.deepEqual(
        choices.map((choice) => choice.side),
        ["right", "bottom"],
      );
    } else {
      assert.deepEqual(choices, []);
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
    assert.equal(view.busy, false);
    assert.equal(count(), 0);
    assert.deepEqual(view.pendingShortcuts, []);
  }
});

test("Home and loaded layouts prepare only their visible bound content", async () => {
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
    { id: "home-live", typeId: "terminal", backend: "home-t1" },
  ];
  layout.home = {
    id: "home-voyage",
    name: "Home",
    portals: [],
    fleets: [
      {
        id: "home-fleet",
        name: "Home",
        root: null,
        vessels: [
          { id: "home-shown", name: "Terminal 1", content: "home-live" },
        ],
      },
    ],
  };
  layout.view = "home";
  await view.prepare(task, true);
  assert.deepEqual(opened, []);
  layout.home.fleets[0].root = { kind: "leaf", placement: "home-shown" };
  await view.prepare(task, true);
  assert.deepEqual(opened, ["home-live"]);
  layout.view = "fleet";
  await view.prepare(task, true);
  assert.deepEqual(opened, ["home-live", "live"]);
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
  fleet.vessels.push({ id: "new-panel", name: "Terminal 2", content: "new" });
  fleet.root = {
    kind: "branch",
    first: fleet.root,
    second: { kind: "leaf", placement: "new-panel" },
  };
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
    const { view, cx, pending, layout, actions } = fixture("applied", status);
    layout.contents = [];
    view.savingLayout = true;
    view.run(
      {
        operation: "save-panel-layout",
        owner: { kind: "fleet", id: "fleet" },
        name: "Focus",
      },
      cx,
      () => {
        view.savingLayout = false;
      },
    );
    view.run({ operation: "home" }, cx);
    for (let index = 0; index < pending.length; index++) await pending[index];
    assert.deepEqual(
      actions,
      status === "applied"
        ? ["save-panel-layout", "home"]
        : ["save-panel-layout"],
    );
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
  view.saveLayout({ kind: "fleet", id: "fleet" }, cx);
  assert.equal(view.layoutName, undefined);
});

test("a layout save begun during an existing request waits before navigation", async () => {
  const { view, cx, pending, layout, actions } = fixture("applied");
  layout.contents = [];
  view.run({ operation: "inspect" }, cx);
  view.savingLayout = true;
  view.run(
    {
      operation: "save-panel-layout",
      owner: { kind: "fleet", id: "fleet" },
      name: "Focus",
    },
    cx,
  );
  view.run({ operation: "home" }, cx);
  for (let index = 0; index < pending.length; index++) await pending[index];
  assert.deepEqual(actions, ["inspect", "save-panel-layout", "home"]);
});

test("layout shortcuts ignore a retained hidden Vessel", () => {
  const { view, cx, layout, choices } = fixture("applied");
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
  assert.equal(choices[0].id, "visible");
  assert.deepEqual(calls, []);
});

test("New Fleet in Home never becomes a panel split", () => {
  const { view, cx, layout, choices } = fixture("applied");
  layout.view = "home";
  layout.home = layout.voyages[0];
  const calls = [];
  view.run = (action) => calls.push(action);
  view.dispatchShortcut("t", cx);
  assert.deepEqual(choices, []);
  assert.deepEqual(calls, []);
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

test("maximize shortcuts bind the displayed event origin and refuse busy intents", () => {
  const { view, cx, layout } = fixture("applied");
  const fleet = layout.voyages[0].fleets[0];
  fleet.vessels = [
    { id: "first", content: "content" },
    { id: "second", content: "other" },
  ];
  fleet.root = {
    kind: "branch",
    first: { kind: "leaf", placement: "first" },
    second: { kind: "leaf", placement: "second" },
  };
  view.focused = "first";
  const calls = [];
  view.run = (action) => calls.push(action);
  const event = {
    key: "z",
    modifiers: { control: true, shift: true, alt: false, platform: false },
  };
  view.maximizeShortcut("second", event, cx);
  assert.deepEqual(calls.pop(), {
    operation: "set-panel-maximized",
    id: "second",
    maximized: true,
  });
  fleet.maximizedPlacement = "second";
  view.maximizeShortcut("first", event, cx);
  assert.equal(calls.length, 0);
  view.maximizeShortcut("second", event, cx);
  assert.equal(calls.pop().maximized, false);
  view.busy = true;
  view.maximizeShortcut("second", event, cx);
  assert.deepEqual(view.pendingShortcuts, []);
  assert.equal(calls.length, 0);
  view.busy = false;
  for (const guard of ["editing", "layoutName", "menus"]) {
    view[guard] = guard === "menus" ? { current: {} } : {};
    view.maximizeShortcut("second", event, cx);
    view[guard] = null;
  }
  view.maximizeShortcut(
    "second",
    { ...event, modifiers: { ...event.modifiers, shift: false } },
    cx,
  );
  assert.equal(calls.length, 0);
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
  fleet.root = {
    kind: "branch",
    first: { kind: "leaf", placement: "old" },
    second: { kind: "leaf", placement: "new" },
  };
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

test("Home presents the retained out-of-view avatar without docking or starting content", async () => {
  const { reportedActivity: validateReportedActivity } =
    await import("../contract/generated/validate.js");
  let activityRevision;
  let activityReads = 0;
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
  let occluders = 0;
  const areas = new Map();
  const prepared = [];
  const layers = [];
  let animationNotice = null;
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
    "take_animation_notice",
    "Status",
    "workspace_notice",
    "composeCanvas",
    "reported_activity",
    "validateReportedActivity",
    "vesselFrame",
    "svg",
    "activityBadge",
    "dock_target_visible",
    "speech_in_primary",
    "MeasureHeight",
    "Occluding",
    "Prepared",
    "PortalArea",
    "Column",
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
    () => {
      const notice = animationNotice;
      animationNotice = null;
      return notice;
    },
    { new: (_id, text) => div().child(text) },
    () => ({ revision: ownerRevision, packageRevision, activityRevision }),
    new Function(
      "div",
      fs
        .readFileSync(`${__dirname}/mods/header/canvas.js`, "utf8")
        .replace(/^import [\s\S]*?;\n/gm, "")
        .replaceAll("export function", "function") + "\nreturn composeCanvas;",
    )(div),
    () => {
      activityReads += 1;
      return JSON.stringify({
        terminals: { t1: { state: "done", reported: true, limited: false } },
        limited: true,
        reason: "Bound terminal observation limit exceeded",
      });
    },
    validateReportedActivity,
    (node) => node,
    div,
    activityBadge,
    () => false,
    () => true,
    component,
    {
      new() {
        occluders += 1;
        return div();
      },
    },
    {
      new(ready) {
        prepared.push(ready);
        return div();
      },
    },
    {
      new(id) {
        const area = div();
        areas.set(id, area);
        return area;
      },
    },
    component,
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
      home: {
        id: "home-voyage",
        name: "Home",
        portals: [],
        portalLayout: {
          root: null,
          visible: false,
          mode: "overlay",
          width: 340,
        },
        fleets: [{ id: "home-fleet", name: "Home", vessels: [], root: null }],
      },
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
              vessels: [
                { id: "vessel", name: "Terminal 1", content: "content" },
              ],
              root: { kind: "leaf", placement: "vessel" },
            },
          ],
        },
      ],
    },
    focus: { focus() {} },
    names: new Map(),
    terminals: new Map(),
    openings: new Map(),
    status: "Avatar unavailable",
    editing: null,
    drag: null,
    layoutName: null,
    chat: { toggleView: div, render: () => null },
  });
  const actions = [];
  const panelMenus = new Map();
  view.run = (action) => actions.push(action);
  view.contextMenu = (id, trigger, items) => {
    if (id.startsWith("panel-")) panelMenus.set(id, items);
    return trigger;
  };
  view.creationControl = (_id, _destination, trigger) => trigger;
  view.terminals = new Map();
  view.openings = new Map([
    ["content", { status: "rejected", reason: "ended" }],
  ]);
  view.layout.contents[0].typeId = "terminal";
  view.layout.contents[0].backend = "t1";
  view.content(
    view.layout.voyages[0].fleets[0].vessels[0],
    context,
    view.panelGroup("vessel"),
  );
  const start = nodes.filter(
    (node) => node.calls.accessibility_label?.[0] === "Start new shell",
  );
  assert.equal(start.length, 1);
  const fleet = view.layout.voyages[0].fleets[0];
  fleet.vessels.push({ id: "other", content: "other-content" });
  fleet.root = {
    kind: "branch",
    first: { kind: "leaf", placement: "vessel" },
    second: { kind: "leaf", placement: "other" },
  };
  view.content(fleet.vessels[0], context, view.panelGroup("vessel"));
  const maximize = nodes.find(
    (node) => node.calls.accessibility_label?.[0] === "Maximize Vessel",
  );
  assert.ok(maximize, "The maximize Button exists without mouse hover");
  const close = nodes.find((node) =>
    node.calls.accessibility_label?.[0]?.startsWith("Close Vessel"),
  );
  assert.deepEqual(close.calls.child[0].marker, ["close-panel", "vessel"]);
  assert.equal(maximize.calls.opacity[0], 0);
  assert.equal(typeof maximize.calls.focus[0], "function");
  assert.equal(maximize.calls.on_mouse_down?.[0], "left");
  let stopped = 0;
  maximize.calls.on_mouse_down[1](
    {},
    {
      stop_propagation() {
        stopped += 1;
      },
    },
  );
  assert.equal(
    stopped,
    1,
    "The pointer press stops before native Button focus transfer",
  );
  view.focused = "other";
  maximize.calls.on_click[0]({}, {});
  assert.equal(view.focused, "vessel");
  assert.deepEqual(actions.pop(), {
    operation: "set-panel-maximized",
    id: "vessel",
    maximized: true,
  });
  const menu = panelMenus.get("panel-vessel");
  assert.deepEqual(
    menu.map((item) => item.label),
    [
      "Rename",
      "Split side by side",
      "Split above and below",
      "Maximize Vessel",
      "Close Vessel",
    ],
  );
  menu.find((item) => item.label === "Close Vessel").choose("7", {});
  assert.deepEqual(actions.pop(), { operation: "remove-panel", id: "vessel" });
  start[0].calls.on_click[0]({}, {});
  assert.deepEqual(actions.pop(), {
    operation: "start-new-shell",
    contentId: "content",
    expectedBackend: "t1",
  });
  assert.deepEqual(view.layout.context, context);
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
  const unchanged = structuredClone(view.layout);
  activityRevision = "1";
  view.render({});
  view.render({});
  assert.equal(activityReads, 1);
  assert.equal(view.reportedActivity.t1.state, "done");
  assert.equal(view.activityLimit, "Bound terminal observation limit exceeded");
  assert.deepEqual(view.layout, unchanged);
  view.layout.contents[0].typeId = "terminal";
  view.layout.contents[0].backend = "outside-cache";
  view.content(
    { id: "vessel", name: "Terminal 1", content: "content" },
    context,
    view.panelGroup("vessel"),
  );
  assert.ok(
    nodes.some((node) => node.calls.child?.[0] === "Status unavailable"),
  );
  assert.ok(
    nodes.some(
      (node) =>
        node.calls.tooltip?.[0] === "Bound terminal observation limit exceeded",
    ),
  );
  view.layout = unchanged;
  assert.equal(view.version, "7");
  animationNotice = "Avatar animations: missing asset";
  view.render({});
  assert.equal(view.status, animationNotice ?? view.animationNotice);
  animationNotice = "";
  view.render({});
  assert.equal(view.status, "");
  animationNotice = "Avatar animations: broken PNG";
  view.render({});
  view.status = "Workspace changed";
  animationNotice = "";
  view.render({});
  assert.equal(view.status, "Workspace changed");
  view.sidebar = false;
  view.chat.render = () => div();
  view.chat.present = false;
  view.render({});
  assert.equal(
    occluders,
    0,
    "Closed compact chat must not cover the workspace",
  );
  view.chat.present = true;
  view.render({});
  assert.equal(
    occluders,
    1,
    "Visible or closing chat keeps its native occluder",
  );
  view.chat.present = false;
  view.render({});
  assert.equal(
    occluders,
    1,
    "The occluder disappears after the closing transition",
  );
  assert.deepEqual(
    actions,
    [],
    "Activity must not request Inspect or prepare content",
  );
  const goThere = nodes.find(
    (node) => node.calls.children?.[0].at(-1) === "Go there",
  );
  assert.ok(goThere);
  goThere.calls.on_click[0]({ click_count: 1 }, {});
  assert.deepEqual(actions, [{ operation: "reveal-panel", id: "vessel" }]);
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
  assert.equal(prepared.at(-1), true);
  assert.equal(areas.size, 0);
  view.layout.home.portalLayout.visible = true;
  view.render({});
  assert.deepEqual([...areas.keys()], ["portal-area-home-voyage"]);
  assert.deepEqual(areas.get("portal-area-home-voyage").calls.child[0].marker, [
    "portal-area",
    "home-voyage",
  ]);
  view.layout.home.portalLayout.visible = false;
  view.busy = true;
  ownerRevision = "11";
  view.render({});
  assert.equal(
    prepared.at(-1),
    false,
    "A pending workspace request is drawn as not prepared",
  );
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
    operation: "resize-panel-split",
    owner: { kind: "fleet", id: "fleet" },
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
