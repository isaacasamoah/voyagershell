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
  let resolve;
  const exports = {};
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
        Popover: { new: element },
      };
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
    layout: { context: { kind: "workspace" } },
    contextFacts: null,
  });
  const facts = {
    version: "2",
    scope: { kind: "workspace" },
    path: ["Workspace"],
    directory: { kind: "multiple" },
    branch: { kind: "unavailable" },
  };
  let notified = 0;
  const cx = {
    notify() {
      notified += 1;
    },
  };
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
  const sidebar = view.sidebarRegion(layout);
  const children = sidebar.calls
    .filter(([name]) => name === "child")
    .map(([, child]) => child);
  const controls = children.findIndex((node) =>
    node.calls.some(
      ([name, value]) =>
        name === "id" && value === "primary-conversation-controls",
    ),
  );
  const home = children.findIndex((node) =>
    node.calls.some(
      ([name, value]) =>
        name === "child" && value === buttons.get("home-navigation"),
    ),
  );
  assert.equal(controls, 2);
  assert.equal(children[controls + 1], panel);
  assert.ok(home > controls + 1);
  assert.ok(
    children[controls].calls.some(
      ([name, value]) => name === "child" && value === toggle,
    ),
  );
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
  const Menu = new Function(
    "div",
    "Button",
    "Popover",
    workspaceSource("VOYAGER_MENU_SOURCE", "return class", "menu.js"),
  )(
    element,
    {
      new(id) {
        const node = element();
        nodes.set(id, node);
        return node;
      },
    },
    { new: element },
  );
  const Workspace = new Function(
    "View",
    workspaceSource("VOYAGER_WORKSPACE_SOURCE", "return class"),
  )(class {});
  const view = Object.assign(new Workspace(), {
    menus: new Menu(),
    version: "7",
  });
  const actions = [];
  const cx = { notify() {} };
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
