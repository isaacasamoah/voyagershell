const assert = require("node:assert/strict");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const file = `${__dirname}/notes-legacy-fixture.js`;
const source = fs.readFileSync(file, "utf8");

test("the supported legacy client retains a draft and its original base during reads", async () => {
  const Notes = new Function(
    "View",
    source
      .slice(source.indexOf("export default class Notes"))
      .replace("export default", "return"),
  )(class {});
  for (const mode of ["clean", "dirty", "in-flight", "first-read"]) {
    let title = mode === "dirty" || mode === "first-read" ? "Draft" : "Old";
    let text = "Old body";
    let finish;
    const result = new Promise((resolve) => {
      finish = resolve;
    });
    const pending = [];
    const cx = {
      notify() {},
      spawn(body) {
        pending.push(body(cx));
      },
    };
    const note = Object.assign(Object.create(Notes.prototype), {
      generation: 1,
      dirty: mode === "dirty" || mode === "first-read",
      revision: mode === "first-read" ? null : "original",
      touched: {
        title: mode === "dirty" || mode === "first-read",
        text: false,
      },
      title: {
        value: () => title,
        set_value: (value) => {
          title = value;
        },
      },
      text: {
        value: () => text,
        set_value: (value) => {
          text = value;
        },
      },
      call: () => result,
    });
    note.read(cx);
    if (mode === "in-flight") {
      title = "Draft";
      note.changed("title", cx);
    }
    finish({
      status: "snapshot",
      snapshot: {
        revision: "outside",
        data: { title: "New", text: "New body" },
        warning: "Schema warning",
      },
    });
    await Promise.all(pending);
    const draft = mode !== "clean";
    assert.equal(title, draft ? "Draft" : "New", mode);
    assert.equal(
      note.revision,
      mode === "dirty" || mode === "in-flight" ? "original" : "outside",
      mode,
    );
    assert.equal(
      text,
      mode === "dirty" || mode === "in-flight" ? "Old body" : "New body",
      mode,
    );
    assert.ok(note.status.includes("Schema warning"));
  }
});

test("the supported legacy client distinguishes known refusal from lost confirmation", async () => {
  const { contentRequest: request, contentResponse: response } = await import(
    pathToFileURL(`${root}/contract/generated/validate.js`).href
  );

  async function exercise(code, outcome) {
    const calls = [];
    const rejected = outcome === "rejected";
    const data = { title: "Unchanged draft", text: "Original body" };
    const invoke = async (raw, requestId, expectedRevision) => {
      const input = JSON.parse(raw);
      assert.equal(requestId, input.requestId);
      assert.equal(expectedRevision, input.expectedRevision);
      calls.push(input);
      if (outcome === "lost") throw Error("Controlled confirmation loss");
      const result = {
        version: "1",
        requestId: input.requestId,
        contentId: input.contentId,
        ...(rejected && calls.length > 1
          ? {
              status: "applied",
              snapshot: {
                contentId: input.contentId,
                revision: "after",
                data: input.data,
              },
            }
          : {
              status: rejected ? "rejected" : "uncertain",
              expectedRevision: input.expectedRevision,
              message: "Controlled owner result",
            }),
      };
      if (outcome === "malformed") delete result.requestId;
      if (outcome === "identity") result.requestId = "another-request";
      return JSON.stringify(result);
    };
    const declaration = code.slice(code.indexOf("export default class Notes"));
    const Notes = new Function(
      "View",
      "invoke",
      "request_id",
      "validateRequest",
      "validateResponse",
      declaration.replace("export default", "return"),
    )(class {}, invoke, () => `notes-${calls.length}`, request, response);
    const note = Object.assign(Object.create(Notes.prototype), {
      id: "notes-a",
      sequence: 0,
      generation: 1,
      dirty: true,
      revision: "before",
      title: { value: () => data.title },
      text: { value: () => data.text },
    });
    const pending = [];
    const context = {
      notify() {},
      spawn(body) {
        pending.push(body(context));
      },
    };
    note.save(context);
    await Promise.all(pending.splice(0));
    assert.equal(calls.length, 1);
    note.save(context);
    await Promise.all(pending.splice(0));
    assert.equal(calls.length, rejected ? 2 : 1, outcome);
    assert.equal(note.dirty, !rejected);
    assert.deepEqual(calls[0].data, data);
    if (calls.length === 2) {
      assert.deepEqual(calls[1].data, calls[0].data);
      assert.notEqual(calls[1].requestId, calls[0].requestId);
    }
  }

  const outcomes = ["rejected", "uncertain", "lost", "malformed", "identity"];
  for (const outcome of outcomes) {
    await exercise(source, outcome);
  }
  const before = `        if (result.status === "rejected") {
          this.status = result.message;
        } else if (result.status !== "applied") {`;
  assert.equal(source.split(before).length, 2);
  const mutant = source.replace(
    before,
    '        if (result.status !== "applied") {',
  );
  await assert.rejects(() => exercise(mutant, "rejected"), {
    code: "ERR_ASSERTION",
    actual: 1,
    expected: 2,
  });
  assert.equal(fs.readFileSync(file, "utf8"), source);
});

