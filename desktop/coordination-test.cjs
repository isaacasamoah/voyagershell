const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");

function inbox(
  call = async () => {
    throw Error("Transport unavailable");
  },
) {
  const source = fs
    .readFileSync(
      process.env.VOYAGER_INBOX_SOURCE || `${__dirname}/mods/header/inbox.js`,
      "utf8",
    )
    .replace(/^import [\s\S]*?;\n/gm, "")
    .replace("export class Inbox", "return class Inbox");
  const Inbox = new Function(
    "coordination",
    "coordination_watch",
    "request_id",
    "validateResponse",
    source,
  )(
    call,
    async () => {},
    () => "retained-request",
    () => true,
  );
  const view = new Inbox("test-inbox");
  const tasks = [];
  let notifications = 0;
  const cx = { spawn: (run) => tasks.push(run), notify: () => notifications++ };
  return { view, tasks, cx, notifications: () => notifications };
}

function response(revision) {
  return {
    requestId: "retained-request",
    outcome: "applied",
    snapshot: { revision, agents: [], messages: [], current: { kind: "user" } },
  };
}

test("Inbox ignores an older concurrent snapshot", () => {
  const { view } = inbox();
  view.receive(response(4));
  view.receive(response(3));
  assert.equal(view.snapshot.revision, 4);
});

test("Inbox retains an uncertain request and serializes its explicit inspection", async () => {
  let reject = true;
  let lookupAvailable = false;
  const { view, tasks, cx } = inbox(async () => {
    if (reject) throw Error("Transport unavailable");
    return JSON.stringify({
      ...response(5),
      snapshot: lookupAvailable ? response(5).snapshot : null,
      outcome: "refused",
      message: "Nothing was queued",
    });
  });
  const action = {
    operation: "resolve",
    id: "decision",
    decision: { kind: "approve" },
  };
  view.send(action, cx);
  await tasks.shift()(cx);
  assert.deepEqual(view.uncertain, { requestId: "retained-request", action });
  assert.equal(view.pending, false);
  reject = false;
  view.inspect(cx);
  view.inspect(cx);
  assert.equal(tasks.length, 1);
  await tasks.shift()(cx);
  assert.deepEqual(view.uncertain, { requestId: "retained-request", action });
  lookupAvailable = true;
  view.inspect(cx);
  await tasks.shift()(cx);
  assert.equal(view.uncertain, null);
  assert.equal(view.error, "Nothing was queued");
  assert.equal(view.pending, false);
});

test("Inbox holds a failed observer instead of restarting on render", async () => {
  const { view, tasks, cx, notifications } = inbox();
  view.visible = true;
  view.observe(cx);
  await tasks.shift()(cx);
  assert.equal(notifications(), 1);
  view.observe(cx);
  assert.equal(tasks.length, 0);
  assert.equal(view.error, "Transport unavailable");
});
