const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");
const workspaceSource = require("./workspace-fixture.cjs");

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
  )(exports, (name) =>
    name === "gpui-kit"
      ? { div: element }
      : { Button, Popover: { new: element } },
  );
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
  let resolve;
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
        descriptions: () => Promise.reject(Error("Notes metadata unavailable")),
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
  const root = picker.render("original", destination, "7", create);
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
  await pending[0];
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
  const cancel = picker.render(
    "portal",
    destination,
    "99",
    create,
    element(),
    undefined,
    false,
  );
  cancel.calls.find(([name]) => name === "on_open_change")[1](false, cx);
  assert.equal(picker.current, null);
  assert.equal(actions.length, 1);
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
  for (const mode of ["overlay", "make-room"]) {
    const regions = new Map();
    const voyage = {
      id: "voyage",
      portalLayout: { mode, width: 340, visible: true },
    };
    const rendered = exports.composeCanvas(
      { ...canvas, sidebarCollapsed: true },
      (name) => {
        const node = element();
        regions.set(name, node);
        return node;
      },
      (underlay, panels) => view.portalColumn(underlay, panels, voyage),
    );
    assert.equal(regions.size, 5);
    assert.ok(
      regions
        .get("sidebar")
        .calls.some(([name, value]) => name === "w" && value === 48),
    );
    assert.ok(
      regions
        .get("fleet-strip")
        .calls.some(([name, value]) => name === "h" && value === 40),
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
    assert.ok(rendered.calls.some(([name]) => name === "children"));
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
  assert.equal(pending.length, 2);
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

test("Agents joins live identities, excludes Bash and navigates the renamed placement", async () => {
  const { activityBadge } = await import("./mods/header/activity.js");
  const buttons = new Map();
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
    if (name === "gpui-kit") return { div: element };
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
    return { activityBadge };
  });
  const contents = [
    {
      id: "agent",
      typeId: "terminal",
      backend: "agent-terminal",
      launch: { kind: "codex" },
    },
    { id: "shell", typeId: "terminal", backend: "shell-terminal" },
  ];
  const layout = {
    contents,
    voyages: [
      {
        id: "voyage",
        name: "Voyage",
        portals: [],
        fleets: [
          {
            name: "Fleet 1",
            vessels: [
              { id: "same-placement", content: "agent", name: "Renamed agent" },
              { id: "bash", content: "shell", name: "Bash" },
            ],
          },
        ],
      },
    ],
  };
  const agent = {
    contentId: "agent",
    terminalId: "agent-terminal",
    state: "live",
    foreground: "codex",
    pid: 42,
  };
  const shell = {
    contentId: "shell",
    terminalId: "shell-terminal",
    state: "live",
    foreground: "bash",
    pid: 43,
  };
  const navigated = [];
  const render = (processes, error) =>
    exports.agentsView(
      layout,
      processes,
      {},
      (...args) => navigated.push(args),
      error,
    );
  render([agent, shell]);
  assert.deepEqual([...buttons.keys()], ["agent-same-placement"]);
  const row = buttons.get("agent-same-placement");
  assert.match(
    row.calls.find(([name]) => name === "accessibility_label")[1],
    /Renamed agent, Codex, No reported status/,
  );
  const cx = {};
  row.calls.find(([name]) => name === "on_click")[1]({}, cx);
  assert.deepEqual(navigated, [["same-placement", cx]]);
  for (const observed of [
    { ...agent, terminalId: "wrong" },
    { ...agent, state: "finished" },
  ]) {
    buttons.clear();
    render([observed, shell]);
    assert.equal(buttons.size, 0);
  }
  const unavailable = render([], "Core observation failed");
  const children = unavailable.calls.find(([name]) => name === "children")[1];
  assert.equal(
    children[0].calls.find(([name]) => name === "accessibility_label")[1],
    "Agent status unavailable",
  );
});
