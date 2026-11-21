const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");
const workspaceSource = require("./workspace-fixture.cjs");
const uiModule = require("./ui-fixture.cjs");

function element() {
  const calls = [];
  const node = new Proxy(
    { calls },
    {
      get(target, name) {
        if (name === "calls") return calls;
        return (...args) => {
          calls.push([name, ...args]);
          return node;
        };
      },
    },
  );
  return node;
}

function markers(node) {
  return node.calls
    .flatMap(([name, value]) =>
      name === "child" ? [value] : name === "children" ? value : [],
    )
    .flatMap((child) => (Array.isArray(child?.marker) ? [child.marker] : []));
}

const MarkerStub = {
  new: (role, key = "", label) => ({
    marker: label === undefined ? [role, key] : [role, key, label],
  }),
};

function dragAreas(node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return [];
  if (Array.isArray(node)) return node.flatMap((item) => dragAreas(item, seen));
  if (!Array.isArray(node.calls)) return [];
  seen.add(node);
  const own = node.calls
    .filter(([name]) => name === "window_control_area")
    .map(([, area]) => ({ area, markers: markers(node) }));
  return own.concat(
    node.calls.flatMap(([, ...args]) =>
      args.flatMap((arg) => dragAreas(arg, seen)),
    ),
  );
}

function deepMarkers(node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return [];
  if (Array.isArray(node))
    return node.flatMap((item) => deepMarkers(item, seen));
  if (Array.isArray(node.marker)) return [node.marker];
  if (!Array.isArray(node.calls)) return [];
  seen.add(node);
  return node.calls.flatMap(([, ...args]) =>
    args.flatMap((arg) => deepMarkers(arg, seen)),
  );
}

