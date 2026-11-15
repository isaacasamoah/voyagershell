const assert = require("node:assert/strict");
const { test } = require("node:test");

test("new-shell intent names its current content and backend without a saved launch", async () => {
  const { request, terminalResponse } = await import("./generated/validate.js");
  const intent = {
    requestId: "new-shell",
    expectedVersion: "4",
    action: {
      operation: "start-new-shell",
      vesselId: "content",
      expectedBackend: "t1",
    },
  };
  assert.equal(request(intent), true);
  assert.equal(
    request({
      ...intent,
      action: { ...intent.action, launch: { kind: "codex" } },
    }),
    false,
  );
  assert.equal(
    request({ ...intent, action: { ...intent.action, expectedBackend: 1 } }),
    false,
  );
  const outcome = {
    requestId: "open",
    vesselId: "content",
    status: "rejected",
    reason: "ended",
    message: "Finished",
  };
  assert.equal(terminalResponse(outcome), true);
  assert.equal(terminalResponse({ ...outcome, reason: "lost" }), false);
});

test("content tools contain data and revision but no actor authority", async () => {
  const { contentTool } = await import("./generated/validate.js");
  const input = {
    expectedVersion: "7",
    action: {
      operation: "update",
      vesselId: "notes-a",
      expectedRevision: "base",
      data: { title: "Title", text: "Body" },
    },
  };
  assert.equal(contentTool(input), true);
  for (const key of [
    "role",
    "path",
    "scope",
    "generation",
    "threadId",
    "turnId",
  ])
    assert.equal(contentTool({ ...input, [key]: "forged" }), false);
  assert.equal(
    contentTool({ ...input, action: { ...input.action, vesselId: 4 } }),
    false,
  );
  assert.equal(
    contentTool({
      ...input,
      action: {
        ...input.action,
        data: { title: "Title", text: "Body", role: "owner" },
      },
    }),
    false,
  );
});

test("generated wire validator rejects a forged caller and malformed split", async () => {
  const { request } = await import("./generated/validate.js");
  const valid = {
    requestId: "one",
    expectedVersion: "0",
    action: { operation: "inspect" },
  };
  assert.equal(request(valid), true);
  assert.equal(request({ ...valid, role: "owner" }), false);
  assert.equal(
    request({ ...valid, action: { operation: "reveal-placement", id: "p1" } }),
    true,
  );
  assert.equal(
    request({ ...valid, action: { operation: "reveal-vessel", id: "p1" } }),
    false,
  );
  assert.equal(
    request({ ...valid, action: { operation: "reveal-placement", id: 12 } }),
    false,
  );
  assert.equal(
    request({
      ...valid,
      action: { operation: "reveal-placement", id: "p1", fleet: "other" },
    }),
    false,
  );
  assert.equal(
    request({
      ...valid,
      action: {
        operation: "move-voyage",
        id: "v1",
        target: "v2",
        before: true,
      },
    }),
    true,
  );
  assert.equal(
    request({
      ...valid,
      action: {
        operation: "move-fleet",
        id: "f1",
        target: "f2",
        before: "yes",
      },
    }),
    false,
  );
  assert.equal(
    request({
      ...valid,
      action: {
        operation: "move-placement",
        id: "p1",
        target: "p2",
        side: "diagonal",
      },
    }),
    false,
  );
  const creation = {
    operation: "create-vessel",
    typeId: "notes",
    destination: {
      kind: "placement",
      owner: { kind: "fleet", id: "fleet-1" },
      insertion: { kind: "beside", id: "placement-1", side: "right" },
    },
  };
  assert.equal(request({ ...valid, action: creation }), true);
  assert.equal(
    request({
      ...valid,
      action: {
        ...creation,
        destination: {
          ...creation.destination,
          insertion: { ...creation.destination.insertion, side: "diagonal" },
        },
      },
    }),
    false,
  );
  assert.equal(
    request({
      ...valid,
      action: {
        operation: "split",
        fleet: "fleet-1",
        after: "placement-1",
        axis: "horizontal",
      },
    }),
    false,
  );
});

test("process schema keeps integer bounds and excludes caller authority", async () => {
  const { processTool } = await import("./generated/validate.js");
  const request = {
    expectedVersion: "1",
    action: {
      operation: "send",
      vesselId: "content-1",
      terminalId: "t1",
      pid: 10,
      text: "hello",
    },
  };
  assert.equal(processTool(request), true);
  const { text, ...target } = request.action;
  assert.equal(
    processTool({ ...request, action: { ...target, operation: "stop" } }),
    true,
  );
  for (const pid of [-1, 0.5, 4294967296])
    assert.equal(
      processTool({ ...request, action: { ...request.action, pid } }),
      false,
    );
  assert.equal(
    processTool({ ...request, scope: { kind: "workspace" } }),
    false,
  );
  assert.equal(
    processTool({
      expectedVersion: "1",
      action: {
        operation: "read",
        vesselId: "content-1",
        terminalId: "t1",
        lines: 160,
      },
    }),
    true,
  );
  assert.equal(
    processTool({
      expectedVersion: "1",
      action: {
        operation: "read",
        vesselId: "content-1",
        terminalId: "t1",
        lines: 161,
      },
    }),
    false,
  );
});

test("a workspace reply says applied, refused or uncertain, with or without the owner's answer", async () => {
  const { response } = await import("./generated/validate.js");
  const examples = require("./tests/replies.json");
  assert.deepEqual(Object.keys(examples), [
    "applied",
    "refused",
    "uncertain",
    "unansweredRefused",
    "unansweredUncertain",
  ]);
  for (const [name, reply] of Object.entries(examples))
    assert.equal(response(reply), true, name);
  assert.equal(response({ ...examples.refused, status: "rejected" }), false);
  const { layout: _layout, ...withoutLayout } = examples.applied;
  assert.equal(response(withoutLayout), false);
  const unanswered = examples.unansweredRefused;
  assert.equal(response({ ...unanswered, status: "applied" }), false);
  assert.equal(response({ ...unanswered, status: "rejected" }), false);
  assert.equal(response({ ...unanswered, kind: "busy" }), false);
  const { message: _message, ...withoutReason } = unanswered;
  assert.equal(response(withoutReason), false);
  const { requestId: _requestId, ...withoutRequest } = unanswered;
  assert.equal(response(withoutRequest), false);
});
