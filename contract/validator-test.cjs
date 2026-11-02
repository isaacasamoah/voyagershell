const assert = require("node:assert/strict");
const { test } = require("node:test");

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
        operation: "move-vessel",
        id: "p1",
        target: "p2",
        side: "diagonal",
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
        axis: "diagonal",
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
      contentId: "content-1",
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
        contentId: "content-1",
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
        contentId: "content-1",
        terminalId: "t1",
        lines: 161,
      },
    }),
    false,
  );
});
