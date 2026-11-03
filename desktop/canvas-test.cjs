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
    kind: "vessel",
    fleet: "fleet",
    after: "original",
    axis: "horizontal",
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
  picker.render("original", { ...destination, after: "later" }, "99", create);
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

test("the actual canvas renderer uses saved order, sizing and Portal presentation", () => {
  const source = ts.transpileModule(
    fs.readFileSync(`${__dirname}/mods/header/canvas.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  new Function("exports", "require", source)(exports, () => ({ div: element }));
  const canvas = JSON.parse(
    fs.readFileSync(`${__dirname}/../contract/generated/response.schema.json`),
  ).definitions.Layout.properties.canvas.default;
  for (const mode of ["overlay", "make-room"]) {
    const regions = new Map();
    const result = exports.composeCanvas(
      { ...canvas, portalMode: mode },
      (region) => {
        const node = element();
        regions.set(region, node);
        return node;
      },
    );
    assert.equal(regions.size, 5);
    assert.ok(result.calls.some(([name]) => name === "flex"));
    const portal = regions.get("portals");
    assert.equal(
      portal.calls.some(([name]) => name === "absolute"),
      mode === "overlay",
    );
    assert.ok(
      portal.calls.some(([name, value]) => name === "w" && value === 340),
    );
  }
  for (const axis of ["row", "column"]) {
    for (const first of [true, false]) {
      const portal = {
        kind: "block",
        region: "portals",
        size: { kind: "fixed", pixels: 240 },
      };
      const flow = [
        { kind: "block", region: "fleet-strip" },
        { kind: "block", region: "active-fleet" },
      ];
      let actual;
      const rendered = exports.composeCanvas(
        {
          root: {
            kind: axis,
            children: first ? [portal, ...flow] : [...flow, portal],
          },
        },
        (region) => {
          const node = element();
          node.calls.push(["region", region]);
          if (region === "portals") actual = node;
          return node;
        },
      );
      const edge =
        axis === "row" ? (first ? "left" : "right") : first ? "top" : "bottom";
      assert.ok(
        actual.calls.some(([name, value]) => name === edge && value === 0),
      );
      assert.ok(
        actual.calls.some(
          ([name, value]) =>
            name === (axis === "row" ? "w" : "h") && value === 240,
        ),
      );
      const children = rendered.calls.find(([name]) => name === "children")[1];
      assert.equal(children.at(-1), actual);
      assert.equal(children.length, 3);
      for (const [index, block] of flow.entries()) {
        const flowCalls = children[index].calls;
        assert.ok(!flowCalls.some(([name]) => name === "absolute"));
        assert.equal(
          flowCalls.find(([name]) => name === "region")[1],
          block.region,
        );
      }
    }
  }
  const result = exports.composeCanvas(
    { ...canvas, sidebarCollapsed: true },
    () => element(),
  );
  const sidebar = result.calls.find(([name]) => name === "children")[1][0];
  assert.ok(
    sidebar.calls.some(([name, value]) => name === "w" && value === 48),
  );
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
  assert.equal(controls, 1);
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
