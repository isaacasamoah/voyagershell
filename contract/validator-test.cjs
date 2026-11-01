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
        operation: "split",
        fleet: "fleet-1",
        after: "placement-1",
        axis: "diagonal",
      },
    }),
    false,
  );
});
