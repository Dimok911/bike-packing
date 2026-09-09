import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue, canonicalListOperationJson, validateListReceipt, LIST_OPERATION_QUEUE_ENABLED,
  LIST_OPERATION_CANCELLATION_ENABLED } from "../../src/sync/list-operation-queue.js";
import { apiFetchRequest } from "../../src/sync/api-client.js";
import { syncEntityBatchWithRevisionRetry } from "../../src/sync/entity-sync.js";
import { assertListOperationPayload, MAX_LIST_OPERATION_PAYLOAD_BYTES } from "../../src/sync/list-operation-payload.js";
import { personalPhotoPublicationManifest, validatePersonalPhotoPublicationResult,
  PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED } from "../../src/sync/personal-photo-publication-protocol.js";
import { personalPhotoContainerFormContext } from "../../src/sync/personal-photo-container-form-context.js";
import { personalManufacturerSourceMetadata } from "../../src/sync/personal-manufacturer-photo-source.js";

const path = "/bike-packing/lists/list-a";
function fixture() {
  const values = new Map(), receipts = new Map(), calls = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const tails = new Map();
  const locks = { request(name, callback) {
    const run = (tails.get(name) || Promise.resolve()).catch(() => {}).then(callback);
    tails.set(name, run); return run;
  } };
  const context = { actorId: "actor-a", generation: "generation-1", scope: "personal" };
  const state = { loseResponse: false, unknown: false, revision: 1, deleted: false, mutate: null, rejection: null };
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "include");
    calls.push({ url, options });
    let data, status = 200;
    if (url.endsWith("/auth/me")) data = { user: { id: context.actorId } };
    else if (url.endsWith("/capabilities")) data = { capabilities: state.capabilities || ["personalListCausalOperationsV1"] };
    else if (url.endsWith("/freshness")) { status = state.deleted ? 404 : 200; data = { stateRevision: state.revision }; }
    else if (options.method === "POST") {
      const envelope = JSON.parse(options.body);
      assert.equal(envelope.expectedActorId, context.actorId);
      assert.equal(envelope.environment, "bike-packing-experiment");
      const expected = { environment: "bike-packing-experiment", actorId: context.actorId, kind: envelope.kind, listId: envelope.listId, body: envelope.body };
      const payloadDigest = createHash("sha256").update(canonicalListOperationJson(expected)).digest("hex");
      data = { ok: true, operation: { ...expected, id: envelope.operationId, payloadDigest, state: state.rejection ? "rejected" : "committed" },
        result: state.rejection || { status: 200, payload: { ok: true, list: { id: envelope.listId, stateRevision: 1 } } } };
      if (!state.rejection && state.payload) data.result.payload = structuredClone(state.payload);
      if (state.waiting) {
        data.operation.state = "waiting"; data.result = null;
        data.waiting = { code: "dependency_not_committed", retrySameOperation: true,
          operationIds: envelope.body.causal.dependsOn.map(dep => dep.operationId) };
      }
      receipts.set(envelope.operationId, data);
      state.mutate?.();
      if (state.loseResponse) throw Error("lost response");
    } else data = state.unknown ? { ok: true, operation: { state: "unknown" } }
      : receipts.get(url.split("/").at(-1)) || { ok: true, operation: { state: "unknown" } };
    return new Response(JSON.stringify(data), { status });
  };
  const make = () => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" });
    return { transport, queue: createListOperationQueue({ transport, getContext: () => ({ ...context }), enabled: true, photoEnabled: state.photoEnabled,
      photoFormEnabled: state.photoFormEnabled, itemContextEnabled: state.itemContextEnabled, containerContextEnabled: state.containerContextEnabled, manufacturerSourceEnabled: state.manufacturerSourceEnabled,
      migrationEnabled: state.migrationEnabled, locks, fetchImpl }) };
  };
  return { ...make(), make, state, context, storage, receipts, calls, values, locks, fetchImpl,
    input: { path, method: "PUT", body: JSON.stringify({ payload: { items: {} } }) },
    posts: () => calls.filter(call => call.options.method === "POST") };
}

test("list queue is release-gated; legacy API remains untouched when off", () => {
  assert.equal(LIST_OPERATION_QUEUE_ENABLED, false);
  const queue = createListOperationQueue({ transport: { experiment: true } });
  assert.equal(queue.supports(path, "PUT"), false);
});

test("reverse-delivered four-action chain does not let waiting descendants block their own ancestor after reload", async () => {
  const f = fixture(), actions = [];
  for (let i = 0; i < 4; i++) actions.push({ path, method: "PUT", receiptOnly: true, operationId: crypto.randomUUID(),
    body: JSON.stringify({ payload: { items: {} }, causal: { dependsOn: i ? [{ operationId: actions[i - 1].operationId, listId: "list-a" }] : [] } }) });
  f.state.waiting = true;
  for (const input of actions.slice(1).reverse()) await assert.rejects(f.make().queue.run(input), { isOperationWaiting: true });
  assert.equal(f.posts().length, 3, "every descendant reached the server as its exact waiting intent");
  f.state.waiting = false;
  for (const input of actions) assert.equal((await f.make().queue.run(input)).operation.state, "committed");
  const sent = f.posts().map(call => JSON.parse(call.options.body));
  assert.deepEqual(sent.map(row => row.operationId), [...actions.slice(1).reverse(), ...actions].map(row => row.operationId));
  for (const input of actions) {
    assert.ok(sent.filter(row => row.operationId === input.operationId).every(row => JSON.stringify(row.body) === input.body));
    await f.make().queue.run(input);
  }
  assert.equal(f.posts().length, 7, "terminal retries only read receipts");
});

test("transitive scheduling does not bypass an unknown receipt, sibling branch or missing/cross-list bridge", async () => {
  const input = (id, parent, listId = "list-a") => ({ path: `/bike-packing/lists/${listId}`, method: "PUT", receiptOnly: true, operationId: id,
    body: JSON.stringify({ payload: { items: {} }, causal: { dependsOn: parent ? [{ operationId: parent, listId }] : [] } }) });
  for (const bridge of ["missing", "other-list"]) {
    const f = fixture(), ids = Array.from({ length: 3 }, () => crypto.randomUUID()); f.state.waiting = true;
    await assert.rejects(f.make().queue.run(input(ids[2], ids[1])), { isOperationWaiting: true });
    if (bridge === "other-list") await assert.rejects(f.make().queue.run(input(ids[1], ids[0], "other-list")), { isOperationWaiting: true });
    const before = f.posts().length; f.state.waiting = false;
    await assert.rejects(f.make().queue.run(input(ids[0], null)), { isOperationWaiting: true });
    assert.equal(f.posts().length, before, "a missing same-list path cannot be invented from matching IDs");
  }
  const sibling = fixture(), parent = crypto.randomUUID(); sibling.state.waiting = true;
  await assert.rejects(sibling.make().queue.run(input(crypto.randomUUID(), parent)), { isOperationWaiting: true });
  await assert.rejects(sibling.make().queue.run(input(crypto.randomUUID(), parent)), { isOperationWaiting: true });
  assert.equal(sibling.posts().length, 1, "common ancestry does not serialize a fork");
  const f = fixture(), first = input(crypto.randomUUID(), null), second = input(crypto.randomUUID(), first.operationId), third = input(crypto.randomUUID(), second.operationId);
  f.state.waiting = true;
  await assert.rejects(f.make().queue.run(third), { isOperationWaiting: true });
  f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.make().queue.run(second)); assert.equal(f.posts().length, 2);
  f.state.waiting = false; f.state.loseResponse = false;
  assert.equal((await f.make().queue.run(first)).operation.state, "committed");
  await assert.rejects(f.make().queue.run(second)); assert.equal(f.posts().length, 3, "unknown never permits a blind resend");
  const changed = { ...second, body: JSON.stringify({ payload: { items: { changed: {} } } }) };
  await assert.rejects(f.make().queue.run(changed), /Номер действия/); assert.equal(f.posts().length, 3);
});

