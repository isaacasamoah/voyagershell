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

function menuModule(Button) {
  const exports = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(
      fs.readFileSync(
        process.env.VOYAGER_MENU_SOURCE || `${__dirname}/mods/header/menu.ts`,
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
    return name === "gpui-kit"
      ? { div: element }
      : { Button, Popover: { new: element } };
  });
  return exports;
}

test("maximization renders the selected leaf while retaining preparation of the whole tree", () => {
  const Workspace = new Function(
    "View",
    "div",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {}, element);
  const fleet = {
    id: "fleet",
    maximizedPlacement: "second",
    vessels: [{ id: "first" }, { id: "second" }],
    root: {
      kind: "branch",
      first: { kind: "leaf", placement: "first" },
      second: { kind: "leaf", placement: "second" },
    },
  };
  const rendered = [];
  const view = Object.assign(new Workspace(), {
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
      process.env.VOYAGER_CREATION_SOURCE ||
        `${__dirname}/mods/header/creation.ts`,
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
    kind: "panel",
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
    [["child", "Codex"]],
  );
  const choose = buttons
    .get("create-worker-codex")
    .calls.find(([name]) => name === "on_click")[1];
  choose({}, cx);
  choose({}, cx);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], [
    { operation: "create-content", typeId: "terminal", destination, launch },
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
});

test("the actual canvas composes a retained right column through native presentation", () => {
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/mods/header/canvas.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("exports", "require", source)(exports, () => ({ div: element }));
  const columnCalls = [];
  const Workspace = new Function(
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
  const view = Object.assign(new Workspace(), {
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
    const rendered = exports.composeCanvas(
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
  const Workspace = new Function(
    "View",
    "context_facts",
    "validateFacts",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {}, async () => result, validateFacts);
  const view = Object.assign(new Workspace(), {
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

test("Chat stays below the primary dock before Home and Voyages, using one retained instance", () => {
  const buttons = new Map();
  const Workspace = new Function(
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
  const view = Object.assign(new Workspace(), {
    sidebar: true,
    chat,
    target: (_id, _scope, child) => child,
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

test("the real layout editor keeps its captured revision, refuses invalid input and gates uncertainty", async () => {
  const { canvas: validateCanvas } =
    await import("../contract/generated/validate.js");
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/mods/header/layout-panel.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const buttons = new Map();
  let value = "";
  const exports = {};
  new Function("exports", "require", source)(exports, (name) =>
    name === "gpui-kit"
      ? { div: element }
      : name === "gpui-base"
        ? {
            Button: {
              new(id) {
                const button = element();
                buttons.set(id, button);
                return button;
              },
            },
            Textarea: { new: element },
            TextareaState: {
              new(input) {
                value = input.value;
                return {
                  value: () => value,
                  set_value(next) {
                    value = next;
                  },
                };
              },
            },
          }
        : name === "voyager_native"
          ? {
              Occluding: {
                new() {
                  const node = element();
                  node.calls.push(["occluding"]);
                  return node;
                },
              },
            }
          : { canvas: validateCanvas },
  );
  const canvas = JSON.parse(
    fs.readFileSync(`${__dirname}/../contract/generated/response.schema.json`),
  ).definitions.Layout.properties.canvas.default;
  const panel = new exports.LayoutPanel(canvas, "7");
  let sent = 0;
  let closed = 0;
  let busy = false;
  const rendered = panel.render(
    () => busy,
    (_cx, done) =>
      done({
        status: "applied",
        fresh: true,
        version: "9",
        layout: { canvas },
      }),
    (_canvas, version, _cx, done) => {
      sent += 1;
      assert.equal(version, "7");
      done({ status: "uncertain", message: "Lost confirmation" });
    },
    () => {
      closed += 1;
    },
  );
  assert.ok(rendered.calls.some(([name]) => name === "occluding"));
  const click = buttons
    .get("apply-workspace-layout")
    .calls.find(([name]) => name === "on_click")[1];
  const cx = { notify() {} };
  value = "{}";
  click(null, cx);
  assert.equal(sent, 0);
  value = JSON.stringify(canvas);
  busy = true;
  click(null, cx);
  assert.equal(sent, 0);
  assert.equal(panel.pending, false);
  busy = false;
  click(null, cx);
  click(null, cx);
  assert.equal(sent, 1);
  assert.equal(closed, 0);
  assert.equal(panel.pending, false);
  assert.equal(panel.error, "Lost confirmation");
  assert.equal(value, JSON.stringify(canvas));
  const reload = buttons
    .get("reload-workspace-layout")
    .calls.find(([name]) => name === "on_click")[1];
  reload(null, cx);
  assert.equal(panel.version, "9");
  assert.equal(panel.unconfirmed, false);
  assert.deepEqual(JSON.parse(value), canvas);
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
  const Workspace = new Function(
    "View",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {});
  const view = Object.assign(new Workspace(), {
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
      fs.readFileSync(`${__dirname}/mods/header/panels.ts`, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )(exports);
  const panel = (id, content) => ({ id, content, name: id, hidden: false });
  const first = {
    id: "first",
    vessels: [
      panel("visible", "shown"),
      panel("notes", "note"),
      panel("shell", "live"),
      panel("ended", "dead"),
    ],
    root: { kind: "leaf", placement: "visible" },
  };
  const second = {
    id: "second",
    vessels: [panel("other", "other-note")],
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
            vessels: [panel("foreign", "foreign-note")],
            root: null,
          },
        ],
        portals: [],
      },
    ],
    contents: [
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
    kind: "panel",
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
      { contentId: "live", terminalId: "wrong", state: "live", pid: 42 },
    ]),
    ["notes", "other"],
  );
  assert.deepEqual(
    choices([
      { contentId: "live", terminalId: "live", state: "live", pid: 42 },
      { contentId: "dead", terminalId: "dead", state: "finished", pid: 43 },
    ]),
    ["notes", "shell", "other"],
  );
  first.maximizedPlacement = "visible";
  assert.deepEqual(choices([]), ["notes", "other"]);
});

test("Activity scopes live work, orders status rows and preserves navigation", async () => {
  const { activityBadge } = await import("./mods/header/activity.js");
  const buttons = new Map();
  const icons = [];
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/mods/header/agents.ts`, "utf8"),
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
    if (name === "voyager_header") return { projection: () => ({}) };
    if (name === "./process-icons.js")
      return {
        processIcon: (program) => {
          icons.push(program);
          return element();
        },
      };
    if (name === "./voyage-colours.js")
      return { voyageColour: () => "#59a5ff" };
    if (name === "./panels.js") {
      const panels = {};
      new Function(
        "exports",
        ts.transpileModule(
          fs.readFileSync(`${__dirname}/mods/header/panels.ts`, "utf8"),
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
    contents,
    home: {
      id: "home",
      name: "Home",
      fleets: [
        {
          id: "home-fleet",
          name: "Home",
          vessels: [{ id: "home-agent", content: "agent", name: "Renamed" }],
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
            vessels: [
              { id: "bash", content: "shell", name: "Shell" },
              { id: "unknown", content: "unknown", name: "Unknown" },
            ],
          },
        ],
        portals: [{ id: "notes", content: "notes", name: "Notes" }],
        portalLayout: { root: { kind: "leaf", placement: "notes" } },
      },
    ],
  };
  const processes = [
    {
      contentId: "agent",
      terminalId: "agent-terminal",
      state: "live",
      foreground: "codex",
      agentName: "folder",
    },
    {
      contentId: "shell",
      terminalId: "shell-terminal",
      state: "live",
      foreground: "bash",
    },
    {
      contentId: "unknown",
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
  assert.match(
    row.calls.find(([name]) => name === "accessibility_label")[1],
    /folder, Codex, Idle/,
  );
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
  layout.voyages[0].fleets[0].vessels[0].name = "Terminal 42";
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
    layout.home.fleets[0].vessels.push({ id, content: id, name: id });
    processes.push({
      contentId: id,
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
  layout.home.fleets[0].vessels.push({
    id: "overview",
    content: "overview",
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
  const Workspace = new Function(
    "View",
    "inspectProcesses",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {}, () => {
    reads++;
    return new Promise((done) => {
      finish = done;
    });
  });
  const view = Object.assign(new Workspace(), {
    version: "7",
    layout: { voyages: [], contents: [] },
  });
  const pending = view.readProcesses({ notify() {} });
  const choices = view.hiddenChoices(
    {
      kind: "panel",
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

test("chat fits measured messages before scrolling at its cap", () => {
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
    source,
  )(element, { new: element }, { new: element }, { new: element }, element, {
    new: element,
  });
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

test("dock snapshots retain only identity-matched display labels", async () => {
  let dialog = false;
  const Workspace = new Function(
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
    content: "content",
    name: "Original",
    nameOrigin: "automatic",
  };
  const layout = {
    view: "fleet",
    selectedVoyage: "voyage",
    selectedFleet: "fleet",
    contents: [
      { id: "content", typeId: "terminal", backend: "t1", cwd: "/work" },
    ],
    voyages: [
      {
        id: "voyage",
        portals: [],
        fleets: [
          {
            id: "fleet",
            vessels: [placement],
            root: { kind: "leaf", placement: "panel" },
          },
        ],
      },
    ],
    context: { kind: "workspace" },
  };
  const panel = {
    placementId: "panel",
    contentId: "content",
    backend: "t1",
    program: "bash",
    directory: { kind: "live", path: "/work" },
    effectiveName: "work",
    address: "Voyage/Fleet/work",
  };
  layout.voyages[0].cwd = "/work";
  layout.voyages.push({
    id: "other-repo",
    cwd: "/other",
    fleets: [],
    portals: [],
  });
  const inspected = [];
  const view = Object.assign(new Workspace(), {
    version: "1",
    layout,
    names: new Map(),
    worktrees: { available: () => true, inspect: (id) => inspected.push(id) },
    observedPanels: [panel],
    observation: { panels: [panel] },
    observationRead: 0,
    focused: "panel",
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
  layout.contents[0].backend = "replacement";
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
  const Workspace = new Function(
    "View",
    "workspace_observation",
    "validateObservation",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(
    class {},
    () => new Promise((resolve) => responses.push(resolve)),
    validateObservation,
  );
  const view = Object.assign(new Workspace(), {
    version: "1",
    focused: "panel",
    observationRead: 0,
    observation: null,
    layout: {
      view: "fleet",
      selectedVoyage: "voyage",
      selectedFleet: "fleet",
      contents: [{ id: "content", backend: "t1" }],
      voyages: [
        {
          id: "voyage",
          fleets: [
            {
              id: "fleet",
              vessels: [{ id: "panel", content: "content" }],
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
        contentId: "content",
        backend: "t1",
        directory: { kind: "live", path },
        program: "bash",
        conversationName: null,
        effectiveName: "work",
        address: "Voyage/Fleet/work",
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
    fs.readFileSync(`${__dirname}/mods/header/worktrees.ts`, "utf8"),
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
  controls.render();
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
    if (name === "voyager_content")
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

test("Voyage confirmation inspects an invocation error without repeating shutdown", async () => {
  const buttons = new Map();
  const Button = {
    new(id) {
      const node = element();
      buttons.set(id, node);
      return node;
    },
  };
  const exports = {};
  let closed = 0;
  const calls = [];
  const plan = {
    id: "plan",
    voyage: "voyage",
    name: "Demo",
    version: "7",
    phase: "ready",
    entries: [],
    message: "Confirm",
    uncommittedChanges: 2,
  };
  new Function(
    "exports",
    "require",
    "window",
    ts.transpileModule(
      fs.readFileSync(`${__dirname}/mods/header/voyage-close.ts`, "utf8"),
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
      if (name === "./ui.js") return uiModule(element, Button);
      if (name === "./workspace.js")
        return {
          invoke: async (action, version) => {
            calls.push({ action, version });
            if (action.operation === "confirm-voyage-close")
              throw Error("Queue unavailable");
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
        closed++;
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
  controls.observe(plan);
  assert.match(
    JSON.stringify(controls.render().calls),
    /2 uncommitted changes/,
  );
  click("voyage-close-confirm");
  click("voyage-close-confirm");
  await Promise.all(tasks.splice(0));
  assert.equal(calls.length, 1);
  click("voyage-close-inspect");
  await Promise.all(tasks.splice(0));
  assert.equal(calls.at(-1).action.operation, "inspect");
  assert.equal(calls.at(-1).version, "0");
  click("voyage-close-cancel");
  await Promise.all(tasks.splice(0));
  assert.equal(calls.at(-1).action.operation, "cancel-voyage-close");
  assert.equal(
    calls.filter(({ action }) => action.operation === "confirm-voyage-close")
      .length,
    1,
  );
  assert.equal(closed, 1);
});
