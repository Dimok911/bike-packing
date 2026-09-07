import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createPersonalPhotoStaging, PERSONAL_PHOTO_STAGING_ENABLED, validateStagedPhotoReceipt,
  PERSONAL_PHOTO_CANCELLATION_ENABLED, validateCancelledStagedPhotoReceipt } from "../../src/sync/personal-photo-staging.js";

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
  const cancelled = () => ({ ok: true, operation: { ...proof().operation, state: "cancelled" }, cancellation: {
    version: 1, stageOperationId: record.stage.operationId, fileHash: digest, thumbHash: digest, noAssetPublished: true, stageCannotPublish: true } });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); assert.equal(options.credentials, "include"); assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
    let data;
    if (url.endsWith("/auth/me")) data = { user: { id: state.actor } };
    else if (url.endsWith("/capabilities")) data = { capabilities: state.capability ? ["personalStagedPhotoAssetsV1",
      ...(state.cancellationCapability === false ? [] : ["personalStagedPhotoCancellationV1"]),
      ...(state.formCapability ? ["personalCausalPhotoFormV1"] : [])] : [] };
    else if (url.endsWith("/cancel") && options.method === "POST") {
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), { expectedActorId: binding.actorId, environment: binding.environment,
        entityType: record.stage.entityType, entityId: record.stage.entityId, photoId: record.stage.photoId, fileHash: digest, thumbHash: digest });
      if (state.dropCancellation) throw Error("cancel never reached server");
      data = receipts.get(record.stage.operationId) || cancelled(); receipts.set(record.stage.operationId, data);
      state.beforeAck?.(); if (state.lose) throw Error("lost cancellation response");
    }
    else if (options.method === "POST") {
      assert.equal(options.body.get("operationId"), record.stage.operationId); assert.equal(options.body.get("expectedActorId"), binding.actorId);
      assert.equal(await options.body.get("file").text(), bytes); assert.equal(options.body.get("file").name, "photo.png");
      data = proof(); receipts.set(record.stage.operationId, data); state.beforeAck?.(); if (state.lose) throw Error("lost upload response");
    } else data = state.unknown ? null : receipts.get(record.stage.operationId);
    return new Response(JSON.stringify(data || { ok: true, operation: { id: record.stage.operationId, state: "unknown",
      environment: binding.environment, actorId: binding.actorId, listId: binding.listId } }), { status: 200 });
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" });
    return { transport, staging: createPersonalPhotoStaging({ store, transport, locks, fetchImpl, getContext: () => context, enabled: true, ...options }) };
  };
  return { ...make(), make, store, state, record, binding, context, values, storage, proof, cancelled, receipts, calls, posts: () => calls.filter(call => call.options.method === "POST") };
}

test("form staging needs whole-form authority before claiming or uploading and can inspect with that authority off", async () => {
  for (const mode of ["gate", "capability", "ready"]) {
    const f = fixture(); f.record.action.body = { action: "form" };
    f.store.readStage = async (id, stageId) => { assert.equal(stageId, f.record.stage.operationId); return f.store.read(id); };
    f.state.formCapability = mode !== "capability";
    const staging = f.make({ batchEnabled: true, formEnabled: mode !== "gate" }).staging;
    if (mode !== "ready") {
      await assert.rejects(staging.stage(f.record.action.operationId, f.record.stage.operationId));
      assert.equal(f.state.claimed, false); assert.equal(f.posts().length, 0);
    } else {
      f.state.lose = true;
      assert.equal((await staging.stage(f.record.action.operationId, f.record.stage.operationId)).asset.state, "ready");
      const readOnly = f.make({ enabled: false, batchEnabled: false, formEnabled: false }).staging;
      f.state.formCapability = false;
      assert.equal((await readOnly.inspect(f.record.action.operationId, f.record.stage.operationId)).historicalStageOnly, true);
      assert.equal(f.posts().length, 1);
    }
  }
});

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

test("stage cancellation needs its separate gate capability and actor before claiming or sending anything", async () => {
  assert.equal(PERSONAL_PHOTO_CANCELLATION_ENABLED, false);
  for (const reason of ["disabled", "capability", "actor", "missing"]) {
    const f = fixture();
    if (reason === "capability") f.state.cancellationCapability = false;
    if (reason === "actor") f.state.actor = "another-actor";
    if (reason === "missing") f.store.read = async () => null;
    await assert.rejects(f.make({ cancellationEnabled: reason !== "disabled" }).staging.cancel(f.record.action.operationId));
    assert.equal(f.posts().length, 0); assert.equal(f.state.claimed, false);
  }
});