function migrationFixture() {
  const f = fixture(), payload = { locations: [], categories: [], containers: {}, items: {}, layouts: {} };
  Object.assign(f.context, { listId: "list-a", scopeKey: "id:actor-a", environment: "bike-packing-experiment" });
  f.state.migrationEnabled = true; f.state.revision = 2;
  f.state.capabilities = ["personalListCausalOperationsV1", "personalListInitialMigrationV1"];
  const migration = { version: 1, legacyPayloadHash: "a".repeat(64), projectedPayloadHash: createHash("sha256").update(canonicalListOperationJson(payload)).digest("hex") };
  f.input = { path: `${path}/migration`, method: "POST", operationId: crypto.randomUUID(), body: JSON.stringify({ baseStateRevision: 1, payload, migration, causal: { dependsOn: [], reads: [] } }) };
  f.state.payload = { ok: true, list: { id: "list-a", stateRevision: 2, payload }, migration };
  return f;
}

test("migration uses its frozen gateway envelope and reads the same receipt after lost ACK and reload", async () => {
  const f = migrationFixture(); f.state.loseResponse = true;
  const result = await f.make().queue.run(f.input); assert.equal(result.list.stateRevision, 2);
  assert.deepEqual(await f.make().queue.run(f.input), result); assert.equal(f.posts().length, 1);
  assert.equal(JSON.parse(f.posts()[0].options.body).kind, "list.migrate");
  assert.ok(f.posts()[0].url.endsWith("/list-operations"));
  const proof = await createListOperationQueue({ transport: f.make().transport, getContext: () => f.context,
    readOnly: true, locks: f.locks, fetchImpl: f.fetchImpl }).inspect(f.input);
  assert.equal(proof.operation.id, f.input.operationId); assert.equal(proof.operation.state, "committed"); assert.equal(f.posts().length, 1);
});

test("migration refuses missing capability, edited projection and incorrect context before registering a write", async () => {
  for (const change of [
    f => { f.state.capabilities = ["personalListCausalOperationsV1"]; },
    f => { const body = JSON.parse(f.input.body); body.payload.items.changed = {}; f.input.body = JSON.stringify(body); },
    f => { f.context.listId = "other"; }, f => { f.context.environment = "production"; },
    f => { f.state.migrationEnabled = false; }
  ]) {
    const f = migrationFixture(); change(f); await assert.rejects(f.make().queue.run(f.input));
    assert.equal(f.posts().length, 0); assert.equal(f.make().transport.writes.length, 0);
  }
});

test("migration with an unknown outcome never blindly resends or accepts a mismatched success projection", async () => {
  const f = migrationFixture(); f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.make().queue.run(f.input)); await assert.rejects(f.make().queue.run(f.input)); assert.equal(f.posts().length, 1);
  const data = f.receipts.get(f.input.operationId); data.result.payload.list.payload = { wrong: true }; f.state.unknown = false;
  await assert.rejects(f.make().queue.run(f.input)); assert.equal(f.posts().length, 1); assert.equal(Boolean(f.make().transport.writes[0].confirmed), false);
});

function cancellationFixture() {
  const f = fixture();
  Object.assign(f.context, { listId: "list-a", environment: "bike-packing-experiment", scopeKey: "id:actor-a" });
  f.input.operationId = crypto.randomUUID();
  f.state.capabilities = ["personalListCausalOperationsV1", "personalListOperationCancellationV1"];
  f.state.rejection = { status: 409, payload: { ok: false, code: "operation_cancelled", stateRevision: 1,
    cancellation: { version: 1, operationId: f.input.operationId, noBusinessEffects: true, operationCannotApply: true } } };
  const fetchImpl = async (url, options) => {
    if (options.method === "POST") assert.ok(url.endsWith(`/${f.input.operationId}/cancel`), "never execute the original mutation");
    const response = await f.fetchImpl(url, options), data = await response.json();
    if (data.operation?.state === "unknown") data.operation.id = url.split("/").at(-1);
    f.state.afterRead?.(url, data);
    return Response.json(data, { status: response.status });
  };
  const make = (options = {}) => { const { transport } = f.make(); return { transport,
    queue: createListOperationQueue({ transport, getContext: () => f.context, enabled: true, cancellationEnabled: true,
      locks: f.locks, fetchImpl, ...options }) }; };
  return { ...f, make };
}

test("exact cancellation is separately gated and impossible through the read-only queue", async () => {
  assert.equal(LIST_OPERATION_CANCELLATION_ENABLED, false);
  for (const options of [{ cancellationEnabled: false }, { enabled: false }, { readOnly: true }, { locks: null }]) {
    const f = cancellationFixture(); await assert.rejects(f.make(options).queue.cancelExact(f.input));
    assert.equal(f.posts().length, 0); assert.equal(f.values.size, 0);
  }
});

test("explicit cancellation retains the original UUID and frozen body across lost ACK and reload", async () => {
  const f = cancellationFixture(); f.state.loseResponse = true;
  const proof = await f.make().queue.cancelExact(f.input);
  assert.equal(proof.operation.id, f.input.operationId); assert.equal(proof.operation.state, "rejected");
  assert.equal(proof.rejectionCode, "operation_cancelled"); assert.equal(proof.historicalOnly, true);
  assert.deepEqual(await f.make().queue.cancelExact(f.input), proof);
  assert.deepEqual(await f.make().queue.inspect(f.input), proof);
  assert.equal(f.posts().length, 1); assert.equal(f.make().transport.writes[0].confirmed, true);
  assert.deepEqual(JSON.parse(f.posts()[0].options.body).body, JSON.parse(f.input.body));
  await assert.rejects(f.make().queue.cancelExact({ ...f.input, body: JSON.stringify({ payload: { items: { changed: {} } } }) }));
  assert.equal(f.posts().length, 1);
});

test("unknown cancellation ACK stays blocked and only another explicit cancellation retries the exact fence", async () => {
  const f = cancellationFixture(); f.state.unknown = true; f.state.loseResponse = true;
  await assert.rejects(f.make().queue.cancelExact(f.input));
  assert.equal(f.posts().length, 1); assert.equal(Boolean(f.make().transport.writes[0].confirmed), false);
  await assert.rejects(f.make().queue.cancelExact(f.input));
  assert.equal(f.posts().length, 2); assert.equal(f.posts()[0].options.body, f.posts()[1].options.body);
  f.state.unknown = false; assert.equal((await f.make().queue.cancelExact(f.input)).operation.state, "rejected");
  assert.equal(f.posts().length, 2);
});

