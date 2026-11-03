const assert = require("node:assert/strict");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const file = `${root}/content/notes/main.js`;
const source = fs.readFileSync(file, "utf8");

test("the real Notes client retains drafts and distinguishes known refusal from lost confirmation", async () => {
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
      "validateRequest",
      "validateResponse",
      declaration.replace("export default", "return"),
    )(class {}, invoke, request, response);
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
