const test = require("node:test");
const assert = require("node:assert/strict");

test("generated validators reject unknown fields, versions and malformed results", async () => {
  const { request, response, notes } = await import("./generated/validate.js");
  const inspect = {
    version: "1",
    operation: "content.inspect",
    requestId: "r",
    contentId: "notes-a",
  };
  assert.equal(request(inspect), true);
  assert.equal(request({ ...inspect, version: "2" }), false);
  assert.equal(request({ ...inspect, role: "owner" }), false);
  assert.equal(notes({ title: "x", text: "y" }), true);
  assert.equal(notes({ title: "x", text: 1 }), false);
  assert.equal(
    response({
      version: "1",
      status: "applied",
      requestId: "r",
      contentId: "notes-a",
      snapshot: {
        contentId: "notes-a",
        revision: "v",
        data: { title: "x", text: "y" },
      },
    }),
    true,
  );
  assert.equal(
    response({
      version: "1",
      status: "applied",
      requestId: "r",
      contentId: "notes-a",
    }),
    false,
  );
});
