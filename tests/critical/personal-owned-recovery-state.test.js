import test from "node:test";
import assert from "node:assert/strict";
import { readPersonalOwnedRecoveryState } from "../../src/sync/personal-owned-recovery-state.js";

const listId = "list-c20abef5-43fb-4747-9b35-04174f2a0a65";
const actorId = "04c69a90-72b5-4891-9607-1cb636c5af21";
const revision = 1585, updatedAt = "2026-09-14T18:00:00.000Z";
const detailPath = `/bike-packing/lists/${encodeURIComponent(listId)}`;
const clone = structuredClone;
const isBlocked = error => {
  assert.equal(error.code, "recovery-state");
  assert.equal(error.isPersonalSaveBlocked, true);
  assert.equal(error.isOperationReceiptError, true);
  return true;
};
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

function fixture() {
  // Exact published /state DTO shape: metadata is not hidden in an invented
  // data.list. No live user payload or receipt is used by this test.
  const photo = { id: "legacy-photo", listId: "", status: "synced", width: 640, height: 480, updatedAt,
    url: `https://experiment.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/${listId}/photos/legacy-photo/file?source=old%2Fphoto`,
    thumbUrl: `https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/${listId}/photos/legacy-photo/thumb?source=old%2Fphoto` };
  const payload = { items: {}, containers: { bag: { id: "bag", name: "Old bag", weight: 2700, photos: [photo] } },
    layouts: { layout: { id: "layout", arrangement: { rootContainerIds: ["bag"], containers: { bag: { parentId: "" } }, items: {} } } },
    futureBusinessField: { preserve: ["without normalization", { exact: true }] } };
  const detail = { ok: true, list: { id: listId, ownerId: actorId, role: "owner", visibility: "shared", sourceType: "user",
    stateRevision: revision, updatedAt, payload: clone(payload) } };
  const record = { payload: clone(payload), payloadHash: "a".repeat(64), entityHash: "b".repeat(64), stateRevision: revision,
    itemCount: 0, containerCount: 1, layoutCount: 1, payloadSize: 1024, updatedAt };
  const state = { ok: true, listId, updatedAt, serverUpdatedAt: updatedAt, stateRevision: revision,
    state: clone(payload), payload: clone(payload), record, payloadHash: record.payloadHash, entityHash: record.entityHash,
    itemCount: 0, containerCount: 1, layoutCount: 1 };
  const f = { responses: [detail, state, clone(detail)], calls: [], guardCalls: 0, afterRead: null, failAt: 0 };
  f.run = options => readPersonalOwnedRecoveryState({ listId, actorId,
    read: async path => {
      f.calls.push(path);
      if (f.failAt === f.calls.length) throw Error(`Read ${f.failAt} failed`);
      const result = f.responses[f.calls.length - 1];
      if (!result) throw Error("Unexpected extra HTTP read");
      f.afterRead?.(f.calls.length); return result;
    },
    assertCurrent: () => { f.guardCalls++; }, ...options });
  return f;
}

test("actual metadata-free state DTO is bracketed by matching owner details and retains exact raw state", async () => {
  const f = fixture(), state = clone(f.responses[1]);
  assert.equal(state.list, undefined); assert.equal(state.record.id, undefined); assert.equal(state.record.ownerId, undefined);
  const result = await f.run();
  assert.deepEqual(f.calls, [detailPath, `${detailPath}/state`, detailPath]);
  assert.deepEqual(result, { ...state, record: { ...state.record, id: listId, ownerId: actorId,
    role: "owner", sourceType: "user", visibility: "shared" } });
  assert.ok(f.guardCalls >= 4, "context is guarded before reading and after every awaited response");
});

test("stale or poisonous detail payloads never replace the raw state payload", async () => {
  const f = fixture(), state = clone(f.responses[1]);
  Object.defineProperty(f.responses[0].list, "payload", { get() { throw Error("D1 payload must not be read"); }, enumerable: true });
  Object.defineProperty(f.responses[2].list, "payload", { get() { throw Error("D2 payload must not be read"); }, enumerable: true });
  const result = await f.run();
  assert.deepEqual(result.payload, state.payload); assert.deepEqual(result.state, state.state);
  assert.deepEqual(result.record.payload, state.record.payload);
  assert.equal(result.record.payload.containers.bag.photos[0].listId, "");
  assert.equal(result.record.payload.containers.bag.photos[0].url, state.record.payload.containers.bag.photos[0].url);
});

test("frozen HTTP DTOs are not mutated when the returned record receives verified metadata", async () => {
  const f = fixture(), before = clone(f.responses);
  f.responses.forEach(freeze);
  const result = await f.run();
  assert.deepEqual(f.responses, before);
  assert.notEqual(result, f.responses[1]); assert.notEqual(result.record, f.responses[1].record);
  assert.equal(Object.hasOwn(f.responses[1].record, "ownerId"), false);
});