test("prior terminal receipts win cancellation unchanged, including a save completed during the cancellation request", async () => {
  for (const kind of ["committed-before", "committed-race", "rejected-before"]) {
    const f = cancellationFixture(), body = JSON.parse(f.input.body);
    const binding = { environment: f.context.environment, actorId: f.context.actorId, kind: "list.update", listId: "list-a", body };
    const data = { ok: true, operation: { ...binding, id: f.input.operationId,
      payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex"), state: "committed" },
      result: { status: 200, payload: { ok: true, list: { id: "list-a", stateRevision: 1 } } } };
    if (kind === "rejected-before") { data.operation.state = "rejected"; data.result = { status: 409, payload: { ok: false, code: "stale_state_revision" } }; }
    if (kind === "committed-race") f.state.rejection = null;
    else f.receipts.set(f.input.operationId, data);
    const proof = await f.make().queue.cancelExact(f.input);
    assert.equal(proof.operation.state, kind === "rejected-before" ? "rejected" : "committed");
    assert.notEqual(proof.rejectionCode, "operation_cancelled"); assert.equal(f.posts().length, kind === "committed-race" ? 1 : 0);
  }
});

test("cancellation refuses changed scope, capability, auth and malformed no-effect proof without clearing the intent", async () => {
  for (const change of [f => f.context.environment = "production", f => f.context.scopeKey = "id:foreign",
    f => f.state.capabilities.pop(), f => f.state.afterRead = url => { if (url.endsWith("/auth/me")) f.context.generation = "changed"; },
    f => f.state.afterRead = (_url, data) => { if (data.user) data.user.id = "foreign"; }]) {
    const f = cancellationFixture(); change(f); await assert.rejects(f.make().queue.cancelExact(f.input)); assert.equal(f.posts().length, 0);
  }
  for (const change of [p => p.operationId = crypto.randomUUID(), p => p.noBusinessEffects = false,
    p => p.operationCannotApply = false, p => p.version = 2]) {
    const f = cancellationFixture(); change(f.state.rejection.payload.cancellation);
    await assert.rejects(f.make().queue.cancelExact(f.input)); assert.equal(f.posts().length, 1);
    assert.equal(Boolean(f.make().transport.writes[0].confirmed), false);
  }
});

function photoPublicationFixture() {
  const f = fixture();
  Object.assign(f.context, { environment: "bike-packing-experiment", listId: "list-a", scopeKey: "id:actor-a" });
  f.state.photoEnabled = true; f.state.capabilities = ["personalListCausalOperationsV1", "personalCausalPhotoPublicationV1"];
  const first = { version: 1, action: "attach", entityType: "item", entityId: "item-a", baseEntityRevision: 1,
    assetId: crypto.randomUUID(), photoId: "photo-a", expectedPhotoIds: [], index: 0 };
  const second = { ...first, assetId: crypto.randomUUID(), photoId: "photo-b", expectedPhotoIds: ["photo-a"], index: 0 };
  const body = { version: 1, action: "batch", changes: [first, second], baseStateRevision: 1, causal: { dependsOn: [], reads: [] } };
  const manifest = personalPhotoPublicationManifest(body);
  const photos = [first, second].map(change => ({ id: change.photoId, photoId: change.photoId, assetId: change.assetId,
    listId: "list-a", status: "synced", url: `https://example.test/${change.photoId}`, thumbUrl: `https://example.test/${change.photoId}/thumb` }));
  f.state.payload = { ok: true, stateRevision: 1, photoChanges: manifest.map((entry, index) => ({ ...entry, photo: photos[index] })),
    list: { id: "list-a", stateRevision: 1, payload: { items: { "item-a": { id: "item-a", photos: [...photos].reverse() } }, containers: {} } } };
  f.input = { path: `${path}/photos/mutate`, method: "POST", operationId: crypto.randomUUID(), body: JSON.stringify(body) };
  return { ...f, body };
}

function photoFormQueueFixture(created = false) {
  const f = photoPublicationFixture();
  f.state.photoFormEnabled = true; f.state.capabilities.push("personalCausalPhotoFormV1");
  Object.assign(f.body, { action: "form", entityType: "item", entityId: "item-a", baseEntityRevision: created ? 0 : 1,
    fields: { name: "Saved with both photos", note: "Same immutable action" } });
  for (const change of f.body.changes) change.baseEntityRevision = f.body.baseEntityRevision;
  Object.assign(f.state.payload.list.payload.items["item-a"], f.body.fields);
  f.state.payload.photoForm = { entityType: "item", entityId: "item-a", created };
  f.input.body = JSON.stringify(f.body);
  return f;
}

test("form queue separately gates publication and checks form capability before registering any write", async () => {
  for (const mode of ["gate", "capability"]) {
    const f = photoFormQueueFixture();
    if (mode === "gate") f.state.photoFormEnabled = false; else f.state.capabilities.pop();
    await assert.rejects(f.make().queue.run(f.input));
    assert.equal(f.posts().length, 0); assert.equal(f.make().transport.writes.length, 0);
  }
});

test("item form context needs its own gate and capability before registering a write, while exact receipt reads survive disabling it", async () => {
  for (const mode of ["gate", "capability", "lost ACK"]) {
    const f = photoFormQueueFixture();
    f.body.formContext = { version: 1, availabilityStatus: "broken", placement: null };
    f.state.payload.list.payload.items["item-a"].availabilityStatus = "broken";
    f.input.body = JSON.stringify(f.body);
    f.state.itemContextEnabled = mode !== "gate";
    if (mode !== "capability") f.state.capabilities.push("personalCausalPhotoItemFormContextV1");
    if (mode === "lost ACK") { f.state.loseResponse = true; f.state.unknown = true; }
    await assert.rejects(f.make().queue.run(f.input));
    if (mode !== "lost ACK") {
      assert.equal(f.posts().length, 0); assert.equal(f.make().transport.writes.length, 0); continue;
    }
    assert.equal(f.posts().length, 1); f.state.itemContextEnabled = false; f.state.unknown = false;
    const proof = await f.make().queue.inspect(f.input); assert.equal(proof.operation.state, "committed");
    assert.equal(proof.historicalOnly, true); assert.equal(f.posts().length, 1);
    delete f.receipts.get(f.input.operationId).result.payload.list.payload.items["item-a"].availabilityStatus;
    await assert.rejects(f.make().queue.inspect(f.input)); assert.equal(f.posts().length, 1);
  }
});

test("container form context checks its own capability before claim and rejects a receipt that omits the whole resulting layout", async () => {
  for (const mode of ["gate", "capability", "lost ACK"]) {
    const f = photoFormQueueFixture(); f.body.entityType = "container"; f.state.payload.photoForm.entityType = "container";
    for (const change of f.body.changes) change.entityType = "container";
    for (const change of f.state.payload.photoChanges) change.entityType = "container";
    f.state.payload.list.payload.containers = f.state.payload.list.payload.items; f.state.payload.list.payload.items = {};
    f.body.containerFormContext = { version: 1, targetLayout: { id: "layout", name: "Selected", rootContainerIds: [],
      arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} } }, sourceLayout: null,
      targetParentId: "", targetIndex: null, layoutFields: {} };
    f.state.payload.list.payload.layouts = { layout: personalPhotoContainerFormContext(f.body).layout };
    f.input.body = JSON.stringify(f.body); f.state.containerContextEnabled = mode !== "gate";
    if (mode !== "capability") f.state.capabilities.push("personalCausalPhotoContainerFormContextV1");
    if (mode === "lost ACK") { f.state.loseResponse = true; f.state.unknown = true; }
    await assert.rejects(f.make().queue.run(f.input));
    if (mode !== "lost ACK") { assert.equal(f.posts().length, 0); assert.equal(f.make().transport.writes.length, 0); continue; }
    assert.equal(f.posts().length, 1); f.state.containerContextEnabled = false; f.state.unknown = false;
    const proof = await f.make().queue.inspect(f.input); assert.equal(proof.operation.state, "committed"); assert.equal(proof.historicalOnly, true);
    delete f.receipts.get(f.input.operationId).result.payload.list.payload.layouts.layout;
    await assert.rejects(f.make().queue.inspect(f.input)); assert.equal(f.posts().length, 1);
  }
});

test("manufacturer forms require their own gate and capability and reject provenance loss in historical receipts", async () => {
  for (const mode of ["gate", "capability", "lost ACK"]) {
    const f = photoFormQueueFixture(true); f.body.entityType = "container"; f.state.payload.photoForm.entityType = "container";
    for (const change of f.body.changes) change.entityType = "container";
    for (const change of f.state.payload.photoChanges) change.entityType = "container";
    f.state.payload.list.payload.containers = f.state.payload.list.payload.items; f.state.payload.list.payload.items = {};
    f.body.manufacturerSource = { version: 1, entry: { id: "catalog-bag", imageUrl: "/one.jpg", volume: 3 }, imageUrls: ["/one.jpg"] };
    f.state.payload.list.payload.containers["item-a"].manufacturerCatalogSource = personalManufacturerSourceMetadata(f.body.manufacturerSource);
    f.input.body = JSON.stringify(f.body); f.state.manufacturerSourceEnabled = mode !== "gate";
    if (mode !== "capability") f.state.capabilities.push("personalCausalManufacturerPhotoFormV1");
    if (mode === "lost ACK") { f.state.loseResponse = true; f.state.unknown = true; }
    await assert.rejects(f.make().queue.run(f.input));
    if (mode !== "lost ACK") { assert.equal(f.posts().length, 0); assert.equal(f.make().transport.writes.length, 0); continue; }
    assert.equal(f.posts().length, 1); f.state.manufacturerSourceEnabled = false; f.state.unknown = false;
    assert.equal((await f.make().queue.inspect(f.input)).historicalOnly, true); assert.equal(f.posts().length, 1);
    delete f.receipts.get(f.input.operationId).result.payload.list.payload.containers["item-a"].manufacturerCatalogSource;
    await assert.rejects(f.make().queue.inspect(f.input)); assert.equal(f.posts().length, 1);
  }
});

