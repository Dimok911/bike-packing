import test from "node:test";
import assert from "node:assert/strict";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createPhotoOperationRecovery, PHOTO_OPERATION_CAPABILITY } from "../../src/sync/photo-operation-recovery.js";
import { apiUploadFormDataRequest } from "../../src/sync/api-client.js";

const path = "/bike-packing/lists/list-a/photos";
const storage = () => {
  const values = new Map();
  return { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
function transport(store) {
  return createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, selection: "direct", storage: store,
    locks: { request: async (name, callback) => callback() } });
}
function body(photoId = "photo-a", bytes = "file") {
  const form = new FormData();
  form.set("photoId", photoId); form.set("entityId", "item-a"); form.set("entityType", "item");
  form.set("file", new Blob([bytes], { type: "image/png" }), "photo.png");
  return form;
}
function result(expected, changes = {}) {
  return { ok: true, operation: { ...expected, id: expected.operationId, environment: "bike-packing-experiment",
    state: "committed", payloadDigest: "a".repeat(64), ...changes },
  photo: { id: expected.photoId, url: `https://experiment.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/list-a/photos/${expected.photoId}/file` } };
}
function reader(getResult, actorId = "actor-a") {
  return async (url, options) => {
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    const data = url.endsWith("/auth/me") ? { user: { id: actorId } }
      : url.endsWith("/capabilities") ? { capabilities: [PHOTO_OPERATION_CAPABILITY] } : getResult();
    return new Response(JSON.stringify(data));
  };
}

test("photo recovery: committed server result after response loss is recovered with GET and one send", async () => {
  const t = transport(storage()), form = body();
  let committed, sends = 0;
  const recovery = createPhotoOperationRecovery({ transport: t, enabled: true, fetchImpl: reader(() => committed) });
  const data = await recovery.run({ path, body: form, send: async expected => {
    sends++;
    const id = await t.beginWrite(path, "POST", form, expected);
    assert.equal(form.get("operationId"), id);
    committed = result(expected);
    throw new Error("response lost after server commit");
  } });
  assert.equal(data.photo.id, "photo-a"); assert.equal(sends, 1); assert.equal(t.uncertainWrite, null);
  assert.deepEqual(t.writes[0].receipt, data);
});

test("photo recovery: reload uses persisted logical ID, GET only, preserves the local body", async () => {
  const store = storage(), first = transport(store), firstBody = body();
  let expected;
  const unknown = createPhotoOperationRecovery({ transport: first, enabled: true, fetchImpl: reader(() => ({ ok: true, operation: { state: "unknown" } })) });
  await assert.rejects(unknown.run({ path, body: firstBody, send: async value => {
    expected = value;
    await first.beginWrite(path, "POST", firstBody, value);
    throw Error("connection lost");
  } }), { isAmbiguousMutation: true });
  const restarted = transport(store), secondBody = body();
  const recovered = createPhotoOperationRecovery({ transport: restarted, enabled: true, fetchImpl: reader(() => result(expected)) });
  const data = await recovered.run({ path, body: secondBody, send: () => assert.fail("must not resend") });
  assert.equal(data.operation.id, expected.operationId);
  assert.equal(await secondBody.get("file").text(), "file");
  assert.equal(restarted.uncertainWrite, null);
});

test("photo recovery: unknown, superseded, wrong actor/target/hash/id never release the barrier", async () => {
  for (const changes of [{ state: "unknown" }, { state: "superseded-or-unavailable" }, { actorId: "other" },
    { photoId: "old-photo" }, { id: "old-operation" }, { fileHash: "old matching photo" }, { thumbHash: "different" }]) {
    const t = transport(storage()), form = body();
    let expected;
    const recovery = createPhotoOperationRecovery({ transport: t, enabled: true, fetchImpl: reader(() => result(expected, changes)) });
    await assert.rejects(recovery.run({ path, body: form, send: async value => {
      expected = value;
      await t.beginWrite(path, "POST", form, value);
      throw Error("lost");
    } }), { isAmbiguousMutation: true });
    assert.equal(t.uncertainWrite.id, expected.operationId);
  }
});

test("photo recovery: a stale acknowledged queue queries the same receipt, distinct photos get distinct IDs", async () => {
  const t = transport(storage());
  const receipts = new Map(); let sends = 0;
  const recovery = createPhotoOperationRecovery({ transport: t, enabled: true,
    fetchImpl: async (url, options) => reader(() => receipts.get(url.split("/").at(-1)))(url, options) });
  const send = form => async expected => {
    sends++; await t.beginWrite(path, "POST", form, expected);
    const data = result(expected); receipts.set(expected.operationId, data); return data;
  };
  const firstBody = body();
  const first = await recovery.run({ path, body: firstBody, send: send(firstBody) });
  const replay = await recovery.run({ path, body: body(), send: () => assert.fail("ACK queue must not resend") });
  assert.equal(first.operation.id, replay.operation.id);
  const otherBody = body("photo-b");
  const other = await recovery.run({ path, body: otherBody, send: send(otherBody) });
  assert.notEqual(first.operation.id, other.operation.id); assert.equal(sends, 2);
});

test("photo recovery: old unprotected intent cannot be retroactively bound to a server operation", async () => {
  const t = transport(storage()), form = body();
  const id = await t.beginWrite(path, "POST", form);
  t.noteFailure(Error("old timeout"), path, "POST", id);
  const recovery = createPhotoOperationRecovery({ transport: t, enabled: true, fetchImpl: reader(() => assert.fail("no fabricated status lookup")) });
  await assert.rejects(recovery.run({ path, body: form, send: () => assert.fail("no send") }), { isAmbiguousMutation: true });
  assert.equal(t.uncertainWrite.id, id);
});

test("photo recovery: real XHR wrapper retains intent on timeout then binds terminal GET receipt", async () => {
  const previous = globalThis.XMLHttpRequest;
  const t = transport(storage());
  let committed, sends = 0;
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() {}
    send(form) {
      sends++; const expected = t.writes.find(entry => entry.id === form.get("operationId")).recovery;
      committed = result(expected);
      queueMicrotask(() => this.ontimeout());
    }
  };
  try {
    const photoRecovery = createPhotoOperationRecovery({ transport: t, enabled: true, fetchImpl: reader(() => committed) });
    const data = await apiUploadFormDataRequest(path, { body: body() }, { transport: t, photoRecovery });
    assert.equal(data.operation.state, "committed"); assert.equal(sends, 1); assert.equal(t.uncertainWrite, null);
  } finally { globalThis.XMLHttpRequest = previous; }
});