test("missing or foreign first-detail identity stops before requesting the state", async () => {
  for (const change of [d => { d.ok = false; }, d => { delete d.list; }, d => { delete d.list.id; },
    d => { d.list.id = "foreign-list"; }, d => { delete d.list.ownerId; }, d => { d.list.ownerId = "foreign-owner"; },
    d => { d.list.deleted = true; }]) {
    const f = fixture(); change(f.responses[0]);
    await assert.rejects(f.run(), isBlocked); assert.deepEqual(f.calls, [detailPath]);
  }
});

test("invalid first-detail revisions are not coerced into a trusted baseline", async () => {
  for (const value of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, String(revision)]) {
    const f = fixture(); f.responses[0].list.stateRevision = value;
    await assert.rejects(f.run(), isBlocked); assert.deepEqual(f.calls, [detailPath]);
  }
});

test("a changed final revision, owner or access metadata invalidates the entire bracket", async () => {
  for (const [key, value] of [["stateRevision", revision + 1], ["id", "foreign-list"], ["ownerId", "other-actor"],
    ["role", "viewer"], ["sourceType", "public-template"], ["visibility", "public"], ["updatedAt", "2026-09-14T18:01:00.000Z"],
    ["deleted", true]]) {
    const f = fixture(); f.responses[2].list[key] = value;
    await assert.rejects(f.run(), isBlocked);
    assert.deepEqual(f.calls, [detailPath, `${detailPath}/state`, detailPath], key);
  }
});

test("state list identity and both revision fields must match the first detail without coercion", async () => {
  for (const change of [s => { delete s.listId; }, s => { s.listId = "other-list"; },
    s => { delete s.stateRevision; }, s => { s.stateRevision++; }, s => { s.stateRevision = String(revision); },
    s => { delete s.record.stateRevision; }, s => { s.record.stateRevision--; }, s => { s.record.stateRevision = String(revision); }]) {
    const f = fixture(); change(f.responses[1]);
    await assert.rejects(f.run(), isBlocked); assert.deepEqual(f.calls, [detailPath, `${detailPath}/state`]);
  }
});

test("different raw payload aliases including photo URL queries and order are rejected", async () => {
  for (const change of [s => { s.payload.containers.bag.weight++; }, s => { s.state.futureBusinessField.preserve.reverse(); },
    s => { s.record.payload.containers.bag.photos[0].url += "&different=1"; },
    s => { s.record.payload.containers.bag.photos[0].url = s.record.payload.containers.bag.photos[0].url.replace("https://experiment.vniipo-help.ru/letters", "https://api.vniipo-help.ru/experiment/letters"); }]) {
    const f = fixture(); change(f.responses[1]);
    await assert.rejects(f.run(), isBlocked); assert.deepEqual(f.calls, [detailPath, `${detailPath}/state`]);
  }
});

test("incomplete or rejected state responses do not trigger a final detail read", async () => {
  for (const change of [s => { s.ok = false; }, s => { delete s.record; }, s => { s.record = null; },
    s => { delete s.payload; }, s => { delete s.state; }, s => { delete s.record.payload; },
    s => { s.payload = s.state = s.record.payload = null; }, s => { s.payload = s.state = s.record.payload = []; }]) {
    const f = fixture(); change(f.responses[1]);
    await assert.rejects(f.run(), isBlocked); assert.deepEqual(f.calls, [detailPath, `${detailPath}/state`]);
  }
});

test("changed editor context before the first request performs no network read", async () => {
  const f = fixture();
  await assert.rejects(f.run({ assertCurrent() { throw Error("Editor was replaced"); } }), isBlocked);
  assert.deepEqual(f.calls, []);
});

test("false and asynchronous context guards cannot grant authority for an HTTP read", async () => {
  for (const assertCurrent of [() => false, () => Promise.resolve(true), () => Promise.reject(Error("Async context is unsupported"))]) {
    const f = fixture(); await assert.rejects(f.run({ assertCurrent }), isBlocked);
    assert.deepEqual(f.calls, []);
  }
});

test("context change while any request is in flight stops before another read or returning data", async () => {
  for (const stopAfter of [1, 2, 3]) {
    const f = fixture(); let changed = false;
    f.afterRead = number => { if (number === stopAfter) changed = true; };
    await assert.rejects(f.run({ assertCurrent() { if (changed) throw Error("Account changed during HTTP read"); } }), isBlocked);
    assert.equal(f.calls.length, stopAfter);
  }
});

test("a rejected GET at any stage is classified as recovery-state and is not retried", async () => {
  for (const failAt of [1, 2, 3]) {
    const f = fixture(); f.failAt = failAt;
    await assert.rejects(f.run(), isBlocked); assert.equal(f.calls.length, failAt);
  }
});

test("missing caller identity fails closed before reading remote data", async () => {
  for (const options of [{ actorId: "" }, { actorId: null }, { listId: "" }, { listId: null }]) {
    const f = fixture(); await assert.rejects(f.run(options), isBlocked); assert.deepEqual(f.calls, []);
  }
});