test("new and edited form lost ACKs recover exact fields and photos with gates off for read-only settlement", async () => {
  for (const created of [false, true]) {
    const f = photoFormQueueFixture(created); f.state.loseResponse = true; f.state.unknown = true;
    await assert.rejects(f.make().queue.run(f.input)); assert.equal(f.posts().length, 1);
    f.state.unknown = false;
    const reader = () => createListOperationQueue({ transport: f.make().transport, getContext: () => f.context,
      readOnly: true, enabled: false, photoEnabled: false, photoFormEnabled: false, locks: f.locks, fetchImpl: f.fetchImpl });
    const proof = await reader().inspect(f.input);
    assert.equal(proof.operation.state, "committed"); assert.equal(proof.historicalOnly, true);
    await reader().inspect(f.input); await f.make().queue.run(f.input);
    assert.equal(f.posts().length, 1);
    assert.deepEqual(JSON.parse(f.posts()[0].options.body).body, f.body);
    const receipt = f.receipts.get(f.input.operationId), good = structuredClone(receipt);
    for (const mutate of [r => { delete r.result.payload.photoForm; }, r => { r.result.payload.photoForm.created = !created; },
      r => { r.result.payload.list.payload.items["item-a"].name = "Old title"; }, r => { r.result.payload.photoChanges.pop(); }]) {
      const wrong = structuredClone(good); mutate(wrong); f.receipts.set(f.input.operationId, wrong);
      await assert.rejects(reader().inspect(f.input)); assert.equal(f.posts().length, 1);
    }
  }
});

function cancelledPhotoFixture() {
  const f = photoPublicationFixture(), body = { ...f.body.changes[0], baseStateRevision: 1, causal: { dependsOn: [], reads: [] } };
  f.input.body = JSON.stringify(body); f.input.fileHash = "a".repeat(64); f.input.thumbHash = "b".repeat(64);
  f.state.capabilities.push("personalStagedPhotoCancellationV1");
  f.state.rejection = { status: 409, payload: { ok: false, code: "photo_asset_not_ready", stateRevision: 1 } };
  const stage = { ok: true, operation: { id: body.assetId, state: "cancelled", environment: f.context.environment,
    actorId: f.context.actorId, listId: "list-a", entityId: body.entityId, entityType: body.entityType, photoId: body.photoId, payloadDigest: "c".repeat(64) },
    cancellation: { version: 1, stageOperationId: body.assetId, fileHash: f.input.fileHash, thumbHash: f.input.thumbHash, noAssetPublished: true, stageCannotPublish: true } };
  const fetchImpl = async (url, options) => {
    if (url.includes("/photo-assets/")) { f.calls.push({ url, options }); f.state.stageRead?.(); return Response.json(stage); }
    const response = await f.fetchImpl(url, options), data = await response.json();
    if (data.operation?.state === "unknown" && !data.operation.id) data.operation.id = url.split("/").at(-1);
    return Response.json(data, { status: response.status });
  };
  const make = () => { const { transport } = f.make(); return { transport,
    queue: createListOperationQueue({ transport, enabled: true, photoEnabled: f.state.photoEnabled, getContext: () => f.context, locks: f.locks, fetchImpl }) }; };
  return { ...f, body, stage, make };
}

test("cancelled staged photo terminalizes only its original owner UUID and recovers a lost rejection ACK by exact GET", async () => {
  const f = cancelledPhotoFixture(); f.state.loseResponse = true;
  const first = await f.make().queue.settleCancelledPhotoStage(f.input);
  assert.equal(first.operation.state, "rejected"); assert.equal(first.operation.id, f.input.operationId);
  assert.equal(first.rejectionCode, "photo_asset_not_ready"); assert.equal(first.historicalOnly, true);
  assert.equal(f.posts().length, 1); assert.equal(JSON.parse(f.posts()[0].options.body).body.assetId, f.body.assetId);
  assert.deepEqual(await f.make().queue.settleCancelledPhotoStage(f.input), first);
  assert.equal(f.posts().length, 1); assert.equal(f.make().transport.writes[0].confirmed, true);
  assert.equal(f.make().transport.writes[0].recovery.body, undefined);
});

test("no-effect photo settlement refuses missing scope hashes cancellation proof gates and a changed editor before POST", async () => {
  for (const change of [f => f.stage.operation.state = "unknown", f => f.stage.operation.id = crypto.randomUUID(),
    f => f.stage.cancellation.fileHash = "d".repeat(64), f => f.stage.cancellation.stageCannotPublish = false,
    f => f.stage.asset = { state: "ready" }, f => f.context.environment = "production",
    f => f.state.photoEnabled = false, f => f.state.capabilities.pop(),
    f => f.state.stageRead = () => { f.context.generation = "different"; }]) {
    const f = cancelledPhotoFixture(); change(f);
    await assert.rejects(f.make().queue.settleCancelledPhotoStage(f.input)); assert.equal(f.posts().length, 0);
  }
});

test("photo no-effect settlement cannot claim a committed owner rejected and will not rewrite a different action", async () => {
  const f = cancelledPhotoFixture(); await f.make().queue.settleCancelledPhotoStage(f.input);
  const original = structuredClone(f.receipts.get(f.input.operationId));
  f.receipts.get(f.input.operationId).operation.state = "committed";
  await assert.rejects(f.make().queue.settleCancelledPhotoStage(f.input));
  f.receipts.set(f.input.operationId, original);
  await assert.rejects(f.make().queue.settleCancelledPhotoStage({ ...f.input, body: JSON.stringify({ ...f.body, index: 1 }) }));
  assert.equal(f.posts().length, 1);
});

test("an unknown no-effect ACK remains unresolved; an explicit same-body retry never creates a new UUID or upload", async () => {
  const f = cancelledPhotoFixture(); f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.make().queue.settleCancelledPhotoStage(f.input)); assert.equal(f.posts().length, 1);
  assert.equal(Boolean(f.make().transport.writes[0].confirmed), false);
  await assert.rejects(f.make().queue.settleCancelledPhotoStage(f.input)); assert.equal(f.posts().length, 2);
  assert.deepEqual(f.posts()[0].options.body, f.posts()[1].options.body);
  f.state.unknown = false;
  assert.equal((await f.make().queue.settleCancelledPhotoStage(f.input)).operation.state, "rejected");
  assert.equal(f.posts().length, 2);
});

test("read-only queue verifies historical photo proof with all writer gates off and cannot run either settlement writer", async () => {
  const f = cancelledPhotoFixture(), proof = await f.make().queue.settleCancelledPhotoStage(f.input), count = f.posts().length;
  const readOnly = createListOperationQueue({ transport: f.make().transport, readOnly: true, enabled: false, photoEnabled: false,
    getContext: () => f.context, locks: f.locks, fetchImpl: f.fetchImpl });
  assert.deepEqual(await readOnly.inspect(f.input), proof);
  assert.equal(readOnly.supports(f.input.path, f.input.method), false);
  await assert.rejects(readOnly.run(f.input));
  await assert.rejects(readOnly.settleCancelledPhotoStage(f.input));
  await assert.rejects(readOnly.settleRejectedDependency(f.input));
  assert.equal(f.posts().length, count);
});

test("photo mutation queue needs its separate release gate and server capability before durable dispatch", async () => {
  assert.equal(PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED, false);
  const f = photoPublicationFixture();
  assert.equal(f.queue.supports(f.input.path, "POST"), false);
  f.state.photoEnabled = false; assert.equal(f.make().queue.supports(f.input.path, "POST"), false);
  f.state.photoEnabled = true; f.state.capabilities = ["personalListCausalOperationsV1"];
  await assert.rejects(f.make().queue.run(f.input));
  assert.equal(f.posts().length, 0); assert.equal(f.transport.writes.length, 0);
  f.state.capabilities.push("personalCausalPhotoPublicationV1");
  const malformed = structuredClone(f.body); malformed.changes[1].expectedPhotoIds = [];
  await assert.rejects(f.make().queue.run({ ...f.input, body: JSON.stringify(malformed) }), { isOperationPreflightError: true });
  assert.equal(f.posts().length, 0); assert.equal(f.transport.writes.length, 0);
});