function menuModule(Button) {
  const exports = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(
      fs.readFileSync(
        process.env.VOYAGER_MENU_SOURCE || `${__dirname}/canvas/menu.ts`,
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )(exports, (name) => {
    if (name === "./ui.js") return uiModule(element, Button);
    if (name === "voyager_native") return { Marker: MarkerStub };
    return name === "gpui-kit"
      ? { div: element }
      : { Button, Popover: { new: element } };
  });
  return exports;
}

test("maximization renders the selected leaf while retaining preparation of the whole tree", () => {
  const Canvas = new Function(
    "View",
    "div",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {}, element);
  const fleet = {
    id: "fleet",
    maximizedPlacement: "second",
    placements: [{ id: "first" }, { id: "second" }],
    root: {
      kind: "branch",
      first: { kind: "leaf", placement: "first" },
      second: { kind: "leaf", placement: "second" },
    },
  };
  const rendered = [];
  const view = Object.assign(new Canvas(), {
    pane(tree) {
      rendered.push(tree);
      return element();
    },
  });
  const layout = {
    view: "fleet",
    selectedVoyage: "voyage",
    selectedFleet: fleet.id,
    voyages: [{ id: "voyage", fleets: [fleet] }],
  };
  view.activeRegion(layout, fleet);
  assert.deepEqual(rendered.pop(), { kind: "leaf", placement: "second" });
  assert.deepEqual(
    view.visibleVessels(fleet).map((vessel) => vessel.id),
    ["first", "second"],
  );
  assert.deepEqual(
    view.displayedVessels(fleet).map((vessel) => vessel.id),
    ["second"],
  );
  delete fleet.maximizedPlacement;
  view.activeRegion(layout, fleet);
  assert.equal(rendered.pop(), fleet.root);
});

test("worker creation keeps its opening target and revision across a delayed catalogue", async () => {
  const { launchCatalog, contentCatalog } =
    await import("../contract/generated/validate.js");
  const source = ts.transpileModule(
    fs.readFileSync(
      process.env.VOYAGER_CREATION_SOURCE || `${__dirname}/canvas/creation.ts`,
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const buttons = new Map();
  const Button = {
    new(id) {
      const node = element();
      buttons.set(id, node);
      return node;
    },
  };
  let resolve, rejectDescription;
  const exports = {};
  new Function("exports", "require", source)(exports, (name) => {
    if (name === "gpui-kit") return { div: element };
    if (name === "gpui-base")
      return {
        Button,
        Popover: { new: element },
      };
    if (name === "./menu.js") return menuModule(Button);
    if (name === "voyager_native") return { Marker: MarkerStub };
    if (name === "voyager_workspace")
      return {
        launches: () =>
          new Promise((done) => {
            resolve = done;
          }),
      };
    if (name === "voyager_content_view")
      return {
        descriptions: () =>
          new Promise((_done, reject) => {
            rejectDescription = reject;
          }),
      };
    return { launchCatalog, contentCatalog };
  });
  const picker = new exports.CreationPicker();
  const destination = {
    kind: "placement",
    owner: { kind: "fleet", id: "fleet" },
    insertion: { kind: "beside", id: "original", side: "right" },
  };
  const actions = [];
  const create = (...value) => actions.push(value);
  const pending = [];
  const cx = {
    spawn(run) {
      pending.push(run(cx));
    },
    notify() {},
  };
  const controlled = picker.render(
    "portal",
    destination,
    "7",
    create,
    element(),
    undefined,
    false,
  );
  controlled.calls.find(([name]) => name === "on_open_change")[1](true, cx);
  assert.equal(picker.current, null);
  assert.equal(pending.length, 0);
  let hiddenReady;
  const root = picker.render(
    "original",
    destination,
    "7",
    create,
    element(),
    () =>
      new Promise((done) => {
        hiddenReady = done;
      }),
  );
  root.calls.find(([name]) => name === "on_open_change")[1](true, cx);
  const launch = {
    kind: "codex",
    model: "gpt-6.1-sol",
    effort: "high",
    permissions: "yolo",
  };
  resolve(
    JSON.stringify({
      settings: {
        default: "codex",
        entries: [
          { id: "codex", name: "Codex", launch },
          {
            id: "missing",
            name: "Missing",
            launch: { kind: "program", argv: ["/missing"] },
          },
        ],
      },
      available: ["codex"],
      errors: ["Missing is unavailable"],
      path: "/profile/launches.json",
    }),
  );
  await new Promise(setImmediate);
  buttons.clear();
  picker.render("original", destination, "7", create);
  assert.ok(
    !buttons.has("create-worker-codex"),
    "New-content choices wait for the complete local metadata set so rows cannot move under the pointer",
  );
  rejectDescription(Error("Notes metadata unavailable"));
  await new Promise(setImmediate);
  const choicesReady = Boolean(picker.catalog);
  buttons.clear();
  picker.render("original", destination, "7", create);
  assert.equal(picker.ready, true);
  assert.ok(
    buttons.has("create-worker-codex"),
    "Ready choices are usable before hidden reads finish",
  );
  hiddenReady({ panels: [] });
  await pending[0];
  assert.ok(
    choicesReady,
    "Ready choices appear without waiting for hidden programs",
  );
  assert.equal(picker.error, "Notes metadata unavailable");
  picker.render(
    "original",
    {
      ...destination,
      insertion: { kind: "beside", id: "later", side: "bottom" },
    },
    "99",
    create,
  );
  assert.equal(buttons.has("create-worker-missing"), false);
  assert.deepEqual(
    buttons
      .get("create-worker-codex")
      .calls.filter(([name]) => name === "child"),
    [
      ["child", { marker: ["create-worker", "codex"] }],
      ["child", "Codex"],
    ],
  );
  const choose = buttons
    .get("create-worker-codex")
    .calls.find(([name]) => name === "on_click")[1];
  choose({}, cx);
  choose({}, cx);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], [
    { operation: "create-vessel", typeId: "agent", destination, launch },
    "7",
    cx,
  ]);
  assert.equal(picker.current, null);
  picker.current = { id: "portal", version: "99", destination };
  const dismissed = [];
  const cancel = picker.render(
    "portal",
    destination,
    "99",
    create,
    element(),
    undefined,
    false,
    (...args) => dismissed.push(args),
  );
  cancel.calls.find(([name]) => name === "on_open_change")[1](false, cx);
  assert.equal(picker.current, null);
  assert.equal(actions.length, 1);
  assert.deepEqual(dismissed, [[destination, cx]]);
  Object.assign(picker, {
    current: { id: "original", version: "7", destination },
    notes: true,
    agents: true,
  });
  buttons.clear();
  picker.render("original", destination, "7", create);
  assert.deepEqual(markers(buttons.get("create-notes-vessel")), [
    ["create-notes", ""],
  ]);
  assert.deepEqual(markers(buttons.get("create-agents-vessel")), [
    ["create-agents", ""],
  ]);
  Object.assign(picker, {
    hidden: [{ id: "hidden-1", name: "Shell", path: "/work" }],
    expanded: false,
  });
  buttons.clear();
  picker.render("original", destination, "7", create);
  assert.deepEqual(markers(buttons.get("hidden-vessels")), [
    ["hidden-panels", ""],
  ]);
  assert.equal(buttons.has("reopen-hidden-1"), false);
  picker.expanded = true;
  buttons.clear();
  picker.render("original", destination, "7", create);
  assert.deepEqual(markers(buttons.get("reopen-hidden-1")), [
    ["reopen-placement", "hidden-1"],
  ]);
  picker.current = null;
  buttons.clear();
  picker.render("original", destination, "7", create);
  assert.equal(buttons.size, 0);
});

test("inspection markers name each control by its role and id and report the text it shows", () => {
  let decorated = false;
  const quits = [];
  const buttons = new Map();
  const Button = {
    new(id) {
      const node = element();
      buttons.set(id, node);
      return node;
    },
  };
  const Canvas = new Function(
    "View",
    "div",
    "Button",
    "projection",
    "svg",
    "CreationPicker",
    "Name",
    "Brand",
    "Speech",
    "MeasureHeight",
    "speech_in_primary",
    "dock_target_visible",
    "client_decorated",
    "quit",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(
    class {},
    element,
    Button,
    () => ({}),
    element,
    class {
      render(_id, _destination, _version, _create, trigger) {
        return trigger;
      }
    },
    { new: element },
    { new: element },
    { new: element },
    { new: element },
    () => false,
    () => dockVisible,
    () => decorated,
    () => quits.push("quit"),
  );
  const menus = new Map();
  let dockVisible = false;
  const view = Object.assign(new Canvas(), {
    sidebar: true,
    names: new Map(),
    chat: { toggleView: element, render: element },
    target: (_id, _scope, child) => child,
    contextMenu: (id, child, items) => {
      menus.set(id, items);
      return child;
    },
    creationControl: (_id, _destination, trigger) => trigger,
    compactPortalContext: () => false,
    closedFleetItems: () => [],
  });
  const fleet = { kind: "fleet", id: "fleet-7" };
  const draft = {};
  view.editing = { target: fleet, state: draft };
  const [editor] = markers(view.action("A label", null, false, fleet));
  assert.deepEqual(editor.slice(0, 2), ["name-editor", "fleet-7"]);
  assert.equal(editor[2], draft);
  view.editing = null;
  const layout = { voyages: [], context: { kind: "workspace" }, view: "fleet" };
  view.sidebarRegion(layout);
  assert.deepEqual(markers(buttons.get("create-voyage")), [
    ["create-voyage", ""],
  ]);
  assert.equal(buttons.has("rail-create-voyage"), false);
  buttons.clear();
  view.sidebar = false;
  view.sidebarRegion(layout);
  assert.deepEqual(markers(buttons.get("rail-create-voyage")), [
    ["create-voyage", ""],
  ]);
  assert.equal(buttons.has("create-voyage"), false);
  view.sidebar = true;
  view.fleetRegion(layout, { id: "voyage-7", fleets: [] }, undefined);
  assert.deepEqual(markers(buttons.get("create-fleet-tab")), [
    ["create-fleet", "voyage-7"],
  ]);
  const filler = (key) => ({ area: "drag", markers: [["window-drag", key]] });
  const fleets = [
    { id: "fleet-1", name: "One", closed: false, placements: [] },
    { id: "fleet-2", name: "Two", closed: false, placements: [] },
  ];
  const voyage = { id: "voyage-7", fleets };
  assert.deepEqual(dragAreas(view.fleetRegion(layout, voyage, fleets[0])), [
    filler("fleets"),
  ]);
  assert.deepEqual(dragAreas(view.fleetRegion(layout, undefined, undefined)), [
    filler("fleets"),
  ]);
  assert.deepEqual(
    dragAreas(view.fleetRegion({ ...layout, view: "home" }, voyage, fleets[0])),
    [filler("home")],
  );
  assert.deepEqual(dragAreas(view.sidebarRegion(layout, voyage)), [
    filler("sidebar"),
  ]);
  const controls = ["minimize", "maximize", "close"].map(
    (name) => `window-${name}`,
  );
  assert.deepEqual(
    controls.filter((id) => buttons.has(id)),
    [],
  );
  decorated = true;
  const windowCalls = [];
  globalThis.window = {
    is_maximized: () => false,
    minimize_window: () => windowCalls.push("minimize"),
    zoom_window: () => windowCalls.push("zoom"),
  };
  view.fleetRegion(layout, { id: "voyage-7", fleets: [] }, undefined);
  assert.deepEqual(
    controls.map((id) => markers(buttons.get(id))),
    controls.map((id) => [[id, ""]]),
  );
  for (const id of controls)
    buttons
      .get(id)
      .calls.find(([name]) => name === "on_click")[1]();
  assert.deepEqual(windowCalls, ["minimize", "zoom"]);
  assert.deepEqual(quits, ["quit"]);
  delete globalThis.window;
  decorated = false;
  for (const kind of ["voyage", "fleet", "vessel", "portal"])
    assert.deepEqual(
      markers(view.action("A label", null, false, { kind, id: `${kind}-7` })),
      [[`${kind}-name`, `${kind}-7`, "A label"]],
    );
  const heading = view.action(
    "Terminal",
    null,
    false,
    { kind: "vessel", id: "vessel-7" },
    "bash · project",
  );
  assert.deepEqual(markers(heading), [
    ["vessel-name", "vessel-7", "bash · project"],
  ]);
  assert.equal(
    heading.calls.find(([name]) => name === "children")[1].at(-1),
    "bash · project",
  );
  assert.deepEqual(
    markers(view.action("Refresh", { operation: "inspect" })),
    [],
  );
  assert.deepEqual(markers(view.sidebarToggle()), [["sidebar-toggle", ""]]);
  const group = { owner: { kind: "fleet", id: "fleet-1" } };
  for (const side of ["right", "bottom"])
    assert.deepEqual(
      markers(view.splitControl({ id: "placement-3" }, group, side)),
      [[`split-${side}`, "placement-3"]],
    );
  const populated = {
    voyages: [
      { id: "voyage-7", name: "Open", fleets: [] },
      { id: "voyage-9", name: "Shut", closed: true, closedOrder: "1" },
    ],
    context: { kind: "workspace" },
    view: "fleet",
  };
  Object.assign(view, {
    layout: populated,
    worktrees: {
      available: () => true,
      canRemove: () => false,
      groups: (voyages) => ({
        roots: voyages.map((item) => item.id),
        children: {},
      }),
    },
    recentOpen: true,
  });
  const sidebar = deepMarkers(
    view.sidebarRegion(populated, populated.voyages[0]),
  );
  for (const expected of [
    ["workspace-dock", ""],
    ["recent-voyages", ""],
    ["reopen-voyage", "voyage-9"],
  ])
    assert.deepEqual(
      sidebar.filter(
        ([role, key]) => role === expected[0] && key === expected[1],
      ),
      [expected],
      expected[0],
    );
  assert.deepEqual(
    menus.get("voyage-voyage-7").find((item) => item.label === "Close").marker,
    { role: "close-voyage", key: "voyage-7" },
  );
  view.recentOpen = false;
  assert.equal(
    deepMarkers(view.sidebarRegion(populated, populated.voyages[0])).some(
      ([role]) => role === "reopen-voyage",
    ),
    false,
  );
  const portals = {
    id: "voyage-7",
    fleets: [],
    portalLayout: { visible: true, mode: "overlay", root: null, width: 340 },
  };
  assert.deepEqual(
    deepMarkers(view.fleetRegion(populated, portals, undefined)).filter(
      ([role]) => role === "toggle-portals",
    ),
    [["toggle-portals", "voyage-7"]],
  );
  const vessel = { kind: "vessel", id: "placement-4" };
  const away = { ...populated, context: vessel };
  assert.deepEqual(
    deepMarkers(view.contextRegion(away, portals, undefined)).filter(
      ([role]) => role === "go-there",
    ),
    [["go-there", ""]],
  );
  dockVisible = true;
  assert.deepEqual(
    deepMarkers(view.contextRegion(away, portals, undefined)).filter(
      ([role]) => role === "go-there",
    ),
    [],
  );
});

test("a context menu keeps the marker of each item and draws it inside the entry", () => {
  const entries = new Map();
  const Button = {
    new(id) {
      const node = element();
      entries.set(id, node);
      return node;
    },
  };
  const { WorkspaceMenu } = menuModule(Button);
  const menu = new WorkspaceMenu();
  const items = [
    { label: "Plain", choose() {} },
    {
      label: "Close",
      marker: { role: "close-voyage", key: "voyage-1" },
      choose() {},
    },
  ];
  menu.current = { id: "voyage-1", version: "1", items };
  menu.render("voyage-1", "1", element(), items);
  assert.deepEqual(markers(entries.get("menu-voyage-1-0")), []);
  assert.deepEqual(markers(entries.get("menu-voyage-1-1")), [
    ["close-voyage", "voyage-1"],
  ]);
});

test("the workspace context menu passes each item's marker to the menu", () => {
  const Canvas = new Function(
    "View",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {});
  let passed;
  const view = Object.assign(new Canvas(), {
    version: "5",
    editing: null,
    layoutName: null,
    menus: {
      render: (_id, _version, _trigger, items) => {
        passed = items;
        return null;
      },
    },
  });
  const marker = { role: "close-voyage", key: "voyage-1" };
  view.contextMenu("voyage-1", element(), [
    { label: "Close", marker, choose() {} },
  ]);
  assert.deepEqual(passed[0].marker, marker);
});

test("the actual canvas composes a retained right column through native presentation", () => {
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/canvas/regions.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("exports", "require", source)(exports, () => ({ div: element }));
  const columnCalls = [];
  const Canvas = new Function(
    "View",
    "div",
    "Column",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {}, element, {
    new(...args) {
      const node = element();
      columnCalls.push({ args, node });
      return node;
    },
  });
  const actions = [];
  const view = Object.assign(new Canvas(), {
    version: "7",
    splitSession: "test",
    splitReset: 0,
    run: (...args) => actions.push(args),
  });
  const canvas = JSON.parse(
    fs.readFileSync(`${__dirname}/../contract/generated/response.schema.json`),
  ).definitions.Layout.properties.canvas.default;
  const alternate = structuredClone(canvas.root);
  alternate.children[1].children[0].size.pixels = 32;
  for (const [mode, selected] of ["overlay", "make-room"].flatMap((mode) =>
    [null, 0, 1].map((selected) => [mode, selected]),
  )) {
    const regions = new Map();
    const visits = [];
    const voyage = {
      id: "voyage",
      portalLayout: { mode, width: 340, visible: true },
    };
    const rendered = exports.composeRegions(
      {
        ...canvas,
        sidebarCollapsed: true,
        root:
          selected === null
            ? canvas.root
            : {
                kind: "stack",
                selected,
                children: [canvas.root, alternate],
              },
      },
      (name) => {
        visits.push(name);
        const node = element();
        regions.set(name, node);
        return node;
      },
      (underlay, panels) => view.portalColumn(underlay, panels, voyage),
    );
    assert.equal(regions.size, 5);
    assert.equal(visits.length, 5);
    assert.ok(
      regions
        .get("sidebar")
        .calls.some(([name, value]) => name === "w" && value === 48),
    );
    assert.ok(
      regions
        .get("fleet-strip")
        .calls.some(
          ([name, value]) =>
            name === "h" && value === (selected === 1 ? 32 : 40),
        ),
    );
    const column = columnCalls.at(-1);
    assert.equal(column.args[1], 340);
    assert.equal(column.args[2], "7");
    assert.equal(
      column.node.calls.some(([name]) => name === "absolute"),
      mode === "overlay",
    );
    assert.equal(
      column.node.calls.filter(([name]) => name === "child").at(-1)[1],
      regions.get("portals"),
    );
    column.args[4]("7", 420, {});
    assert.deepEqual(actions.at(-1)[0], {
      operation: "set-portal-presentation",
      voyage: "voyage",
      width: 420,
    });
    assert.equal(actions.at(-1)[3], "7");
    assert.ok(
      rendered.calls.some(
        ([name]) => name === (selected === null ? "children" : "child"),
      ),
    );
  }
});

test("context metadata rejects a late different dock and notifies only changed facts", async () => {
  const { contextFacts: validateFacts } =
    await import("../contract/generated/validate.js");
  let result;
  const Canvas = new Function(
    "View",
    "context_facts",
    "validateFacts",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {}, async () => result, validateFacts);
  const view = Object.assign(new Canvas(), {
    version: "2",
    layout: { context: { kind: "workspace" }, voyages: [] },
    contextFacts: null,
    names: new Map(),
  });
  view.readProcesses = async () => {};
  const facts = {
    version: "2",
    scope: { kind: "workspace" },
    path: ["Workspace"],
    directory: { kind: "multiple" },
    branch: { kind: "unavailable" },
  };
  let notified = 0;
  const cx = {
    spawn(callback) {
      pending.push(callback(cx));
    },
    notify() {
      notified += 1;
    },
  };
  const pending = [];
  result = JSON.stringify(facts);
  view.acceptSnapshot({ version: "2", layout: view.layout }, cx);
  assert.equal(pending.length, 3);
  await Promise.all(pending);
  assert.equal(view.contextFacts.path[0], "Workspace");
  view.contextFacts = null;
  notified = 0;
  result = JSON.stringify({ ...facts, version: "1" });
  await view.readContext(cx);
  assert.equal(view.contextFacts, null);
  result = JSON.stringify(facts);
  await view.readContext(cx);
  await view.readContext(cx);
  assert.equal(notified, 1);
  result = JSON.stringify({ ...facts, scope: { kind: "voyage", id: "other" } });
  await view.readContext(cx);
  assert.equal(view.contextFacts.scope.kind, "workspace");
  result = "{}";
  await view.readContext(cx);
  assert.equal(view.contextFacts, null);
  assert.equal(notified, 2);
  let reject;
  result = new Promise((_resolve, failure) => {
    reject = failure;
  });
  const earlier = view.readContext(cx);
  result = JSON.stringify(facts);
  await view.readContext(cx);
  reject(Error("Earlier read failed"));
  await earlier;
  assert.deepEqual(view.contextFacts, facts);
});

test("a dock follows once for each dock revision, once no request is preparing", () => {
  const layout = (context, last) => ({
    view: "fleet",
    selectedVoyage: "voyage-1",
    selectedFleet: "fleet-4",
    context,
    lastVessels: [{ fleet: "fleet-4", vessel: last }],
    vessels: [{ id: "content-2" }, { id: "content-10" }],
    voyages: [
      {
        id: "voyage-1",
        name: "Voyager",
        portals: [],
        fleets: [
          {
            id: "fleet-4",
            name: "Fleet 1",
            placements: [
              { id: "placement-3", vessel: "content-2", name: "First" },
              { id: "placement-11", vessel: "content-10", name: "Second" },
            ],
            root: {
              kind: "branch",
              axis: "horizontal",
              share: 5000,
              first: { kind: "leaf", placement: "placement-3" },
              second: { kind: "leaf", placement: "placement-11" },
            },
          },
        ],
      },
    ],
  });
  const reply = (id) => ({
    requestId: `request-${id}`,
    status: "applied",
    version: "1",
    fresh: true,
    layout: layout({ kind: "vessel", id }, id),
  });
  let result = null;
  let dockRevision = "0";
  const { Canvas, acceptDockResult } = new Function(
    "View",
    "take_result",
    "validateResponse",
    "window",
    "workspace_notice",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "const Canvas = class") +
      "\nreturn { Canvas, acceptDockResult };",
  )(
    class {},
    () => {
      const taken = result;
      result = null;
      return taken;
    },
    () => true,
    { has_active_dialog: () => false },
    () => ({ dockRevision }),
  );
  const focused = [];
  const view = Object.assign(new Canvas(), {
    version: "1",
    names: new Map(),
    contextFacts: null,
    terminals: new Map(
      ["content-2", "content-10"].map((id) => [
        id,
        { focus: () => focused.push(id) },
      ]),
    ),
  });
  view.readContext = async () => {};
  view.readProcesses = async () => {};
  view.readObservation = async () => {};
  const cx = {
    spawn(callback) {
      callback(cx);
    },
    notify() {},
    focus_handle: () => ({}),
  };
  let next = null;
  let inspects = 0;
  view.run = (action, task, done) => {
    assert.equal(action.operation, "inspect");
    inspects += 1;
    view.acceptSnapshot(next, task);
    done?.(next, task);
  };
  const render = () => acceptDockResult(view, cx);
  view.acceptSnapshot(reply("placement-3"), cx);
  render();
  assert.deepEqual(focused, [], "the first notice only records the dock");
  result = JSON.stringify(reply("placement-11"));
  next = reply("placement-11");
  dockRevision = "1";
  render();
  render();
  assert.deepEqual(focused, ["content-10"], "the avatar's dock follows once");
  assert.equal(inspects, 1, "the avatar's dock runs only its own inspect");
  focused.length = 0;
  next = reply("placement-3");
  view.acceptSnapshot(next, cx);
  dockRevision = "2";
  view.busy = true;
  render();
  assert.deepEqual(focused, [], "a dock waits while a request prepares");
  view.busy = false;
  render();
  render();
  assert.deepEqual(
    focused,
    ["content-2"],
    "a dock from another caller follows once",
  );
  assert.equal(inspects, 2, "a dock from another caller runs one inspect");
  focused.length = 0;
  view.acceptSnapshot(reply("placement-3"), cx);
  render();
  assert.deepEqual(focused, [], "a re-read with no new dock does not follow");
  assert.equal(inspects, 2, "a re-read with no new dock runs no inspect");
  dockRevision = "3";
  render();
  render();
  assert.deepEqual(
    focused,
    ["content-2"],
    "a second dock on the shown Vessel follows once",
  );
  assert.equal(
    inspects,
    3,
    "a second dock on the shown Vessel runs one inspect",
  );
  focused.length = 0;
  next = reply("placement-11");
  dockRevision = "4";
  render();
  result = JSON.stringify(reply("placement-11"));
  render();
  assert.deepEqual(
    focused,
    ["content-10"],
    "an avatar dock whose notice lands before its reply follows once",
  );
  assert.equal(inspects, 4, "that dock runs one inspect");
});

test("Chat stays below the primary dock before Home and Voyages, using one retained instance", () => {
  const buttons = new Map();
  const Canvas = new Function(
    "View",
    "div",
    "Button",
    "Brand",
    "Speech",
    "projection",
    "svg",
    "MeasureHeight",
    "speech_in_primary",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(
    class {},
    element,
    {
      new(id) {
        const node = element();
        buttons.set(id, node);
        return node;
      },
    },
    { new: element },
    { new: element },
    () => ({}),
    element,
    { new: element },
    () => false,
  );
  const panel = element();
  const toggle = element();
  let renders = 0;
  const chat = {
    toggleView: () => toggle,
    render() {
      renders += 1;
      return panel;
    },
  };
  const view = Object.assign(new Canvas(), {
    sidebar: true,
    chat,
    target: (_id, _scope, child) => child,
    contextMenu: (_id, trigger) => trigger,
  });
  const layout = { voyages: [], context: { kind: "workspace" } };
  const measured = view.sidebarRegion(layout);
  const sidebar = measured.calls.find(([name]) => name === "child")[1];
  const children = sidebar.calls
    .filter(([name]) => name === "child")
    .map(([, child]) => child);
  function contains(node, predicate) {
    if (!node?.calls) return false;
    if (predicate(node)) return true;
    return node.calls.some(([name, value]) =>
      name === "child"
        ? contains(value, predicate)
        : name === "children" &&
          value.some((child) => contains(child, predicate)),
    );
  }
  const controls = children.findIndex((node) =>
    contains(node, (candidate) =>
      candidate.calls.some(
        ([name, value]) =>
          name === "id" && value === "primary-conversation-controls",
      ),
    ),
  );
  const home = children.findIndex((node) =>
    contains(node, (candidate) => candidate === buttons.get("home-navigation")),
  );
  assert.equal(controls, 0);
  assert.equal(children[controls + 1], panel);
  assert.ok(home > controls + 1);
  assert.ok(contains(children[controls], (node) => node === toggle));
  view.sidebar = false;
  view.sidebarRegion(layout);
  assert.equal(renders, 1);
  assert.equal(view.chat, chat);
});

test("right-click actions retain their opening revision and dismiss before acting", () => {
  const nodes = new Map();
  const Menu = menuModule({
    new(id) {
      const node = element();
      nodes.set(id, node);
      return node;
    },
  }).WorkspaceMenu;
  const Canvas = new Function(
    "View",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {});
  const view = Object.assign(new Canvas(), {
    menus: new Menu(),
    version: "7",
  });
  const actions = [];
  const cx = {
    notify() {},
    spawn(callback) {
      return callback(cx);
    },
  };
  const items = [
    {
      label: "Save layout",
      choose: (version) => actions.push({ version, open: view.menus.current }),
    },
  ];
  let menu = view.contextMenu("fleet", element(), items);
  assert.equal(
    menu.calls.find(([name]) => name === "mouse_button")[1],
    "right",
  );
  menu.calls.find(([name]) => name === "on_open_change")[1](true, cx);
  view.contextMenu("fleet", element(), items);
  let click = nodes
    .get("menu-fleet-0")
    .calls.find(([name]) => name === "on_click")[1];
  view.version = "8";
  click({}, cx);
  assert.deepEqual(actions, []);
  assert.match(view.status, /layout changed/);
  menu = view.contextMenu("fleet", element(), items);
  menu.calls.find(([name]) => name === "on_open_change")[1](true, cx);
  view.contextMenu("fleet", element(), items);
  click = nodes
    .get("menu-fleet-0")
    .calls.find(([name]) => name === "on_click")[1];
  click({}, cx);
  assert.deepEqual(actions, [{ version: "8", open: null }]);
  click({}, cx);
  assert.equal(actions.length, 1);
  menu.calls.find(([name]) => name === "on_open_change")[1](true, cx);
  view.contextMenu("fleet", element(), items);
  click = nodes
    .get("menu-fleet-0")
    .calls.find(([name]) => name === "on_click")[1];
  view.names = new Map();
  view.acceptSnapshot(
    {
      version: "9",
      status: "applied",
      fresh: true,
      layout: { view: "home", voyages: [], context: { kind: "workspace" } },
    },
    cx,
  );
  assert.equal(view.menus.current, null);
  click({}, cx);
  assert.equal(actions.length, 1);
});

test("hidden choices retain process-free data and require matching live backends", () => {
  const exports = {};
  new Function(
    "exports",
    ts.transpileModule(
      fs.readFileSync(`${__dirname}/canvas/panels.ts`, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )(exports);
  const panel = (id, content) => ({
    id,
    vessel: content,
    name: id,
    hidden: false,
  });
  const first = {
    id: "first",
    placements: [
      panel("visible", "shown"),
      panel("notes", "note"),
      panel("shell", "live"),
      panel("ended", "dead"),
    ],
    root: { kind: "leaf", placement: "visible" },
  };
  const second = {
    id: "second",
    placements: [panel("other", "other-note")],
    root: null,
  };
  const voyage = {
    id: "voyage",
    fleets: [first, second],
    portals: [panel("portal", "portal-note")],
    portalLayout: { root: null },
  };
  const layout = {
    voyages: [
      voyage,
      {
        id: "elsewhere",
        fleets: [
          {
            id: "foreign",
            placements: [panel("foreign", "foreign-note")],
            root: null,
          },
        ],
        portals: [],
      },
    ],
    vessels: [
      ...["shown", "live", "dead"].map((id) => ({
        id,
        typeId: "terminal",
        backend: id,
      })),
      ...["note", "other-note", "portal-note", "foreign-note"].map((id) => ({
        id,
        typeId: "notes",
      })),
    ],
  };
  const destination = {
    kind: "placement",
    owner: { kind: "fleet", id: "first" },
    insertion: { kind: "beside", id: "visible", side: "right" },
  };
  const choices = (processes) =>
    exports
      .hiddenPanels(layout, destination, processes)
      .map((panel) => panel.id);
  assert.deepEqual(choices([]), ["notes", "other"]);
  assert.deepEqual(
    choices([
      { vesselId: "live", terminalId: "wrong", state: "live", pid: 42 },
    ]),
    ["notes", "other"],
  );
  assert.deepEqual(
    choices([
      { vesselId: "live", terminalId: "live", state: "live", pid: 42 },
      { vesselId: "dead", terminalId: "dead", state: "finished", pid: 43 },
    ]),
    ["notes", "shell", "other"],
  );
  first.maximizedPlacement = "visible";
  assert.deepEqual(choices([]), ["notes", "other"]);
});

test("Activity scopes live work, orders status rows and preserves navigation", async () => {
  const { activityBadge } = await import("./canvas/activity.js");
  const validators = await import("../contract/generated/validate.js");
  const buttons = new Map();
  const icons = [];
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/canvas/agents.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("exports", "require", source)(exports, (name) => {
    if (name === "gpui-kit") return { div: element, svg: element };
    if (name === "gpui-base")
      return {
        Button: {
          new(id) {
            const node = element();
            buttons.set(id, node);
            return node;
          },
        },
      };
    if (name === "voyager_theme") return { projection: () => ({}) };
    if (name === "voyager_native") return { Marker: MarkerStub };
    if (name === "./process-icons.js") {
      const shared = {};
      new Function(
        "exports",
        "require",
        ts.transpileModule(
          fs.readFileSync(`${__dirname}/canvas/process-icons.ts`, "utf8"),
          { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText,
      )(shared, (module) => {
        if (module === "gpui-kit") return { image: element, svg: element };
        if (module === "voyager_workspace")
          return {
            agent_programs: () =>
              fs.readFileSync(
                `${__dirname}/../content/agent-programs.json`,
                "utf8",
              ),
          };
        if (module === "./validate.js") return validators;
        throw Error(module);
      });
      return {
        ...shared,
        processIcon: (program) => {
          icons.push(program);
          return element();
        },
      };
    }
    if (name === "./voyage-colours.js")
      return { voyageColour: () => "#59a5ff" };
    if (name === "./panels.js") {
      const panels = {};
      new Function(
        "exports",
        ts.transpileModule(
          fs.readFileSync(`${__dirname}/canvas/panels.ts`, "utf8"),
          { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText,
      )(panels);
      return panels;
    }
    return { activityBadge };
  });
  const contents = [
    { id: "agent", typeId: "terminal", backend: "agent-terminal" },
    {
      id: "shell",
      typeId: "terminal",
      backend: "shell-terminal",
      launch: { kind: "codex" },
    },
    { id: "notes", typeId: "notes" },
    {
      id: "unknown",
      typeId: "terminal",
      backend: "unknown-terminal",
      launch: { kind: "codex" },
    },
  ];
  const layout = {
    vessels: contents,
    home: {
      id: "home",
      name: "Home",
      fleets: [
        {
          id: "home-fleet",
          name: "Home",
          placements: [{ id: "home-agent", vessel: "agent", name: "Renamed" }],
        },
      ],
      portals: [],
    },
    voyages: [
      {
        id: "voyage",
        name: "Voyage",
        fleets: [
          {
            id: "fleet",
            name: "Fleet",
            placements: [
              { id: "bash", vessel: "shell", name: "Shell" },
              { id: "unknown", vessel: "unknown", name: "Unknown" },
            ],
          },
        ],
        portals: [{ id: "notes", vessel: "notes", name: "Notes" }],
        portalLayout: { root: { kind: "leaf", placement: "notes" } },
      },
    ],
  };
  const processes = [
    {
      vesselId: "agent",
      terminalId: "agent-terminal",
      state: "live",
      foreground: "codex",
      agentName: "folder",
    },
    {
      vesselId: "shell",
      terminalId: "shell-terminal",
      state: "live",
      foreground: "bash",
    },
    {
      vesselId: "unknown",
      terminalId: "unknown-terminal",
      state: "live",
      foreground: "python",
    },
  ];
  const navigated = [];
  const collapsed = new Set(["expanded-agents-home"]);
  const toggles = [];
  const render = (reported = {}, unavailable, owner) =>
    exports.agentsView(
      layout,
      processes,
      reported,
      (...args) => navigated.push(args),
      unavailable,
      { collapsed, toggle: (id) => toggles.push(id) },
      owner,
    );
  render();
  assert.ok(![...buttons.keys()].some((key) => key.includes("group-status")));
  assert.ok(buttons.has("vessels-group-type-voyage-Bash"));
  assert.ok(buttons.has("vessels-group-type-voyage-Notes"));
  assert.ok(buttons.has("vessels-group-type-voyage-python"));
  assert.deepEqual(icons, ["Codex", "Bash", "Notes", "python"]);
  const row = buttons.get("vessel-home-agent");
  const label = row.calls.find(([name]) => name === "accessibility_label")[1];
  assert.match(label, /folder, Codex, Idle/);
  assert.deepEqual(deepMarkers(row), [["agents-row", "home-agent", label]]);
  const cx = {};
  row.calls.find(([name]) => name === "on_click")[1]({}, cx);
  buttons
    .get("vessel-notes")
    .calls.find(([name]) => name === "on_click")[1]({}, cx);
  assert.deepEqual(navigated, [
    ["home-agent", cx],
    ["notes", cx],
  ]);
  buttons.clear();
  render({
    "agent-terminal": { state: "idle", reported: true, limited: false },
  });
  assert.match(
    buttons
      .get("vessel-home-agent")
      .calls.find(([name]) => name === "accessibility_label")[1],
    /Idle/,
  );
  layout.voyages[0].fleets[0].placements[0].name = "Terminal 42";
  processes[1].cwd = "/project/my-work";
  buttons.clear();
  render();
  assert.match(
    buttons
      .get("vessel-bash")
      .calls.find(([name]) => name === "accessibility_label")[1],
    /^Bash · my-work,/,
  );
  assert.ok(
    !buttons
      .get("vessel-bash")
      .calls.some(
        ([name, value]) =>
          name === "accessibility_label" && /Terminal 42/.test(value),
      ),
  );
  buttons.clear();
  render({}, "Core observation failed");
  assert.match(
    buttons
      .get("vessel-home-agent")
      .calls.find(([name]) => name === "accessibility_label")[1],
    /Idle/,
  );
  assert.ok(
    ![...buttons.keys()].some((key) => key.includes("Status unavailable")),
  );
  buttons.clear();
  collapsed.delete("expanded-agents-home");
  render();
  assert.ok(!buttons.has("vessel-home-agent"));
  buttons
    .get("vessels-group-agents-home")
    .calls.find(([name]) => name === "on_click")[1]({}, cx);
  assert.deepEqual(toggles, ["expanded-agents-home"]);
  buttons.clear();
  collapsed.add("voyage-voyage");
  render();
  assert.ok(buttons.has("vessels-voyage-voyage"));
  assert.ok(
    !buttons.has("vessel-notes"),
    "A collapsed Voyage hides its contents",
  );
  buttons
    .get("vessels-voyage-voyage")
    .calls.find(([name]) => name === "on_click")[1]({}, cx);
  assert.equal(toggles.at(-1), "voyage-voyage");
  collapsed.delete("voyage-voyage");
  buttons.clear();
  render();
  assert.ok(
    buttons.has("vessel-notes"),
    "Reopening the Voyage restores its contents",
  );
  buttons.clear();
  render({}, undefined, { kind: "portals", voyage: "voyage" });
  assert.ok(buttons.has("vessel-bash") && buttons.has("vessel-notes"));
  assert.ok(!buttons.has("vessel-home-agent"));
  assert.ok(!buttons.has("vessels-voyage-home"));
  buttons.clear();
  render({}, undefined, { kind: "fleet", id: "fleet" });
  assert.ok(buttons.has("vessel-bash"));
  assert.ok(!buttons.has("vessel-notes") && !buttons.has("vessel-home-agent"));
  buttons.clear();
  collapsed.add("expanded-agents-home");
  render({}, undefined, { kind: "fleet", id: "home-fleet" });
  assert.ok(buttons.has("vessel-home-agent") && buttons.has("vessel-notes"));
  layout.voyages[0].portalLayout.root = null;
  buttons.clear();
  render();
  assert.ok(
    !buttons.has("vessel-notes"),
    "Closed documents are not active work",
  );
  layout.voyages[0].portalLayout.root = { kind: "leaf", placement: "notes" };
  processes[1].state = "finished";
  buttons.clear();
  render();
  assert.ok(!buttons.has("vessel-bash"), "Ended shells are not running work");
  assert.ok(
    buttons.has("vessel-notes"),
    "Documents are independent of processes",
  );
  layout.voyages[0].closed = true;
  buttons.clear();
  render();
  assert.ok(
    !buttons.has("vessels-voyage-voyage"),
    "Closed Voyages are not open work",
  );
  assert.ok(!buttons.has("vessel-notes"));
  processes.splice(2, 1);
  buttons.clear();
  render();
  assert.ok(
    !buttons.has("vessel-unknown"),
    "A successful Core snapshot omits a vanished program",
  );
  const states = ["idle", "done", "working", "blocked"];
  const reports = {};
  for (const state of states) {
    const id = `agent-${state}`;
    contents.push({ id, typeId: "terminal", backend: id });
    layout.home.fleets[0].placements.push({ id, vessel: id, name: id });
    processes.push({
      vesselId: id,
      terminalId: id,
      state: "live",
      foreground: "codex",
      agentName: `Session ${state}`,
    });
    reports[id] = { state, reported: true, limited: false };
  }
  buttons.clear();
  render(reports);
  assert.deepEqual(
    [...buttons.keys()].filter((id) => id.startsWith("vessel-agent-")),
    [
      "vessel-agent-blocked",
      "vessel-agent-working",
      "vessel-agent-done",
      "vessel-agent-idle",
    ],
  );
  contents.push({ id: "overview", typeId: "agents" });
  layout.home.fleets[0].placements.push({
    id: "overview",
    vessel: "overview",
    name: "Activity",
  });
  layout.home.fleets[0].root = { kind: "leaf", placement: "overview" };
  buttons.clear();
  render();
  assert.ok(
    buttons.has("vessel-overview"),
    "Home keeps its own Activity placement listed",
  );
});

test("Activity refresh and hidden choices share an in-flight process snapshot", async () => {
  let reads = 0,
    finish;
  const Canvas = new Function(
    "View",
    "inspectProcesses",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {}, () => {
    reads++;
    return new Promise((done) => {
      finish = done;
    });
  });
  const view = Object.assign(new Canvas(), {
    version: "7",
    layout: { voyages: [], vessels: [] },
  });
  const pending = view.readProcesses({ notify() {} });
  const choices = view.hiddenChoices(
    {
      kind: "placement",
      owner: { kind: "fleet", id: "f" },
      insertion: { kind: "empty" },
    },
    "7",
  );
  const observed = reads;
  finish([]);
  assert.equal(
    observed,
    1,
    "The picker reuses the active Activity observation",
  );
  await pending;
  assert.deepEqual(await choices, { panels: [], error: undefined });
});

test("a new activity revision reads processes again only while an Agents Vessel is shown", async () => {
  let reads = 0;
  const finishes = [];
  const Canvas = new Function(
    "View",
    "inspectProcesses",
    "reported_activity",
    "validateReportedActivity",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(
    class {},
    () => {
      reads++;
      return new Promise((done) => finishes.push(done));
    },
    () => JSON.stringify({ terminals: {}, limited: false }),
    () => true,
  );
  const fleet = (vessel) => ({
    id: "fleet",
    placements: [{ id: "placement", vessel }],
    root: { kind: "leaf", placement: "placement" },
  });
  const layout = (vessel, typeId) => ({
    view: "fleet",
    selectedVoyage: "voyage",
    selectedFleet: "fleet",
    voyages: [{ id: "voyage", fleets: [fleet(vessel)], portals: [] }],
    vessels: [{ id: vessel, typeId }],
  });
  const view = Object.assign(new Canvas(), {
    version: "7",
    activityRevision: "",
    layout: layout("shell", "terminal"),
  });
  const tasks = [];
  const quiet = [];
  const task = { notify() {}, sleep: async (ms) => quiet.push(ms) };
  const cx = { spawn: (run) => tasks.push(run(task)) };
  view.readActivity("1", cx);
  assert.equal(reads, 0, "No Agents Vessel is shown");
  view.layout = layout("overview", "agents");
  view.readActivity("1", cx);
  assert.equal(reads, 0, "The revision did not change");
  view.readActivity("2", cx);
  view.readActivity("3", cx);
  assert.equal(reads, 1, "A read in flight is not doubled");
  const settled = () => new Promise((done) => setImmediate(done));
  finishes[0]([]);
  await settled();
  assert.equal(reads, 2, "A change during a read is read once more");
  assert.deepEqual(quiet, [250], "The second read waits a quiet time");
  finishes[1]([]);
  await Promise.all(tasks);
  view.readActivity("4", cx);
  assert.equal(reads, 3);
  finishes[2]([]);
  await Promise.all(tasks);
});

function chatClass() {
  const source = workspaceSource(
    "VOYAGER_CHAT_SOURCE",
    "return class",
    "chat.js",
  );
  const Chat = new Function(
    "div",
    "Button",
    "Composer",
    "MeasureHeight",
    "svg",
    "FollowScroll",
    "Marker",
    "ComposerMarker",
    source,
  )(
    element,
    { new: element },
    { new: element },
    { new: element },
    element,
    { new: element },
    MarkerStub,
    { new: (state) => ({ marker: ["chat-composer", "", state] }) },
  );
  return Chat;
}

test("chat fits measured messages before scrolling at its cap", () => {
  const Chat = chatClass();
  const chat = Object.assign(Object.create(Chat.prototype), {
    open: true,
    present: true,
    heights: { sidebar: 900, heading: 200, navigation: 100, messages: 0 },
    state: null,
    error: "",
    input: {},
  });
  const height = () =>
    chat
      .render({ muted: "muted", foreground: "fg" }, { kind: "workspace" })
      .calls.find(([name]) => name === "h")[1];
  const empty = height();
  assert.ok(empty >= 32 && empty <= 80, "Empty chat should fit its composer");
  chat.heights.messages = 120;
  const short = height();
  assert.ok(short > empty, "Chat should grow with measured content");
  chat.heights.messages = 1000;
  const capped = height();
  assert.ok(capped >= short && capped <= 320, "Long chat must stop growing");
  chat.heights.messages = 2000;
  assert.equal(height(), capped);
  chat.open = false;
  assert.equal(height(), 0);
});

test("chat marks its toggle, messages, composer, send control, status and error by what they draw", () => {
  const Chat = chatClass();
  const input = {};
  const chat = Object.assign(Object.create(Chat.prototype), {
    open: true,
    present: true,
    heights: { sidebar: 900, heading: 200, navigation: 100, messages: 120 },
    error: "",
    input,
    state: {
      version: "3",
      phase: "working",
      limited: false,
      omitted: "0",
      error: null,
      messages: [
        { id: "m1", role: "user", text: "Open the notes" },
        { id: "m2", role: "assistant", text: "Done" },
      ],
    },
  });
  const colors = { muted: "muted", foreground: "fg", accent: "accent" };
  assert.deepEqual(deepMarkers(chat.toggleView(colors)), [["chat-toggle", ""]]);
  chat.error = "Request refused";
  assert.deepEqual(deepMarkers(chat.render(colors, { kind: "workspace" })), [
    ["chat-message", "m1", "Open the notes"],
    ["chat-message", "m2", "Done"],
    ["chat-status", "", "Thinking…"],
    ["chat-error", "", "Request refused"],
    ["chat-messages", ""],
    ["chat-composer", "", input],
    ["chat-send", "", "Interrupt"],
  ]);
  chat.error = "";
  chat.state.phase = "idle";
  assert.deepEqual(deepMarkers(chat.render(colors, { kind: "workspace" })), [
    ["chat-message", "m1", "Open the notes"],
    ["chat-message", "m2", "Done"],
    ["chat-messages", ""],
    ["chat-composer", "", input],
    ["chat-send", "", "Send"],
  ]);
  chat.present = false;
  assert.deepEqual(deepMarkers(chat.render(colors, { kind: "workspace" })), []);
});

test("dock snapshots retain only identity-matched display labels", async () => {
  let dialog = false;
  const Canvas = new Function(
    "View",
    "workspace_observation",
    "window",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(
    class {},
    async () => {
      throw Error("Unavailable");
    },
    { has_active_dialog: () => dialog },
  );
  const placement = {
    id: "panel",
    vessel: "content",
    name: "Original",
    nameOrigin: "automatic",
  };
  const layout = {
    view: "fleet",
    selectedVoyage: "voyage",
    selectedFleet: "fleet",
    vessels: [
      { id: "content", typeId: "terminal", backend: "t1", cwd: "/work" },
    ],
    voyages: [
      {
        id: "voyage",
        portals: [],
        fleets: [
          {
            id: "fleet",
            placements: [placement],
            root: { kind: "leaf", placement: "panel" },
          },
        ],
      },
    ],
    context: { kind: "workspace" },
  };
  const panel = {
    placementId: "panel",
    vesselId: "content",
    backend: "t1",
    program: "bash",
    directory: { kind: "live", path: "/work" },
    effectiveName: "work",
  };
  layout.voyages[0].cwd = "/work";
  layout.voyages.push({
    id: "other-repo",
    cwd: "/other",
    fleets: [],
    portals: [],
  });
  const inspected = [];
  const view = Object.assign(new Canvas(), {
    version: "1",
    layout,
    names: new Map(),
    worktrees: { available: () => true, inspect: (id) => inspected.push(id) },
    observedPanels: [panel],
    observation: { panels: [panel] },
    observationRead: 0,
  });
  const cx = {
    spawn() {},
    notify() {},
    focus_handle() {
      return {};
    },
  };
  view.acceptSnapshot(
    { version: "2", layout, fresh: true, status: "applied" },
    cx,
  );
  assert.equal(
    view.focused,
    "panel",
    "The first layout focuses the first shown placement",
  );
  assert.deepEqual(
    inspected,
    ["voyage", "other-repo"],
    "Grouping observes every open Voyage without visiting it",
  );
  assert.equal(view.observation, null, "Effects require a fresh observation");
  assert.equal(view.panelLabel(placement), "bash · work");
  placement.nameOrigin = "deliberate";
  placement.name = "My shell";
  assert.equal(view.contentName(placement), "My shell");
  await view.readObservation(cx);
  assert.deepEqual(
    view.observedPanels,
    [],
    "Failed reads clear retained display facts",
  );
  view.observedPanels = [panel];
  layout.vessels[0].backend = "replacement";
  view.acceptSnapshot(
    { version: "3", layout, fresh: true, status: "applied" },
    cx,
  );
  assert.deepEqual(
    view.observedPanels,
    [],
    "Rebound programs cannot reuse display facts",
  );
  let restored = 0;
  view.focus = {
    focus() {
      restored += 1;
    },
  };
  layout.voyages[0].fleets[0].root = null;
  view.chat = { open: true };
  view.acceptSnapshot({ version: "4", layout, fresh: true }, cx);
  assert.equal(
    restored,
    0,
    "Removing a panel must not take the keyboard from Chat",
  );
  view.chat.open = false;
  dialog = true;
  view.acceptSnapshot({ version: "4", layout, fresh: true }, cx);
  assert.equal(
    restored,
    0,
    "Removing a panel must not take the keyboard from a dialog",
  );
  dialog = false;
  view.acceptSnapshot({ version: "4", layout, fresh: true }, cx);
  assert.equal(
    restored,
    1,
    "Removing the focused panel restores workspace shortcuts",
  );
  assert.equal(view.focused, null);
  view.layout.voyages = Array.from({ length: 12 }, (_, index) => ({
    id: `closed-${index}`,
    name: `Voyage ${index}`,
    closed: true,
    closedOrder: String(index + 1),
  }));
  assert.equal(view.closedVoyageItems().length, 10);
  assert.equal(view.closedVoyageItems()[0].label, "Reopen Voyage 11");
  assert.equal(
    view.layout.voyages.length,
    12,
    "The display cap must not delete retained Voyages",
  );
});

test("late active-directory observations cannot replace newer facts", async () => {
  const { workspaceObservation: validateObservation } =
    await import("../contract/generated/validate.js");
  const responses = [];
  const Canvas = new Function(
    "View",
    "workspace_observation",
    "validateObservation",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(
    class {},
    () => new Promise((resolve) => responses.push(resolve)),
    validateObservation,
  );
  const view = Object.assign(new Canvas(), {
    version: "1",
    observationRead: 0,
    observation: null,
    layout: {
      view: "fleet",
      selectedVoyage: "voyage",
      selectedFleet: "fleet",
      vessels: [{ id: "content", backend: "t1" }],
      voyages: [
        {
          id: "voyage",
          fleets: [
            {
              id: "fleet",
              placements: [{ id: "panel", vessel: "content" }],
              root: { kind: "leaf", placement: "panel" },
            },
          ],
        },
      ],
    },
  });
  const snapshot = (path, branch) => ({
    version: "1",
    active: "panel",
    directory: { kind: "live", path },
    panels: [
      {
        placementId: "panel",
        vesselId: "content",
        backend: "t1",
        directory: { kind: "live", path },
        program: "bash",
        conversationName: null,
        effectiveName: "work",
      },
    ],
    branch: { kind: "named", name: branch },
  });
  let notifications = 0;
  const pending = [];
  const actions = [];
  view.run = (action) => actions.push(action);
  const cx = {
    notify() {
      notifications += 1;
    },
    spawn(callback) {
      pending.push(callback(cx));
    },
  };
  view.createVoyage(cx);
  const first = pending[0];
  const second = view.readObservation(cx);
  responses[1](JSON.stringify(snapshot("/work", "new")));
  await second;
  responses[0](JSON.stringify(snapshot("/work", "old")));
  await first;
  assert.equal(
    actions.length,
    1,
    "A later poll must not cancel valid creation",
  );
  assert.equal(actions[0].operation, "create-voyage-from-source");
  assert.equal(actions[0].source.cwd, "/work");
  assert.equal(view.observation.directory.path, "/work");
  assert.equal(view.observation.branch.name, "new");
  assert.equal(notifications, 1);
});

test("worktree controller groups identified checkouts and preserves request identity", async () => {
  let inFlight = 0;
  let peak = 0;
  const validators = await import("../contract/generated/validate.js");
  const buttons = new Map(),
    pending = [],
    requests = [],
    exports = {};
  let sequence = 0,
    mismatched = false;
  const checkouts = [
    ["/repo", "/repo/.git", true],
    ["/repo/.worktree/topic", "/repo/.git", false],
    ["/other", "/other/.git", false],
  ].map(([path, commonDir, main]) => ({
    path,
    commonDir,
    main,
    locked: false,
    prunable: false,
  }));
  const button = (id) => {
    const node = element();
    buttons.set(id, node);
    return node;
  };
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/canvas/worktrees.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("exports", "require", "window", source)(
    exports,
    (name) => {
      if (name === "gpui-kit") return { div: element };
      if (name === "gpui-base")
        return {
          Button: { new: button },
          VirtualListScrollHandle: {
            new: () => ({ release() {}, scroll_to_item() {} }),
          },
          v_virtual_list: (_id, count, _size, _key, render) =>
            element().children(render({ start: 0, end: count })),
        };
      if (name === "./menu.js")
        return { menuSurface: element, menuButton: button };
      if (name === "./ui.js") return uiModule(element, { new: button });
      if (name === "./validate.js") return validators;
      if (name === "voyager_workspace")
        return {
          request_id: () => `worktree-${++sequence}`,
          worktree: async (raw) => {
            peak = Math.max(peak, ++inFlight);
            await Promise.resolve();
            inFlight--;
            const request = JSON.parse(raw);
            requests.push(request);
            const response = {
              status: "applied",
              requestId: mismatched ? "wrong-request" : request.requestId,
              checkouts:
                request.action.operation === "create"
                  ? [
                      {
                        ...checkouts[1],
                        path: "/repo/.worktree/new",
                        branch: "new",
                      },
                    ]
                  : checkouts,
            };
            return JSON.stringify(response);
          },
        };
      if (name === "voyager_native")
        return {
          Marker: MarkerStub,
          Name: { new: element },
          NameState: {
            new: () => ({ value: () => "", on() {}, focus() {}, release() {} }),
          },
        };
      return {};
    },
    { open_dialog() {}, close_dialog() {}, refresh() {} },
  );
  const cx = {
    spawn: (callback) => pending.push(callback(cx)),
    notify() {},
  };
  const settle = () => Promise.all(pending.splice(0));
  const controls = new exports.WorktreeControls();
  controls.inspect("main", "/repo/src", "7", cx);
  await settle();
  assert.deepEqual(
    controls.groups([
      { id: "main", cwd: "/repo/src" },
      { id: "topic", cwd: "/repo/.worktree/topic/lib/" },
      { id: "lookalike", cwd: "/repo/.worktree/topic-other" },
      { id: "other", cwd: "/other/docs" },
    ]),
    { roots: ["main", "lookalike", "other"], children: { main: ["topic"] } },
  );
  let workspaceVersion = "7";
  controls.open("main", workspaceVersion, cx);
  await settle();
  workspaceVersion = "9";
  mismatched = true;
  const click = () =>
    buttons
      .get("worktree-open-/repo/.worktree/topic")
      .calls.find(([name]) => name === "on_click")[1]({}, cx);
  controls.render();
  click();
  await settle();
  assert.equal(requests.at(-1).expectedVersion, "7");
  assert.notEqual(requests.at(-1).expectedVersion, workspaceVersion);
  assert.deepEqual(requests.at(-1).action, {
    operation: "open",
    path: "/repo/.worktree/topic",
  });
  assert.notEqual(
    controls.current,
    null,
    "A mismatched receipt cannot complete the action",
  );
  assert.match(controls.status, /unconfirmed/);
  mismatched = false;
  controls.inspect("sibling", "/repo/.worktree/topic", "7", cx);
  await settle();
  assert.equal(controls.available("/repo/.worktree/new"), false);
  controls.open("main", "7", cx, "new", "/repo");
  await settle();
  controls.current.input.value = () => "new";
  assert.deepEqual(deepMarkers(controls.render()), [
    ["worktree-cancel", "main"],
    ["worktree-confirm", "main"],
  ]);
  buttons
    .get("worktree-create-submit")
    .calls.find(([name]) => name === "on_click")[1]({}, cx);
  await settle();
  assert.equal(
    controls.current,
    null,
    "An applied action closes its dialog without starting workspace work there",
  );
  assert.equal(
    controls.available("/repo/.worktree/new"),
    true,
    "Creation updates sibling repository observations before Recent uses them",
  );
  peak = 0;
  for (let index = 0; index < 16; index++)
    controls.inspect(`burst-${index}`, "/repo", "7", cx);
  controls.inspect("burst-15", "/repo", "9", cx);
  await settle();
  assert.equal(
    requests.findLast((item) => item.voyage === "burst-15").expectedVersion,
    "9",
  );
  assert.equal(
    peak,
    1,
    "Background discovery does not fill the owner queue with a Voyage burst",
  );
});

test("Notes keeps file actions together and preview leaves its draft unchanged", () => {
  const buttons = new Map();
  const calls = [];
  const session = {
    filename: () => "Existing.md",
    filenames: () => ["Existing.md"],
    status: () => "",
    new_note: () => calls.push("new"),
    list_notes: () => calls.push("list"),
    open_note: (name) => calls.push(name),
  };
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/../content/notes/main.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("exports", "require", source)(exports, (name) => {
    if (name === "./ui.js")
      return uiModule(element, {
        new: (id) => {
          const node = element();
          buttons.set(id, node);
          return node;
        },
      });
    if (name === "gpui-kit") return { View: class {}, div: element };
    if (name === "gpui-base")
      return {
        Button: {
          new: (id) => {
            const node = element();
            buttons.set(id, node);
            return node;
          },
        },
        Popover: { new: element },
        Switch: {
          new: (id) => {
            const node = element();
            buttons.set(id, node);
            return node;
          },
        },
        TextView: { markdown: element },
      };
    if (name === "voyager_vessel")
      return {
        theme: () => ({
          foreground: "#ffffff",
          muted: "#999999",
          background: "#000000",
        }),
      };
    return {
      SessionState: { new: () => session },
      RetainedTitleState: { new: () => ({}) },
      RetainedBodyState: { new: () => ({ value: () => "Unchanged draft" }) },
      RetainedTitle: { new: element },
      RetainedBody: { new: element },
    };
  });
  const note = new exports.default();
  note.init();
  note.render();
  const preview = buttons.get("notes-preview");
  assert.ok(
    ["w", "h"].every((method) =>
      preview.calls.some(([name, value]) => name === method && value > 0),
    ) && preview.calls.some(([name]) => name === "child"),
    "The unstyled native switch needs a visible track and thumb",
  );
  const click = (id) =>
    buttons
      .get(id)
      .calls.find(([name]) => name === "on_click")[1]({}, { notify() {} });
  click("notes-open");
  note.render();
  click("notes-file-Existing.md");
  assert.deepEqual(calls, ["list", "Existing.md"]);
  buttons
    .get("notes-preview")
    .calls.find(([name]) => name === "on_change")[1](true, { notify() {} });
  assert.equal(note.preview, true);
  assert.equal(note.text.value(), "Unchanged draft");
  click("notes-new");
  assert.equal(note.preview, false);
  assert.equal(calls.at(-1), "new");
});

function statusModule() {
  const exports = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(
      fs.readFileSync(`${__dirname}/canvas/status.ts`, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )(exports, (name) => {
    if (name === "gpui-kit") return { div: element };
    if (name === "voyager_native")
      return { Marker: MarkerStub, Status: { new: element } };
    if (name === "voyager_workspace")
      return { take_placement_notice: () => null };
    throw Error(name);
  });
  return exports;
}

function voyageClose(confirm, inspect) {
  const buttons = new Map();
  const Button = {
    new(id) {
      const node = element();
      buttons.set(id, node);
      return node;
    },
  };
  const exports = {};
  const closed = { count: 0 };
  const calls = [];
  const plan = {
    id: "plan",
    voyage: "voyage",
    name: "Demo",
    version: "7",
    phase: "ready",
    entries: [{ vessel: "content-1", typeId: "terminal", name: "bash" }],
    message: "Confirm",
    uncommittedChanges: 2,
  };
  new Function(
    "exports",
    "require",
    "window",
    ts.transpileModule(
      fs.readFileSync(`${__dirname}/canvas/voyage-close.ts`, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )(
    exports,
    (name) => {
      if (name === "gpui-kit") return { div: element };
      if (name === "voyager_native") return { Marker: MarkerStub };
      if (name === "./ui.js") return uiModule(element, Button);
      if (name === "./status.js") return statusModule();
      if (name === "./workspace.js")
        return {
          invoke: async (action, version) => {
            calls.push({ action, version });
            if (action.operation === "confirm-voyage-close") return confirm();
            if (action.operation === "inspect" && inspect) return inspect();
            return {
              status: "applied",
              fresh: true,
              closePlan: action.operation === "inspect" ? plan : null,
            };
          },
        };
      throw Error(name);
    },
    {
      open_dialog() {},
      refresh() {},
      close_dialog() {
        closed.count++;
      },
    },
  );
  const controls = new exports.VoyageClose();
  const tasks = [];
  const cx = {
    spawn(callback) {
      tasks.push(callback(cx));
    },
    notify() {},
  };
  const click = (id) => {
    controls.render();
    buttons
      .get(id)
      .calls.find(([name]) => name === "on_click")[1](null, cx);
  };
  const settle = () => Promise.all(tasks.splice(0));
  const confirmations = () =>
    calls.filter(({ action }) => action.operation === "confirm-voyage-close")
      .length;
  controls.observe(plan);
  return { controls, click, settle, calls, confirmations, closed, plan };
}

test("Voyage confirmation inspects an invocation error without repeating shutdown", async () => {
  const { controls, click, settle, calls, confirmations, closed } = voyageClose(
    () => {
      throw Error("Queue unavailable");
    },
  );
  assert.deepEqual(deepMarkers(controls.render()), [
    ["voyage-close-entry", "content-1"],
    ["voyage-close-status", "voyage", "Confirm"],
    ["voyage-close-cancel", "voyage"],
    ["voyage-close-confirm", "voyage"],
  ]);
  assert.match(
    JSON.stringify(controls.render().calls),
    /2 uncommitted changes/,
  );
  click("voyage-close-confirm");
  click("voyage-close-confirm");
  await settle();
  assert.equal(calls.length, 1);
  click("voyage-close-inspect");
  await settle();
  assert.equal(calls.at(-1).action.operation, "inspect");
  assert.equal(calls.at(-1).version, "0");
  click("voyage-close-cancel");
  await settle();
  assert.equal(calls.at(-1).action.operation, "cancel-voyage-close");
  assert.equal(confirmations(), 1);
  assert.equal(closed.count, 1);
});

test("a refused Voyage confirmation says why and stays ready to confirm", async () => {
  const { controls, click, settle, confirmations } = voyageClose(() => ({
    requestId: "request",
    status: "refused",
    message: "Workspace busy or unavailable; nothing was queued",
  }));
  click("voyage-close-confirm");
  await settle();
  assert.deepEqual(deepMarkers(controls.render()), [
    ["voyage-close-entry", "content-1"],
    [
      "voyage-close-status",
      "voyage",
      "Refused. Workspace busy or unavailable; nothing was queued",
    ],
    ["voyage-close-cancel", "voyage"],
    ["voyage-close-confirm", "voyage"],
  ]);
  click("voyage-close-confirm");
  await settle();
  assert.equal(
    confirmations(),
    2,
    "A refused confirmation could not be sent again",
  );
});

test("a refused Voyage close keeps its word while the same plan is observed again", async () => {
  const unfinished = {
    id: "plan",
    voyage: "voyage",
    name: "Demo",
    version: "7",
    phase: "incomplete",
    entries: [{ vessel: "content-1", typeId: "terminal", name: "bash" }],
    message: "Voyage remains open. Inspect before another close: busy: Core",
  };
  const { controls, click, settle } = voyageClose(() => ({
    requestId: "request",
    status: "refused",
    version: "7",
    fresh: true,
    layout: {},
    message: unfinished.message,
    closePlan: unfinished,
  }));
  click("voyage-close-confirm");
  await settle();
  const drawn = () => JSON.stringify(controls.render().calls);
  assert.match(drawn(), /Refused\. Voyage remains open\./);
  controls.observe({ ...unfinished });
  assert.match(drawn(), /Refused\. Voyage remains open\./);
  controls.observe({ ...unfinished, message: "Shutdown is unconfirmed." });
  assert.doesNotMatch(drawn(), /Refused\./);
  assert.match(drawn(), /Shutdown is unconfirmed\./);
});

test("an uncertain Voyage confirmation the owner never answered offers Inspect and no second confirmation", async () => {
  const { controls, click, settle, calls, confirmations } = voyageClose(() => ({
    requestId: "request",
    status: "uncertain",
    message: "Workspace result unconfirmed; do not repeat the request",
  }));
  click("voyage-close-confirm");
  await settle();
  assert.deepEqual(deepMarkers(controls.render()), [
    ["voyage-close-entry", "content-1"],
    [
      "voyage-close-status",
      "voyage",
      "Uncertain. Workspace result unconfirmed; do not repeat the request. Inspect the Voyage before another request.",
    ],
    ["voyage-close-cancel", "voyage"],
  ]);
  click("voyage-close-inspect");
  await settle();
  assert.equal(calls.at(-1).action.operation, "inspect");
  assert.equal(confirmations(), 1, "An uncertain confirmation was sent again");
  assert.deepEqual(
    deepMarkers(controls.render()),
    [
      ["voyage-close-entry", "content-1"],
      ["voyage-close-status", "voyage", "Confirm"],
      ["voyage-close-cancel", "voyage"],
      ["voyage-close-confirm", "voyage"],
    ],
    "A fresh Inspect of a ready plan left the uncertain result beside Close Voyage",
  );
});

test("a Voyage close inspection that is refused or uncertain says which", async () => {
  for (const [reply, shown] of [
    [
      {
        requestId: "request",
        status: "refused",
        message: "Workspace busy or unavailable; nothing was queued",
      },
      "Refused. Workspace busy or unavailable; nothing was queued",
    ],
    [
      {
        requestId: "request",
        status: "uncertain",
        version: "7",
        fresh: false,
        layout: {},
        message: "Core result unconfirmed; no request was repeated",
      },
      "Uncertain. Core result unconfirmed; no request was repeated",
    ],
  ]) {
    const { controls, click, settle } = voyageClose(
      () => {
        throw Error("Queue unavailable");
      },
      () => reply,
    );
    click("voyage-close-confirm");
    await settle();
    click("voyage-close-inspect");
    await settle();
    assert.deepEqual(deepMarkers(controls.render()), [
      ["voyage-close-entry", "content-1"],
      ["voyage-close-status", "voyage", shown],
      ["voyage-close-cancel", "voyage"],
    ]);
  }
});