test("fresh Notes opts into its native session before requesting retained editors", () => {
  const source = fs.readFileSync(`${root}/content/notes/main.js`, "utf8");
  const calls = [];
  const Notes = new Function(
    "View",
    "SessionState",
    "TitleState",
    "BodyState",
    source
      .slice(source.indexOf("export default class Notes"))
      .replace("export default", "return"),
  )(
    class {},
    {
      new() {
        calls.push("session");
        return {};
      },
    },
    {
      new() {
        calls.push("title");
        return {};
      },
    },
    {
      new() {
        calls.push("text");
        return {};
      },
    },
  );
  const note = new Notes();
  note.init();
  assert.deepEqual(calls, ["session", "title", "text"]);
  assert.ok(note.session && note.title && note.text);
});

test("Notes omits its redundant heading and previews Markdown without replacing retained editors", () => {
  const source = fs.readFileSync(
    process.env.VOYAGER_NOTES_SOURCE || `${root}/content/notes/main.js`,
    "utf8",
  );
  let showHeading = true;
  let reads = 0;
  const session = {
    status: () => "Draft",
    show_heading: () => showHeading,
    filename: () => "Title.md",
  };
  const title = {};
  const text = {
    value() {
      reads += 1;
      return "# Unsaved draft";
    },
  };
  const div = () => {
    const value = { nodes: [] };
    const view = new Proxy(value, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key === "child") target.nodes.push(args[0]);
          if (key === "children") target.nodes.push(...args[0]);
          if (key === "on_click") target.onClick = args[0];
          return view;
        };
      },
    });
    return view;
  };
  const Notes = new Function(
    "View",
    "SessionState",
    "TitleState",
    "BodyState",
    "Title",
    "Body",
    "Button",
    "TextView",
    "div",
    "theme",
    source
      .slice(source.indexOf("export default class Notes"))
      .replace("export default", "return"),
  )(
    class {},
    { new: () => session },
    { new: () => title },
    { new: () => text },
    { new: (state) => Object.assign(div(), { kind: "title", state }) },
    { new: (state) => Object.assign(div(), { kind: "body", state }) },
    { new: div },
    {
      markdown: (id, value) => Object.assign(div(), { kind: "preview", value }),
    },
    div,
    () => ({}),
  );
  const note = new Notes();
  note.init();
  for (const visible of [true, false, true]) {
    showHeading = visible;
    const view = note.render();
    assert.equal(
      view.nodes.some((child) => child.nodes.includes("NOTES")),
      false,
    );
    assert.equal(
      view.nodes.find((child) => child.kind === "title").state,
      title,
    );
    assert.equal(view.nodes.find((child) => child.kind === "body").state, text);
    assert.equal(note.session, session);
  }
  assert.equal(reads, 0);
  let notifications = 0;
  const click = (view, label) => {
    const button = view.nodes.find((child) => child.nodes.includes(label));
    assert.ok(button?.onClick, `${label} control is available`);
    button.onClick({}, { notify: () => notifications++ });
  };
  click(note.render(), "Preview");
  const preview = note.render();
  assert.equal(
    preview.nodes.find((child) => child.kind === "preview").value,
    "# Unsaved draft",
  );
  assert.equal(reads, 1);
  click(preview, "Edit");
  assert.equal(
    note.render().nodes.find((child) => child.kind === "body").state,
    text,
  );
  assert.equal(note.title, title);
  assert.equal(note.text, text);
  assert.equal(reads, 1);
  assert.equal(notifications, 2);
});