test("photo batch lost ACK and reload confirm every child and recover a compact terminal transport record without re-POST", async () => {
  const f = photoPublicationFixture(); f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.make().queue.run(f.input)); assert.equal(f.posts().length, 1);
  f.state.unknown = false;
  assert.deepEqual(await f.make().queue.run(f.input), f.state.payload);
  assert.equal(f.make().transport.writes[0].recovery.body, undefined, "confirmed transport does not retain another manifest copy");
  assert.deepEqual(await f.make().queue.run(f.input), f.state.payload); assert.equal(f.posts().length, 1);
  const proof = await f.make().queue.inspect(f.input); assert.equal(proof.historicalOnly, true);
  assert.equal(proof.operation.kind, "photos.mutate"); assert.equal(proof.stateRevision, 1); assert.equal(proof.list, undefined);
  f.state.revision = 2;
  await assert.rejects(f.make().queue.run(f.input), { isAmbiguousMutation: true });
  assert.equal((await f.make().queue.inspect(f.input)).historicalOnly, true); assert.equal(f.posts().length, 1);
});

test("photo receipt rejects partial wrong-owner wrong-asset and inconsistent final order without releasing the write barrier", async () => {
  const f = photoPublicationFixture(), expected = { listId: "list-a", body: f.body };
  assert.equal(validatePersonalPhotoPublicationResult(f.state.payload, expected), true);
  for (const mutate of [p => p.photoChanges.pop(), p => p.photoChanges.reverse(), p => p.photoChanges[1].entityId = "other",
    p => p.photoChanges[1].assetId = crypto.randomUUID(), p => p.photoChanges[1].photo.assetId = crypto.randomUUID(),
    p => p.photoChanges[1].photoIds.reverse(), p => p.list.payload.items["item-a"].photos.reverse(),
    p => p.list.payload.items["item-a"].photos[0].url = "different", p => p.list.id = "other", p => p.stateRevision++,
    p => p.photoChanges.push(p.photoChanges[0]), p => delete p.list.payload]) {
    const altered = JSON.parse(JSON.stringify(f.state.payload)); mutate(altered);
    assert.equal(validatePersonalPhotoPublicationResult(altered, expected), false);
  }
  const good = structuredClone(f.state.payload); f.state.payload.photoChanges.pop();
  await assert.rejects(f.make().queue.run(f.input)); assert.equal(f.make().transport.writes[0].confirmed, undefined);
  f.receipts.get(f.input.operationId).result.payload = good;
  assert.deepEqual(await f.make().queue.run(f.input), good); assert.equal(f.posts().length, 1);
});

test("photo manifests preserve ordered delete/copy changes and reject ambiguous child dependencies or identity reuse", () => {
  const f = photoPublicationFixture();
  for (const mutate of [b => b.changes[1].photoId = b.changes[0].photoId, b => b.changes[1].assetId = b.changes[0].assetId,
    b => b.changes[1].baseEntityRevision++, b => b.changes[0].causal = {}, b => b.changes[0].baseStateRevision = 1,
    b => b.changes[0].force = true, b => b.changes = [], b => b.changes[0].index = 4]) {
    const altered = structuredClone(f.body); mutate(altered);
    assert.throws(() => personalPhotoPublicationManifest(altered), { isOperationPreflightError: true });
  }
  const remove = { ...f.body.changes[0], action: "delete", expectedPhotoIds: ["photo-a", "other"], basePhotoRevision: 2 };
  assert.deepEqual(personalPhotoPublicationManifest(remove)[0].photoIds, ["other"]);
  const copy = { ...f.body.changes[0], action: "copy", source: { listId: "source", photoId: "original", assetId: crypto.randomUUID(), photoRevision: 9 } };
  assert.deepEqual(personalPhotoPublicationManifest(copy)[0].photoIds, ["photo-a"]);
  copy.source.photoRevision = 0; assert.throws(() => personalPhotoPublicationManifest(copy));
  const order = { ...remove, action: "order", photoIds: ["other", "photo-a"] };
  assert.deepEqual(personalPhotoPublicationManifest(order)[0].photoIds, order.photoIds);
});

test("history restore has a separate gateway kind and exact receipt recovery without a second POST", async () => {
  const f = fixture();
  const input = { path: "/bike-packing/lists/list-a/restore", method: "POST", body: JSON.stringify({ payload: { items: {} }, historyRestore: { historyId: 10 } }) };
  f.state.loseResponse = true;
  const accepted = await f.queue.run(input);
  assert.equal(accepted.list.id, "list-a"); assert.equal(f.posts().length, 1);
  const envelope = JSON.parse(f.posts()[0].options.body); assert.equal(envelope.kind, "list.restore");
  assert.deepEqual(await f.make().queue.run(input), accepted); assert.equal(f.posts().length, 1);
  const saved = f.receipts.get(envelope.operationId);
  assert.equal(validateListReceipt(saved, { operationId: envelope.operationId, actorId: "actor-a", kind: "list.restore", listId: "list-a", payloadDigest: saved.operation.payloadDigest }), true);
  const tampered = structuredClone(saved); tampered.result.payload.list.id = "other";
  assert.equal(validateListReceipt(tampered, { operationId: envelope.operationId, actorId: "actor-a", kind: "list.restore", listId: "list-a", payloadDigest: saved.operation.payloadDigest }), false);
});

test("operation preflight counts the complete UTF-8 binding at the exact API limit", () => {
  const binding = { actorId: "actor-a", kind: "list.update", listId: "list-a", body: { value: "" } };
  const available = MAX_LIST_OPERATION_PAYLOAD_BYTES - assertListOperationPayload(binding);
  binding.body.value = "я".repeat(Math.floor(available / 2)) + "x".repeat(available % 2);
  assert.equal(assertListOperationPayload(binding), MAX_LIST_OPERATION_PAYLOAD_BYTES);
  binding.body.value += "x";
  assert.throws(() => assertListOperationPayload(binding), { code: "payload-size", isOperationPreflightError: true });
  for (const value of [undefined, NaN, new Date(), { value: Infinity }]) {
    assert.throws(() => assertListOperationPayload({ ...binding, body: { value } }), { code: "payload-shape" });
  }
  let nested = null;
  for (let i = 0; i < 101; i++) nested = { nested };
  assert.throws(() => assertListOperationPayload({ ...binding, body: { nested } }), { code: "payload-shape" });
});

test("oversized new requests never become ambiguous writes or reach the mutation endpoint", async () => {
  const f = fixture(), before = [...f.values];
  await assert.rejects(f.queue.run({ ...f.input, body: JSON.stringify({ payload: { notes: "🚲".repeat(800000) } }) }),
    error => error.code === "payload-size" && error.isOperationPreflightError && !error.isAmbiguousMutation);
  assert.equal(f.posts().length, 0); assert.equal(f.transport.writes.length, 0);
  assert.deepEqual([...f.values], before);
});

async function rejectedDependencyFixture() {
  const f = fixture();
  const predecessor = { ...f.input, operationId: crypto.randomUUID() };
  f.state.rejection = { status: 409, payload: { ok: false, code: "stale_state_revision", stateRevision: 1 } };
  await assert.rejects(f.queue.run(predecessor), { isConfirmedOperationRejection: true });
  f.state.rejection = { status: 409, payload: { ok: false, code: "dependency_rejected", stateRevision: 1 } };
  const input = { ...f.input, operationId: crypto.randomUUID(), predecessor, body: JSON.stringify({ payload: { items: {} },
    causal: { baseOperationId: predecessor.operationId, dependsOn: [{ operationId: predecessor.operationId, listId: "list-a" }], reads: [] } }) };
  return { ...f, predecessor, input };
}

test("rejected-dependency settlement freezes the exact child, obtains a no-effect receipt and is GET-only on replay", async () => {
  const f = await rejectedDependencyFixture(), before = f.posts().length;
  const result = await f.queue.settleRejectedDependency(f.input);
  assert.equal(result.historicalOnly, true); assert.equal(result.rejectionCode, "dependency_rejected");
  assert.equal(f.posts().length - before, 1);
  assert.deepEqual(JSON.parse(f.posts().at(-1).options.body).body, JSON.parse(f.input.body));
  await f.make().queue.settleRejectedDependency(f.input);
  assert.equal(f.posts().length - before, 1);
});

