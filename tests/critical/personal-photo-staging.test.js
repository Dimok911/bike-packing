import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createPersonalPhotoStaging, PERSONAL_PHOTO_STAGING_ENABLED, validateStagedPhotoReceipt } from "../../src/sync/personal-photo-staging.js";

function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
  const context = { ...binding, generation: "edit-1", scope: "personal" }, values = new Map(), tails = new Map(), calls = [], receipts = new Map();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: (key, run) => { const promise = (tails.get(key) || Promise.resolve()).catch(() => {}).then(run); tails.set(key, promise); return promise; } };
  const bytes = "full photo bytes", digest = createHash("sha256").update(bytes).digest("hex");
  const record = { binding, intentHash: "d".repeat(64), action: { operationId: randomUUID() },
    stage: { operationId: randomUUID(), entityType: "item", entityId: "item-a", photoId: "photo-a", fileName: "photo.png" },
    file: new Blob([bytes], { type: "image/png" }), thumb: null, fileMetadata: { hash: digest }, thumbMetadata: null };
  const state = { claimed: false, lose: false, unknown: false, capability: true, actor: binding.actorId, beforeAck: null, assetState: "ready", afterClaim: null };
  const store = { binding, read: async id => id === record.action.operationId ? record : null,
    claimStage: async id => { assert.equal(id, record.action.operationId); const fresh = !state.claimed; state.claimed = true;
      state.afterClaim?.(); return { fresh, stageOperationId: record.stage.operationId, intentHash: record.intentHash }; } };
  const proof = () => ({ ok: true, operation: { id: record.stage.operationId, state: "committed", environment: binding.environment,
    actorId: binding.actorId, listId: binding.listId, entityId: record.stage.entityId, entityType: record.stage.entityType,
    photoId: record.stage.photoId, payloadDigest: "e".repeat(64) },
    asset: { id: record.stage.operationId, state: state.assetState, publication: "not-published", fileHash: digest, thumbHash: digest,
      storedFileHash: digest, storedThumbHash: digest } });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); assert.equal(options.credentials, "include"); assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
    let data;
    if (url.endsWith("/auth/me")) data = { user: { id: state.actor } };
    else if (url.endsWith("/capabilities")) data = { capabilities: state.capability ? ["personalStagedPhotoAssetsV1"] : [] };
    else if (options.method === "POST") {
      assert.equal(options.body.get("operationId"), record.stage.operationId); assert.equal(options.body.get("expectedActorId"), binding.actorId);
      assert.equal(await options.body.get("file").text(), bytes); assert.equal(options.body.get("file").name, "photo.png");
      data = proof(); receipts.set(record.stage.operationId, data); state.beforeAck?.(); if (state.lose) throw Error("lost upload response");
    } else data = state.unknown ? { ok: true, operation: { id: record.stage.operationId, state: "unknown" } } : receipts.get(record.stage.operationId);
    return new Response(JSON.stringify(data || { ok: true, operation: { state: "unknown" } }), { status: 200 });
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" });
    return { transport, staging: createPersonalPhotoStaging({ store, transport, locks, fetchImpl, getContext: () => context, enabled: true, ...options }) };
  };
  return { ...make(), make, store, state, record, binding, context, values, storage, proof, receipts, calls, posts: () => calls.filter(call => call.options.method === "POST") };
}

test("staging release gate and absent capability/actor/bytes stop before a dispatch claim or upload", async () => {
  assert.equal(PERSONAL_PHOTO_STAGING_ENABLED, false);
  for (const reason of ["disabled", "capability", "actor", "missing"]) {
    const f = fixture();
    if (reason === "capability") f.state.capability = false;
    if (reason === "actor") f.state.actor = "actor-b";
    if (reason === "missing") f.store.read = async () => null;
    await assert.rejects(f.make({ enabled: reason !== "disabled" }).staging.stage(f.record.action.operationId));
    assert.equal(f.state.claimed, false); assert.equal(f.posts().length, 0);
  }
});

test("staging loses ACK then reloads the exact receipt, keeps a terminal transport proof and never confirms the owner action", async () => {
  const f = fixture(); f.state.lose = true; f.state.unknown = true;
  await assert.rejects(f.staging.stage(f.record.action.operationId)); assert.equal(f.posts().length, 1);
  f.state.unknown = false;
  const fresh = f.make(), result = await fresh.staging.stage(f.record.action.operationId);
  assert.equal(result.historicalStageOnly, true); assert.equal(result.actionOperationId, f.record.action.operationId);
  assert.equal(result.asset.publication, "not-published"); assert.equal(result.photo, undefined);
  assert.equal(f.posts().length, 1); assert.equal(fresh.transport.writes[0].confirmed, true);
  assert.equal(fresh.transport.writes[0].id, f.record.stage.operationId);
  assert.equal(fresh.transport.writes.some(entry => entry.id === f.record.action.operationId), false);
  await f.make({ enabled: false }).staging.inspect(f.record.action.operationId); assert.equal(f.posts().length, 1);
});

test("durable stage claim prevents re-POST after transport journal loss or a crash before first dispatch", async () => {
  const f = fixture(); f.state.lose = true; f.state.unknown = true;
  await assert.rejects(f.staging.stage(f.record.action.operationId));
  f.values.clear(); await assert.rejects(f.make().staging.stage(f.record.action.operationId)); assert.equal(f.posts().length, 1);
  f.state.unknown = false; await f.make().staging.stage(f.record.action.operationId); assert.equal(f.posts().length, 1);
  const stopped = fixture(); stopped.state.afterClaim = () => { stopped.context.generation = "new-editor"; };
  await assert.rejects(stopped.staging.stage(stopped.record.action.operationId)); assert.equal(stopped.posts().length, 0);
  stopped.state.afterClaim = null;
  await assert.rejects(stopped.make().staging.stage(stopped.record.action.operationId)); assert.equal(stopped.posts().length, 0);
});

test("two staged queues, wrong receipt binding, unavailable bytes and account changes cannot publish or replay", async () => {
  const f = fixture();
  await Promise.all([f.staging.stage(f.record.action.operationId), f.make().staging.stage(f.record.action.operationId)]); assert.equal(f.posts().length, 1);
  const expected = f.transport.writes[0].recovery, valid = f.proof();
  assert.equal(validateStagedPhotoReceipt(valid, expected), true);
  for (const change of [{ actorId: "actor-b" }, { environment: "production" }, { id: randomUUID() }, { listId: "list-b" }, { entityId: "other" }]) {
    assert.equal(validateStagedPhotoReceipt({ ...valid, operation: { ...valid.operation, ...change } }, expected), false);
  }
  assert.equal(validateStagedPhotoReceipt({ ...valid, asset: { ...valid.asset, fileHash: "f".repeat(64) } }, expected), false);
  assert.equal(validateStagedPhotoReceipt({ ...valid, asset: { ...valid.asset, publication: "published" } }, expected), false);
  const lost = fixture(); lost.state.assetState = "unavailable";
  await assert.rejects(lost.staging.stage(lost.record.action.operationId), { isConfirmedAssetUnavailable: true });
  assert.equal(lost.transport.writes[0].confirmed, true); assert.equal(lost.posts().length, 1);
  const changed = fixture(); changed.state.beforeAck = () => { changed.context.actorId = "actor-b"; };
  await assert.rejects(changed.staging.stage(changed.record.action.operationId)); assert.equal(changed.posts().length, 1);
});