test("explicit cancellation recovers a pre-dispatch claim and lost ACK without uploading, changing UUID or confirming the owner", async () => {
  const f = fixture(); f.state.afterClaim = () => { f.context.generation = "changed"; };
  await assert.rejects(f.staging.stage(f.record.action.operationId)); assert.equal(f.posts().length, 0);
  f.state.afterClaim = null; f.state.lose = true; f.state.unknown = true;
  await assert.rejects(f.make({ cancellationEnabled: true }).staging.cancel(f.record.action.operationId));
  assert.equal(f.posts().length, 1); assert.ok(f.posts()[0].url.endsWith("/cancel"));
  f.state.unknown = false;
  const next = f.make({ enabled: false, cancellationEnabled: true }), proof = await next.staging.cancel(f.record.action.operationId);
  assert.equal(proof.operation.state, "cancelled"); assert.equal(proof.asset, undefined); assert.equal(proof.historicalStageOnly, true);
  assert.equal(next.transport.writes[0].id, f.record.stage.operationId); assert.equal(next.transport.writes[0].confirmed, true);
  assert.equal(next.transport.writes.some(entry => entry.id === f.record.action.operationId), false);
  await assert.rejects(f.make().staging.stage(f.record.action.operationId), { isConfirmedStageCancellation: true, isAmbiguousMutation: false });
  assert.deepEqual(await f.make({ enabled: false }).staging.inspect(f.record.action.operationId), proof);
  assert.equal(f.posts().length, 1); assert.equal(await f.record.file.text(), "full photo bytes");
});

test("cancellation returns an already committed staging receipt unchanged instead of relabelling accepted bytes", async () => {
  const f = fixture(), accepted = await f.staging.stage(f.record.action.operationId);
  const result = await f.make({ cancellationEnabled: true }).staging.cancel(f.record.action.operationId);
  assert.deepEqual(result, accepted); assert.equal(result.cancellation, undefined); assert.equal(f.posts().length, 1);
});

test("only an exact no-publication proof settles cancellation; malformed proof or account change retains the frozen action", async () => {
  const f = fixture(); await f.make({ cancellationEnabled: true }).staging.cancel(f.record.action.operationId);
  const expected = f.make().transport.writes[0].recovery, good = f.cancelled();
  assert.equal(validateCancelledStagedPhotoReceipt(good, expected), true);
  for (const mutate of [p => p.operation.id = randomUUID(), p => p.operation.actorId = "other", p => p.operation.environment = "production",
    p => p.operation.entityId = "other", p => p.cancellation.stageOperationId = randomUUID(), p => p.cancellation.fileHash = "a".repeat(64),
    p => p.cancellation.stageCannotPublish = false, p => p.cancellation.noAssetPublished = false, p => p.asset = { state: "ready" }]) {
    const bad = structuredClone(good); mutate(bad); assert.equal(validateCancelledStagedPhotoReceipt(bad, expected), false);
  }
  const changed = fixture(); changed.state.beforeAck = () => { changed.context.actorId = "other"; };
  await assert.rejects(changed.make({ cancellationEnabled: true }).staging.cancel(changed.record.action.operationId));
  assert.equal(changed.posts().length, 1); assert.equal(changed.record.action.operationId.length, 36);
});

test("an explicitly repeated unknown cancellation fences the same immutable stage and never retries its original upload", async () => {
  const f = fixture(); f.state.dropCancellation = true;
  await assert.rejects(f.make({ cancellationEnabled: true }).staging.cancel(f.record.action.operationId));
  assert.equal(f.posts().length, 1, "no automatic POST after the unknown status lookup");
  f.state.dropCancellation = false;
  const proof = await f.make({ cancellationEnabled: true }).staging.cancel(f.record.action.operationId);
  assert.equal(proof.operation.state, "cancelled"); assert.equal(f.posts().length, 2);
  assert.equal(f.posts()[0].url, f.posts()[1].url); assert.equal(f.posts()[0].options.body, f.posts()[1].options.body);
  assert.ok(f.posts().every(call => call.url.endsWith("/cancel")));
  assert.equal(f.make().transport.writes.length, 1);
});

test("concurrent queues serialize stage and cancellation under the same lock with one terminal winner", async () => {
  for (const first of ["cancel", "stage"]) {
    const f = fixture(), left = f.make({ cancellationEnabled: true }).staging, right = f.make({ cancellationEnabled: true }).staging;
    const results = await Promise.allSettled([left[first](f.record.action.operationId), right[first === "cancel" ? "stage" : "cancel"](f.record.action.operationId)]);
    assert.equal(f.posts().length, 1);
    if (first === "cancel") {
      assert.equal(results[0].value.operation.state, "cancelled"); assert.equal(results[1].reason.isConfirmedStageCancellation, true);
      assert.ok(f.posts()[0].url.endsWith("/cancel"));
    } else {
      assert.equal(results[0].value.operation.state, "committed"); assert.deepEqual(results[1].value, results[0].value);
    }
  }
});