test("a rejected photo form can terminalize its exact DB child only with both photo gates and matching rejection proof", async () => {
  for (const mode of ["enabled", "photo-off", "form-off", "committed", "unknown", "changed-body"]) {
    const f = fixture(); f.state.photoEnabled = true; f.state.photoFormEnabled = true;
    Object.assign(f.context, { environment: "bike-packing-experiment", listId: "list-a", scopeKey: "id:actor-a" });
    f.state.capabilities = ["personalListCausalOperationsV1", "personalCausalPhotoPublicationV1", "personalCausalPhotoFormV1"];
    const predecessor = { path: `${path}/photos/mutate`, method: "POST", operationId: crypto.randomUUID(),
      body: JSON.stringify({ version: 1, action: "form", entityType: "item", entityId: "item", baseStateRevision: 1, baseEntityRevision: 1,
        fields: { name: "Frozen form" }, changes: [{ version: 1, action: "delete", entityType: "item", entityId: "item", baseEntityRevision: 1,
          basePhotoRevision: 1, expectedPhotoIds: ["photo"], photoId: "photo", assetId: crypto.randomUUID() }] }) };
    f.state.rejection = { status: 409, payload: { ok: false, code: "stale_photo_owner_revision", stateRevision: 1 } };
    await assert.rejects(f.make().queue.run(predecessor), { isConfirmedOperationRejection: true });
    const input = { ...f.input, operationId: crypto.randomUUID(), predecessor, body: JSON.stringify({ payload: { items: {}, containers: {} },
      userDeletion: { type: "item", id: "item" }, causal: { baseOperationId: predecessor.operationId,
        dependsOn: [{ operationId: predecessor.operationId, listId: "list-a" }], reads: [] } }) };
    if (mode === "photo-off") f.state.photoEnabled = false;
    if (mode === "form-off") f.state.photoFormEnabled = false;
    if (mode === "committed") f.receipts.get(predecessor.operationId).operation.state = "committed";
    if (mode === "unknown") f.receipts.delete(predecessor.operationId);
    if (mode === "changed-body") { const body = JSON.parse(predecessor.body); body.fields.name = "Changed"; predecessor.body = JSON.stringify(body); }
    f.state.rejection = { status: 409, payload: { ok: false, code: "dependency_rejected", stateRevision: 1 } };
    const before = f.posts().length;
    if (mode !== "enabled") {
      await assert.rejects(f.make().queue.settleRejectedDependency(input)); assert.equal(f.posts().length, before, mode);
    } else {
      const proof = await f.make().queue.settleRejectedDependency(input);
      assert.equal(proof.rejectionCode, "dependency_rejected"); assert.equal(f.posts().length, before + 1);
      await f.make().queue.settleRejectedDependency(input); assert.equal(f.posts().length, before + 1);
    }
  }
});

test("lost form cancellation ACK never permits resuming the business POST from a waiting receipt", async () => {
  const f = fixture(); f.state.photoEnabled = true; f.state.photoFormEnabled = true;
  Object.assign(f.context, { environment: "bike-packing-experiment", listId: "list-a", scopeKey: "id:actor-a" });
  f.state.capabilities = ["personalListCausalOperationsV1", "personalListOperationCancellationV1", "personalCausalPhotoPublicationV1", "personalCausalPhotoFormV1"];
  const parentId = crypto.randomUUID(), operationId = crypto.randomUUID();
  const input = { path: `${path}/photos/mutate`, method: "POST", operationId,
    body: JSON.stringify({ version: 1, action: "form", entityType: "item", entityId: "item", baseStateRevision: 1, baseEntityRevision: 1,
      causal: { baseOperationId: parentId, dependsOn: [{ operationId: parentId, listId: "list-a" }], reads: [] }, fields: { name: "Frozen" },
      changes: [{ version: 1, action: "attach", entityType: "item", entityId: "item", baseEntityRevision: 1,
        expectedPhotoIds: [], photoId: "photo", assetId: crypto.randomUUID(), index: 0 }] }) };
  const fetchImpl = async (url, options) => {
    const response = await f.fetchImpl(url, options);
    if (options.method === "GET" && url.endsWith(`/list-operations/${operationId}`) && f.state.unknown) {
      return new Response(JSON.stringify({ ok: true, operation: { id: operationId, state: "unknown",
        actorId: "actor-a", environment: "bike-packing-experiment", listId: "list-a" } }));
    }
    return response;
  };
  const make = () => createListOperationQueue({ transport: f.make().transport, getContext: () => f.context, locks: f.locks,
    fetchImpl, enabled: true, photoEnabled: true, photoFormEnabled: true, cancellationEnabled: true });
  f.state.waiting = true; f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(make().cancelExact(input));
  assert.equal(f.make().transport.writes.find(entry => entry.id === operationId).recovery.cancellationOnly, true);
  f.state.loseResponse = false; f.state.unknown = false;
  await assert.rejects(make().run(input), { isOperationWaiting: true });
  assert.equal(f.posts().length, 1); assert.ok(f.posts()[0].url.endsWith(`/${operationId}/cancel`));
  f.state.waiting = false;
  f.state.rejection = { status: 409, payload: { ok: false, code: "operation_cancelled", stateRevision: 1,
    cancellation: { version: 1, operationId, noBusinessEffects: true, operationCannotApply: true } } };
  const proof = await make().cancelExact(input);
  assert.equal(proof.operation.state, "rejected"); assert.equal(f.posts().length, 2);
  await assert.rejects(make().run(input), { isConfirmedOperationRejection: true });
  assert.equal(f.posts().length, 2); assert.ok(f.posts().every(post => post.url.endsWith(`/${operationId}/cancel`)));
});

test("rejected-dependency settlement can finish an unknown exact child after lost ACK without replacing its ID", async () => {
  const f = await rejectedDependencyFixture();
  f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(f.input));
  f.state.unknown = false; f.receipts.delete(f.input.operationId);
  const before = f.posts().length;
  const proof = await f.make().queue.settleRejectedDependency(f.input);
  assert.equal(proof.operation.id, f.input.operationId); assert.equal(f.posts().length - before, 1);
  assert.equal(f.posts().at(-1).options.body, f.posts().at(-2).options.body);
  assert.equal(proof.operation.state, "rejected");
});

test("unknown/committed/wrong parent and unrelated or changed child manifests never permit terminalization POST", async () => {
  for (const failure of ["unknown", "committed", "hash", "actor", "list", "no-edge", "different-edge", "changed-body", "confirmed-unknown"]) {
    const f = await rejectedDependencyFixture();
    const receipt = f.receipts.get(f.predecessor.operationId);
    if (failure === "unknown") f.receipts.delete(f.predecessor.operationId);
    if (failure === "committed") receipt.operation.state = "committed";
    if (failure === "hash") receipt.operation.payloadDigest = "0".repeat(64);
    if (failure === "actor") receipt.operation.actorId = "other";
    if (failure === "list") receipt.operation.listId = "other";
    if (failure === "no-edge") f.input.body = JSON.stringify({ payload: {} });
    if (failure === "different-edge") { const body = JSON.parse(f.input.body); body.causal.dependsOn[0].listId = "other"; f.input.body = JSON.stringify(body); }
    if (failure === "changed-body" || failure === "confirmed-unknown") {
      await f.queue.settleRejectedDependency(f.input);
      if (failure === "changed-body") { const body = JSON.parse(f.input.body); body.payload.changed = true; f.input.body = JSON.stringify(body); }
      else f.receipts.delete(f.input.operationId);
    }
    const before = f.posts().length;
    await assert.rejects(f.make().queue.settleRejectedDependency(f.input), undefined, failure);
    assert.equal(f.posts().length, before, failure);
  }
});

test("queue freezes a mutable context reference and blocks changed scope/list before dispatch", async () => {
  for (const key of ["actorId", "generation", "scope", "scopeKey", "listId", "environment"]) {
    const f = fixture(); f.context.scopeKey = "id:actor-a"; f.context.listId = "list-a"; f.context.environment = "bike-packing-experiment";
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, getContext: () => f.context,
      fetchImpl: f.fetchImpl, locks: { request: async (name, callback) => { f.context[key] = "changed"; return callback(); } } });
    await assert.rejects(queue.run(f.input)); assert.equal(f.posts().length, 0, key);
  }
});

