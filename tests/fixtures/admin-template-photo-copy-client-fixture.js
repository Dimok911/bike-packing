import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { adminPhotoCopyRecordInput, adminPhotoCopyIndexedDBFixture } from "./admin-template-photo-copy-record-fixture.js";
import { createAdminTemplatePhotoCopyActionStore } from "../../src/sync/admin-template-photo-copy-action-store.js";
import { createAdminTemplatePhotoCopyClient } from "../../src/sync/admin-template-photo-copy-client.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyMaterialization, adminTemplatePhotoCopyPayload,
  adminTemplatePhotoCopyReference } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";

export const copy = value => structuredClone(value);
export const hash = value => createHash("sha256").update(canonicalTemplateJson(value)).digest("hex");
export const commandPrefix = "bike-packing-admin-photo-copy-commands-v1:";
export async function adminPhotoCopyClientFixture(options = {}) {
  const input = await adminPhotoCopyRecordInput(options), { binding } = input, id = input.action.operationId;
  const current = { ...binding, scope: "admin-template", admin: true, generation: "copy-client-one" }, idb = adminPhotoCopyIndexedDBFixture();
  const tails = new Map(), locks = { async request(name, fn) {
    const previous = tails.get(name) || Promise.resolve(); let release;
    const held = new Promise(resolve => { release = resolve; }); tails.set(name, held);
    await previous;
    try { return await fn(); } finally { release(); if (tails.get(name) === held) tails.delete(name); }
  } };
  const makeStore = extra => createAdminTemplatePhotoCopyActionStore({ binding, getContext: () => current, indexedDB: idb.indexedDB, enabled: true, ...extra });
  const store = makeStore(), record = await store.capture({ action: input.action, snapshot: input.snapshot }), intent = adminTemplatePhotoCopyIntent({ ...binding, ...input.action });
  const { id: omitted, ...digestInput } = intent, photoCopy = intent.body.photoCopy;
  const sourceOwner = photoCopy.source.payload[photoCopy.entityType === "item" ? "items" : "containers"][photoCopy.source.entityId];
  const stages = [], added = [];
  for (const [index, manifest] of record.stages.entries()) {
    const asset = photoCopy.assets[index], stored = { file: { hash: hash(`server-file-${index}`), size: 42, type: "image/jpeg", fileName: `Copy ${index}.jpg`, width: 640, height: 480 },
      thumb: { hash: hash(`server-thumb-${index}`), size: 20, type: "image/webp" } };
    const materialization = await adminTemplatePhotoCopyMaterialization({ filePath: `legacy/source-${index}.jpg`, thumbPath: `legacy/source-${index}.webp` },
      { filePath: `operations/${asset.assetId}.file.jpg`, thumbPath: `operations/${asset.assetId}.thumb.webp` });
    stages.push({ ok: true, assetState: "ready", receipt: { version: 1, kind: "admin-template-photo-copy", manifest: copy(manifest), assetDigest: asset.assetDigest,
      sourceOwnerId: "source-owner", ownerId: "target-owner", baseEntityRevision: 0, sourceStored: copy(stored), stored, materialization } });
    // Match attachValidatedTemplatePhotoAssets' persisted raw BE references.
    const suffix = `/letters-vniipo/api/bike-packing/lists/${encodeURIComponent(binding.listId)}/photos/${encodeURIComponent(asset.photoId)}`;
    added.push({ assetId: asset.assetId, assetDigest: asset.assetDigest, sourcePhotoId: asset.sourcePhotoId, photo: { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: binding.listId, status: "synced",
      url: `${suffix}/file`, thumbUrl: `${suffix}/thumb`,
      ...Object.fromEntries(["fileName", "type", "size", "width", "height"].map(key => [key, stored.file[key]])),
      ...adminTemplatePhotoCopyReference(sourceOwner.photos[index], photoCopy.source.listId) } });
  }
  const confirmedPayload = adminTemplatePhotoCopyPayload(intent, added), result = { version: 1, sourceOwnerId: "source-owner", ownerId: "target-owner",
    entityType: photoCopy.entityType, entityId: photoCopy.entityId, added, confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) };
  const receipt = { operation: { id, ...Object.fromEntries(["environment", "actorId", "listId", "itemKey", "kind"].map(key => [key, intent[key]])),
    payloadDigest: hash(digestInput), state: "committed" }, result: { status: 200, payload: { ok: true, listId: binding.listId, itemKey: binding.itemKey,
    stateRevision: intent.body.base.stateRevision + 1, visibility: "private", indexes: [], photoCopy: result } } };
  const values = new Map(), controls = { quota: false, rejectWrite: null, afterRequest: null, mutateStage: null, mutateSave: null,
    wrongActor: false, noRights: false, unknownStage: false, loseStage: false, unknownSave: false, loseSave: false, hideSave: false,
    throwAfterSaveBegin: false, unknownCancel: false, loseCancel: false, commitBeforeCancel: false, mutateCancel: null,
    capabilities: ["adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoCreateV1", "adminTemplatePhotoCopyV1"] };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (controls.quota || controls.rejectWrite?.(key, value)) throw Error("Quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const server = { calls: [], stagePosts: [], savePosts: [], cancelPosts: [], stages: new Map(), saved: null };
  const fetchImpl = async (url, request = {}) => {
    const path = new URL(url).pathname, method = request.method || "GET"; server.calls.push({ path, method });
    assert.equal(request.credentials, "include"); assert.equal(request.redirect, "error"); let value;
    if (path.endsWith("/auth/me")) value = { ok: true, user: { id: controls.wrongActor ? "other-actor" : binding.actorId } };
    else if (path.endsWith("/authorization")) value = { ok: true, authorization: { version: 1, role: controls.noRights ? "user" : "admin", capabilities: ["templates:write"] } };
    else if (path.endsWith("/capabilities")) value = { ok: true, service: "bikepacking-api", capabilities: controls.capabilities };
    else if (path.endsWith("/template-photo-assets/copy") && method === "POST") {
      assert.equal(typeof request.body, "string"); assert.equal(request.headers["content-type"], "application/json");
      const body = JSON.parse(request.body), index = record.stages.findIndex(stage => stage.operationId === body.manifest?.operationId);
      assert.deepEqual(Object.keys(body), ["manifest"]); assert.notEqual(index, -1); assert.deepEqual(body.manifest, record.stages[index]);
      server.stagePosts.push(copy(body));
      if (!controls.unknownStage) { const stage = copy(stages[index]); controls.mutateStage?.(stage, index); server.stages.set(body.manifest.operationId, stage); }
      controls.afterRequest?.(path, method);
      if (controls.unknownStage || controls.loseStage) throw TypeError("Stage ACK lost"); value = server.stages.get(body.manifest.operationId);
    } else if (path.includes("/template-photo-assets/") && method === "GET") {
      const stageId = path.split("/").at(-1);
      value = server.stages.get(stageId) || { ok: true, operation: { id: stageId, environment: binding.environment, actorId: binding.actorId, state: "unknown" } };
    } else if ((path.endsWith("/template-operations") || path.endsWith(`/template-operations/${id}/cancel`)) && method === "POST") {
      const body = JSON.parse(request.body);
      assert.deepEqual(body, { expectedActorId: binding.actorId, environment: binding.environment, operationId: id, kind: "template.save",
        listId: binding.listId, itemKey: binding.itemKey, body: record.action.body });
      const cancel = path.endsWith("/cancel");
      if (cancel) {
        server.cancelPosts.push(copy(body));
        if (controls.commitBeforeCancel) server.saved = copy(receipt);
        else if (!controls.unknownCancel && !server.saved) server.saved = { operation: { ...copy(receipt.operation), state: "rejected" },
          result: { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: {
            version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } } };
        if (server.saved) controls.mutateCancel?.(server.saved);
        controls.afterRequest?.(path, method);
        if (controls.unknownCancel || controls.loseCancel) throw TypeError("Cancel ACK lost"); value = { ok: true, ...server.saved };
      } else {
        server.savePosts.push(copy(body));
        if (!controls.unknownSave) { server.saved = copy(receipt); controls.mutateSave?.(server.saved); }
        controls.afterRequest?.(path, method);
        if (controls.unknownSave || controls.loseSave) throw TypeError("Save ACK lost"); value = { ok: true, ...server.saved };
      }
    } else if (path.endsWith(`/template-operations/${id}`) && method === "GET") value = server.saved && !controls.hideSave
      ? { ok: true, ...server.saved } : { ok: true, operation: { id, state: "unknown" } };
    else throw Error(`Unexpected request ${method} ${path}`);
    controls.afterRequest?.(path, method);
    return { status: 200, json: async () => copy(value) };
  };
  const make = (extra = {}) => {
    const real = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" }, selection: "direct", locks, storage });
    const transport = { ...real, get mode() { return real.mode; }, get writes() { return real.writes; }, async beginWrite(...args) {
      const result = await real.beginWrite(...args);
      if (args[0].endsWith("/template-operations") && controls.throwAfterSaveBegin) throw TypeError("Stopped after durable save claim before HTTP"); return result;
    } };
    const client = createAdminTemplatePhotoCopyClient({ binding, getContext: () => current, store, transport, storage, locks, fetchImpl,
      enabled: true, adminEnabled: true, appendEnabled: true, createEnabled: true, ...extra });
    return { client, transport };
  };
  return { input, id, binding, current, idb, store, makeStore, record, intent, stages, receipt, controls, values, storage, locks, server, fetchImpl, make };
}
