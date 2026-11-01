const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { PortalLibrary } = require("./portal-library.cjs");
const { PortalHost } = require("./portal-host.cjs");
const { Workspace } = require("./workspace.cjs");
const { Companion } = require("./companion.cjs");
const { runInNewContext } = require("node:vm");

const request = (operation, contentId, input = {}) => ({
  version: "1",
  requestId: randomUUID(),
  contentId,
  operation: `content.${operation}`,
  ...input,
});

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "voyager-content-"));
  const library = new PortalLibrary(
    root,
    path.join(__dirname, "portal-defaults"),
    null,
    () => {},
  );
  t.after(() => {
    library.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const note = await library.create("notes", root);
  const workspace = new Workspace(null, root, () => {}, library);
  workspace.state = {
    dock: "home",
    activeRealm: "r",
    realms: [
      {
        id: "r",
        dimensions: [
          { id: "d", root: note },
          { id: "outside", root: null },
        ],
      },
    ],
  };
  return {
    root,
    library,
    workspace,
    note,
    host: new PortalHost(workspace, library),
  };
}

test("an existing Notes instance gains a declared schema through a live manifest edit without changing its data or source", async (t) => {
  const { root, library, note, host } = await fixture(t);
  const manifest = path.join(root, "packages/notes/portal.json");
  const definition = JSON.parse(fs.readFileSync(manifest, "utf8"));
  delete definition.stateSchema;
  fs.writeFileSync(manifest, JSON.stringify(definition));
  library.scan();
  const data = fs.readFileSync(library.dataFile(note.id), "utf8");
  const source = fs.readFileSync(
    path.join(root, "packages/notes/view.html"),
    "utf8",
  );
  const call = (input) => host.content(input, { kind: "owner" });
  assert.equal(
    call(request("describe", note.id)).descriptor.schemaDeclared,
    false,
  );
  definition.stateSchema = {
    type: "object",
    properties: { title: { type: "string" }, text: { type: "string" } },
    required: ["title", "text"],
  };
  fs.writeFileSync(manifest, JSON.stringify(definition));
  library.scan();
  assert.equal(
    call(request("describe", note.id)).descriptor.schemaDeclared,
    true,
  );
  assert.equal(fs.readFileSync(library.dataFile(note.id), "utf8"), data);
  assert.equal(
    fs.readFileSync(path.join(root, "packages/notes/view.html"), "utf8"),
    source,
  );
  const before = call(request("inspect", note.id)).snapshot;
  const invalid = call(
    request("update", note.id, {
      expectedRevision: before.revision,
      data: { title: "A", text: 12 },
    }),
  );
  assert.equal(invalid.status, "rejected");
  assert.equal(invalid.code, "invalid-data");
  assert.equal(fs.readFileSync(library.dataFile(note.id), "utf8"), data);
  await assert.rejects(
    host.call({
      action: "update",
      id: note.id,
      expected: before.revision,
      data: { text: 12 },
    }),
    /schema/i,
  );
  const saved = call(
    request("update", note.id, {
      expectedRevision: before.revision,
      data: { title: "A", text: "Saved through the contract" },
    }),
  );
  assert.equal(saved.status, "applied");
  assert.equal(saved.snapshot.contentId, note.id);
  assert.equal(library.read(note.id).data.text, "Saved through the contract");
  const companion = new Companion(host.workspace, root, () => {});
  host.workspace.portalHost = host;
  assert.equal(
    (
      await companion.invoke("voyager_portal", {
        action: "describe",
        id: note.id,
      })
    ).descriptor.schemaDeclared,
    true,
  );
  await assert.rejects(
    companion.invoke("voyager_portal", {
      action: "update",
      id: note.id,
      expected: saved.snapshot.revision,
      data: { text: 12 },
    }),
    /schema/i,
  );
  const stale = call(
    request("update", note.id, {
      expectedRevision: before.revision,
      data: { title: "A", text: "Must not replace" },
    }),
  );
  assert.equal(stale.code, "stale-revision");
  assert.equal(stale.expectedRevision, before.revision);
  assert.equal(library.read(note.id).data.text, "Saved through the contract");
});

test("malformed versions and forged targets cannot grant frame or agent authority", async (t) => {
  const { library, workspace, note, host } = await fixture(t);
  const original = library.read(note.id);
  const input = request("update", note.id, {
    expectedRevision: original.version,
    data: { title: "A", text: "Forbidden" },
  });
  for (const changed of [
    { ...input, version: "2" },
    { ...input, authority: "owner" },
  ])
    assert.equal(
      host.content(changed, { kind: "owner" }).status,
      "invalid-request",
    );
  assert.equal(
    host.content(input, { kind: "frame", contentId: "another-view" }).code,
    "forbidden",
  );
  workspace.state.dock = "dimension:outside";
  assert.equal(host.content(input, { kind: "agent" }).code, "forbidden");
  assert.deepEqual(library.read(note.id), original);
});

test("a lost readback after real replacement reports uncertainty once and preserves request identity", async (t) => {
  const { library, note, host } = await fixture(t);
  const originalRead = library.read.bind(library);
  const originalWrite = library.write.bind(library);
  const before = originalRead(note.id);
  let reads = 0;
  let writes = 0;
  library.read = (id) => {
    if (++reads === 2) throw Error("Readback was lost after replacement");
    return originalRead(id);
  };
  library.write = (...args) => {
    writes++;
    return originalWrite(...args);
  };
  const input = request("update", note.id, {
    expectedRevision: before.version,
    data: { title: "A", text: "Replacement happened" },
  });
  const result = host.content(input, { kind: "owner" });
  assert.equal(result.status, "uncertain");
  assert.equal(result.requestId, input.requestId);
  assert.equal(result.contentId, note.id);
  assert.equal(result.expectedRevision, before.version);
  assert.equal(writes, 1);
  assert.equal(originalRead(note.id).data.text, "Replacement happened");
});

test("the browser client refuses mismatched or missing answers without resubmitting", async () => {
  const input = request("inspect", "notes");
  const valid = {
    version: "1",
    status: "snapshot",
    requestId: input.requestId,
    contentId: input.contentId,
    snapshot: {
      contentId: input.contentId,
      typeId: "notes",
      revision: "saved",
      data: { text: "A" },
    },
  };
  let result = valid;
  let calls = 0;
  const window = {
    voyager: {
      call: async () => {
        calls++;
        if (result === null) throw Error("Connection lost");
        return result;
      },
    },
  };
  runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "generated/content-client.js"),
      "utf8",
    ),
    { window },
  );
  assert.equal(
    (await window.contentClient.call(input, "notes")).status,
    "snapshot",
  );
  for (result of [
    { ...valid, requestId: "another-attempt" },
    { ...valid, snapshot: { ...valid.snapshot, contentId: "another-content" } },
    { ...valid, status: "applied" },
    null,
  ])
    await assert.rejects(
      window.contentClient.call(input, "notes"),
      /not retried/,
    );
  assert.equal(calls, 5);
});