test("context changes during a waiting receipt GET or failed-parent GET block every follow-up POST", async () => {
  for (const mode of ["waiting", "rejected-parent"]) {
    const f = mode === "waiting" ? fixture() : await rejectedDependencyFixture();
    f.context.listId = "list-a";
    let target;
    if (mode === "waiting") {
      f.state.waiting = true;
      f.input.operationId = crypto.randomUUID();
      f.input.body = JSON.stringify({ payload: {}, causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }], reads: [] } });
      await assert.rejects(f.queue.run(f.input), { isOperationWaiting: true });
      target = f.input.operationId;
    } else target = f.predecessor.operationId;
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks, getContext: () => f.context,
      fetchImpl: async (url, options) => {
        const response = await f.fetchImpl(url, options);
        if (url.endsWith(target)) f.context.listId = "changed";
        return response;
      } });
    const before = f.posts().length;
    await assert.rejects(mode === "waiting" ? queue.run(f.input) : queue.settleRejectedDependency(f.input));
    assert.equal(f.posts().length, before, mode);
  }
});

test("durable intent before send; lost ACK recovered by GET; reload of acknowledged action never POSTs again", async () => {
  const f = fixture(); f.state.loseResponse = true;
  const originalFetch = f.fetchImpl;
  const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks, getContext: () => ({ ...f.context }), fetchImpl: async (url, options) => {
    if (options.method === "POST") {
      const id = JSON.parse(options.body).operationId;
      const stored = f.transport.writes.find(entry => entry.id === id);
      assert.deepEqual(stored.recovery.body, JSON.parse(f.input.body));
    }
    return originalFetch(url, options);
  } });
  assert.equal((await queue.run(f.input)).list.id, "list-a");
  const firstId = f.transport.writes[0].id;
  assert.equal(f.transport.writes[0].confirmed, true);
  assert.equal(f.transport.writes[0].recovery.body, undefined, "do not retain large confirmed request bodies");
  assert.equal(f.transport.writes[0].receipt.result, undefined, "full state is read from the server when replaying");
  await f.make().queue.run(f.input);
  assert.equal(f.posts().length, 1); assert.equal(f.transport.writes[0].id, firstId);
});

test("unknown result blocks replay and new generations; pending intent survives reload", async () => {
  const f = fixture(); f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(f.input), { isAmbiguousMutation: true });
  f.context.generation = "generation-2";
  await assert.rejects(f.make().queue.run(f.input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1); assert.ok(f.transport.uncertainWrite);
});

test("explicit action ID survives editor generation changes and rejects changed inputs without POST", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  await f.queue.run(input);
  f.context.generation = "later editor generation";
  await f.make().queue.run(input);
  assert.equal(f.posts().length, 1);
  await assert.rejects(f.make().queue.run({ ...input, body: JSON.stringify({ payload: { different: true } }) }), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1);
});

test("receipt-only scheduler settlement does not return a stale business payload or bypass normal freshness", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  await f.queue.run(input); f.state.revision = 2;
  const proof = await f.make().queue.run({ ...input, receiptOnly: true });
  assert.equal(proof.operation.state, "committed"); assert.equal(proof.list, undefined);
  await assert.rejects(f.make().queue.run(input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1);
});

test("historical inspection is GET-only even after server advancement or deletion and returns no payload", async () => {
  for (const change of [{ revision: 20 }, { deleted: true }]) {
    const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
    await f.queue.run(input); Object.assign(f.state, change);
    f.calls.length = 0;
    const proof = await f.make().queue.inspect(input);
    assert.equal(proof.operation.id, input.operationId);
    assert.equal(proof.operation.state, "committed");
    assert.equal(proof.stateRevision, 1);
    assert.equal(proof.historicalOnly, true);
    assert.equal(proof.result, undefined);
    assert.equal(proof.operation.body, undefined);
    assert.equal(f.calls.every(call => call.options.method === "GET"), true);
    assert.equal(f.calls.some(call => call.url.endsWith("/freshness")), false);
    await assert.rejects(f.make().queue.run(input), { isAmbiguousMutation: true });
    assert.equal(f.posts().length, 0);
  }
});

test("historical rejection can be settled without applying its obsolete conflict snapshot", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  f.state.rejection = { status: 409, payload: { ok: false, code: "stale_state_revision", stateRevision: 1,
    serverPayload: { privateHistoricalState: true } } };
  await assert.rejects(f.queue.run(input), { isConfirmedOperationRejection: true });
  f.state.revision = 20; f.calls.length = 0;
  const proof = await f.make().queue.inspect(input);
  assert.equal(proof.operation.state, "rejected");
  assert.equal(proof.resultStatus, 409);
  assert.equal(proof.rejectionCode, "stale_state_revision");
  assert.equal(JSON.stringify(proof).includes("privateHistoricalState"), false);
  await assert.rejects(f.make().queue.run(input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 0);
});

test("historical inspection validates a durable action even without a transport mirror, never registering or sending it", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  await f.queue.run(input);
  f.values.clear(); f.calls.length = 0;
  const reloaded = f.make();
  assert.equal((await reloaded.queue.inspect(input)).operation.id, input.operationId);
  assert.equal(f.posts().length, 0);
  assert.equal(reloaded.transport.writes.length, 0);
  await assert.rejects(reloaded.queue.inspect({ ...input, body: JSON.stringify({ payload: { changed: true } }) }), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 0);
});

test("unknown, waiting and mismatched historical receipts never resume or release an uncertain intent", async () => {
  for (const defect of ["unknown", "waiting", "actorId", "environment", "kind", "listId", "id", "payloadDigest", "status"]) {
    const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID(),
      body: JSON.stringify({ payload: { items: {} }, causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }] } }) };
    f.state.loseResponse = true; f.state.unknown = true;
    await assert.rejects(f.queue.run(input), { isAmbiguousMutation: true });
    f.state.unknown = defect === "unknown";
    const receipt = f.receipts.get(input.operationId);
    if (defect === "waiting") {
      receipt.operation.state = "waiting"; receipt.result = null;
      receipt.waiting = { code: "dependency_not_committed", retrySameOperation: true,
        operationIds: JSON.parse(input.body).causal.dependsOn.map(dep => dep.operationId) };
    } else if (defect === "status") receipt.result.status = 409;
    else if (defect !== "unknown") receipt.operation[defect] = "wrong";
    const before = JSON.stringify(f.transport.writes);
    await assert.rejects(f.make().queue.inspect(input), { isAmbiguousMutation: true });
    assert.equal(JSON.stringify(f.transport.writes), before, defect);
    assert.equal(f.posts().length, 1, defect);
  }
});

test("historical inspection freezes context and refuses changed account, editor, scope or selected list", async () => {
  for (const change of [{ actorId: "other" }, { generation: "next" }, { scope: "readonly" }, { listId: "list-b" }, { scopeKey: "other-scope" }]) {
    const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
    f.state.loseResponse = true; f.state.unknown = true;
    await assert.rejects(f.queue.run(input)); f.state.unknown = false;
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks,
      getContext: () => f.context, fetchImpl: async (url, options) => {
        const response = await f.fetchImpl(url, options);
        if (url.includes("/list-operations/")) Object.assign(f.context, change);
        return response;
      } });
    const before = JSON.stringify(f.transport.writes);
    await assert.rejects(queue.inspect(input), { isAmbiguousMutation: true });
    assert.equal(JSON.stringify(f.transport.writes), before);
    assert.equal(f.posts().length, 1);
  }
});

test("historical inspection cannot report success after a failed local receipt write", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(input)); f.state.unknown = false;
  f.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(f.queue.inspect(input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1);
  assert.ok(f.transport.uncertainWrite);
});

test("historical inspection requires the gate, a personal actor, lock support and an exact UUID", async () => {
  const f = fixture();
  for (const override of [{ enabled: false }, { locks: null }, { getContext: () => ({ ...f.context, scope: "readonly" }) }]) {
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks,
      getContext: () => f.context, fetchImpl: f.fetchImpl, ...override });
    await assert.rejects(queue.inspect({ ...f.input, operationId: crypto.randomUUID() }));
  }
  await assert.rejects(f.queue.inspect(f.input));
  await assert.rejects(f.queue.inspect({ ...f.input, operationId: "invalid" }));
  assert.equal(f.calls.length, 0);
});

test("a later intentional equal edit uses a new ID, but concurrent same-generation tab submissions share one ID", async () => {
  const f = fixture();
  await Promise.all([f.queue.run(f.input), f.make().queue.run(f.input)]);
  assert.equal(f.posts().length, 1);
  f.context.generation = "generation-2";
  await f.queue.run(f.input);
  assert.equal(f.posts().length, 2);
  assert.notEqual(JSON.parse(f.posts()[0].options.body).operationId, JSON.parse(f.posts()[1].options.body).operationId);
});

test("account, generation or scope changes during dispatch cannot apply the old response", async () => {
  for (const change of [{ actorId: "other" }, { generation: "new local edit" }, { scope: "readonly" }]) {
    const f = fixture(); f.state.mutate = () => Object.assign(f.context, change);
    await assert.rejects(f.queue.run(f.input), { isAmbiguousMutation: true });
    assert.equal(f.posts().length, 1);
  }
});

test("historical receipt cannot resurrect a deleted list or overwrite advanced server revision", async () => {
  for (const change of [{ deleted: true }, { revision: 2 }]) {
    const f = fixture(); await f.queue.run(f.input); Object.assign(f.state, change);
    await assert.rejects(f.make().queue.run(f.input), { isAmbiguousMutation: true });
    assert.equal(f.posts().length, 1);
  }
});

test("terminal rejection is retained and rethrown as business rejection, not outer-envelope success", async () => {
  const f = fixture(); f.state.rejection = { status: 409, payload: { ok: false, code: "test-conflict" } };
  await assert.rejects(f.queue.run(f.input), { status: 409, isConfirmedOperationRejection: true });
  await assert.rejects(f.make().queue.run(f.input), { status: 409, isConfirmedOperationRejection: true });
  assert.equal(f.posts().length, 1); assert.equal(f.transport.writes[0].receipt.operation.state, "rejected");
});

test("wrong exact operation proof or failed durable storage never clears the intent", async () => {
  const f = fixture(); f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(f.input));
  const id = f.transport.writes[0].id;
  f.state.unknown = false; f.receipts.get(id).operation.payloadDigest = "0".repeat(64);
  await assert.rejects(f.make().queue.run(f.input)); assert.ok(f.transport.uncertainWrite);
  assert.equal(f.posts().length, 1);
  const blocked = fixture(); blocked.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(blocked.queue.run(blocked.input)); assert.equal(blocked.posts().length, 0);
});

test("partial entity outcomes must cover exact child IDs without silently accepting missing or duplicate children", () => {
  const expected = { operationId: "operation", actorId: "actor", kind: "items.sync", listId: "list", payloadDigest: "digest", body: { items: [{ id: "a" }, { id: "b" }] } };
  const receipt = { ok: true, operation: { ...expected, id: "operation", environment: "bike-packing-experiment", state: "committed" },
    result: { status: 200, payload: { ok: true, upserted: ["a"], deleted: [], conflicts: [{ itemId: "b" }] } } };
  assert.equal(validateListReceipt(receipt, expected), true);
  receipt.result.payload.conflicts = [];
  assert.equal(validateListReceipt(receipt, expected), false);
  receipt.result.payload.upserted = ["a", "a"];
  assert.equal(validateListReceipt(receipt, expected), false);
});

test("actual API wrapper delegates protected writes; forced offline and ambiguous revision failures never send", async () => {
  const f = fixture();
  const dependencies = { transport: f.transport, listQueue: f.queue };
  assert.equal((await apiFetchRequest(path, { method: "PUT", body: f.input.body }, dependencies)).list.id, "list-a");
  await assert.rejects(apiFetchRequest(path, { method: "PUT", body: f.input.body }, { ...dependencies, isForcedOffline: () => true }));
  assert.equal(f.posts().length, 1);
  let attempts = 0;
  await assert.rejects(syncEntityBatchWithRevisionRetry([], { refreshRevision: () => true, sendBatch: () => {
    attempts++; throw Object.assign(Error("unknown"), { status: 409, data: { code: "stale_state_revision" }, isAmbiguousMutation: true });
  } }));
  assert.equal(attempts, 1);
});

test("only a verified waiting intent resumes the same POST after reload; no new UUID or changed body", async () => {
  const f = fixture(); f.state.waiting = true;
  f.input.body = JSON.stringify({ causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }] } });
  await assert.rejects(f.queue.run(f.input), { isOperationWaiting: true });
  const first = f.posts()[0].options.body;
  assert.equal(f.transport.writes[0].confirmed, undefined);
  f.state.waiting = false;
  await f.make().queue.run(f.input);
  assert.equal(f.posts().length, 2); assert.equal(f.posts()[1].options.body, first);
  await f.make().queue.run(f.input);
  assert.equal(f.posts().length, 2);
});

test("waiting with wrong scope is not permission to POST again; confirmed stale rejection cannot auto-rebase", async () => {
  const f = fixture(); f.state.waiting = true;
  f.input.body = JSON.stringify({ causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }] } });
  await assert.rejects(f.queue.run(f.input), { isOperationWaiting: true });
  f.receipts.get(f.transport.writes[0].id).operation.environment = "production";
  await assert.rejects(f.make().queue.run(f.input)); assert.equal(f.posts().length, 1);
  let attempts = 0;
  await assert.rejects(syncEntityBatchWithRevisionRetry([], { refreshRevision: () => assert.fail("must not rebase"), sendBatch: () => {
    attempts++; throw Object.assign(Error("stale"), { status: 409, data: { code: "stale_state_revision" }, isOperationReceiptError: true });
  } }));
  assert.equal(attempts, 1);
});

test("ordinary form descendants require their own gate and capability while exact receipt reads survive disabling writers", async () => {
  for (const mode of ["gate", "capability", "lost ACK"]) {
    const f = fixture(), parentId = crypto.randomUUID(), operationId = crypto.randomUUID(); let enabled = mode !== "gate";
    const payload = { items: { owner: { id: "owner", name: "Later edit", photos: [] } }, containers: {}, layouts: {} };
    const body = { baseStateRevision: 1, payload, photoResults: { version: 5, operationId: parentId, owners: [{ entityType: "item", entityId: "owner" }] },
      causal: { baseOperationId: parentId, dependsOn: [{ operationId: parentId, listId: "list-a" }], reads: [] } };
    const input = { path, method: "PUT", operationId, body: JSON.stringify(body), receiptOnly: true };
    f.state.capabilities = ["personalListCausalOperationsV1", ...(mode === "capability" ? [] : ["personalCausalPhotoFormDescendantsV1"])];
    f.state.payload = { ok: true, stateRevision: 2, list: { id: "list-a", stateRevision: 2, payload } };
    const queue = () => createListOperationQueue({ transport: f.transport, getContext: () => f.context, locks: f.locks, fetchImpl: f.fetchImpl,
      enabled: true, photoEnabled: true, photoFormEnabled: true, pendingFormUpdateEnabled: enabled });
    if (mode === "lost ACK") { f.state.loseResponse = true; f.state.unknown = true; }
    await assert.rejects(queue().run(input));
    if (mode !== "lost ACK") { assert.equal(f.posts().length, 0); assert.equal(f.transport.writes.length, 0); continue; }
    assert.equal(f.posts().length, 1); enabled = false; f.state.unknown = false;
    const proof = await queue().inspect(input); assert.equal(proof.operation.state, "committed"); assert.equal(proof.historicalOnly, true);
    assert.equal(f.posts().length, 1);
  }
});

test("unrelated target can complete while another target's POST is in flight", async () => {
  const f = fixture(); let started, release;
  const entered = new Promise(resolve => { started = resolve; });
  const pause = new Promise(resolve => { release = resolve; });
  const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks, getContext: () => ({ ...f.context }),
    fetchImpl: async (url, options) => {
      if (options.method === "POST" && JSON.parse(options.body).listId === "list-a") { started(); await pause; }
      return f.fetchImpl(url, options);
    } });
  const first = queue.run(f.input); await entered;
  let timer;
  try {
    const second = await Promise.race([queue.run({ ...f.input, path: "/bike-packing/lists/list-b" }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error("unrelated action blocked")), 1000); })]);
    assert.equal(second.list.id, "list-b");
  } finally { clearTimeout(timer); release(); }
  await first;
});
