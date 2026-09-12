import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { treeActionStoreFixture } from "./admin-template-photo-tree-copy-action-store-fixture.js";
import { createAdminTemplatePhotoTreeCopyClient } from "../../src/sync/admin-template-photo-tree-copy-client.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyPayload } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";
import { adminTemplatePhotoCopyMaterialization, adminTemplatePhotoCopyReference } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";

export const copy = value => structuredClone(value), hash = value => createHash("sha256").update(canonical(value)).digest("hex");
export const commandPrefix = "bike-packing-admin-photo-tree-copy-commands-v1:";
export const stagePath = "/bike-packing/admin/template-photo-assets/tree-copy";
export async function treeCopyClientFixture(options = {}) {
  const f = await treeActionStoreFixture(options), { input, idb, store, create: makeStore } = f, { binding } = input, id = input.action.operationId;
  const current = f.context, record = await store.capture(f.value), intent = adminTemplatePhotoTreeCopyIntent({ ...binding, ...input.action });
  const tails = new Map(), locks = { async request(name, task) {
    const previous = tails.get(name) || Promise.resolve(); let release;
    const held = new Promise(resolve => { release = resolve; }); tails.set(name, held); await previous;
    try { return await task(); } finally { release(); if (tails.get(name) === held) tails.delete(name); }
  } };
  const c = intent.body.photoCopy, stages = [], owners = []; let index = 0;
  // Explicit synthetic server facts; native FS/MySQL proofs belong to BE tests.
  for (const owner of c.owners) {
    const added = [], rawOwner = c.source.payload[owner.entityType === "item" ? "items" : "containers"][owner.sourceEntityId];
    for (const [photoIndex, asset] of owner.photos.entries()) {
      const manifest = record.stages[index], stored = { file: { hash: hash(`source-file-${index}`), size: 42, type: "image/jpeg", fileName: `Tree ${index}.jpg`, width: 640, height: 480 },
        thumb: { hash: hash(`source-thumb-${index}`), size: 20, type: "image/webp" } };
      const materialization = await adminTemplatePhotoCopyMaterialization({ filePath: `legacy/tree-${index}.jpg`, thumbPath: `legacy/tree-${index}.webp` },
        { filePath: `operations/${asset.assetId}/file.jpg`, thumbPath: `operations/${asset.assetId}/thumb.webp` });
      stages.push({ ok: true, assetState: "ready", receipt: { version: 2, kind: "admin-template-photo-tree-copy", manifest: copy(manifest), assetDigest: asset.assetDigest,
        sourceOwnerId: "source-owner", ownerId: "target-owner", baseEntityRevision: 0, sourceStored: copy(stored), stored, materialization } });
      const suffix = `/letters-vniipo/api/bike-packing/lists/${encodeURIComponent(binding.listId)}/photos/${encodeURIComponent(asset.photoId)}`;
      added.push({ assetId: asset.assetId, assetDigest: asset.assetDigest, sourcePhotoId: asset.sourcePhotoId,
        photo: { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: binding.listId, status: "synced", url: `${suffix}/file`, thumbUrl: `${suffix}/thumb`,
          ...Object.fromEntries(["fileName", "type", "size", "width", "height"].map(key => [key, stored.file[key]])),
          ...adminTemplatePhotoCopyReference(rawOwner.photos[photoIndex], c.source.listId) } });
      index++;
    }
    owners.push({ entityType: owner.entityType, sourceEntityId: owner.sourceEntityId, entityId: owner.entityId, added });
  }
  const confirmedPayload = adminTemplatePhotoTreeCopyPayload(intent, owners), extension = { version: 2, sourceOwnerId: "source-owner", ownerId: "target-owner",
    rootId: c.owners.find(owner => owner.sourceEntityId === c.source.rootId).entityId, owners, confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) };
  const { id: ignored, ...encoded } = intent;
  const receipt = { operation: { id, environment: intent.environment, actorId: intent.actorId, listId: intent.listId, itemKey: intent.itemKey,
    kind: intent.kind, payloadDigest: hash(encoded), state: "committed" }, result: { status: 200, payload: { ok: true, listId: binding.listId, itemKey: binding.itemKey,
    stateRevision: intent.body.base.stateRevision + 1, visibility: "private", indexes: [], photoCopy: extension } } };
  const values = new Map(), controls = { quota: false, rejectWrite: null, afterRequest: null, mutateStage: null, mutateSave: null, responseStatus: 200,
    wrongActor: false, noRights: false, unknownStage: false, loseStage: false, unknownSave: false, loseSave: false, hideSave: false,
    throwAfterSaveBegin: false, revokeAdmission: false, afterClaim: null, afterBegin: null,
    capabilities: ["adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoCreateV1", "adminTemplatePhotoCopyV1", "adminTemplatePhotoTreeCopyV1"] };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (controls.quota || controls.rejectWrite?.(key, value)) throw Error("Quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const server = { calls: [], stagePosts: [], savePosts: [], stages: new Map(), saved: null }, admission = { active: false, calls: 0, checks: 0 };
  const assertAdmission = () => { admission.checks++; assert.equal(admission.active, true, "effect holds the scoped admission"); if (controls.revokeAdmission) throw Error("Admission revoked"); };
  const withDispatchAdmission = async (proof, task) => locks.request("fixture-common-tree-dispatch-admission", async () => {
    assert.deepEqual(proof.intent, intent); assert.equal(proof.recordIntentHash, record.intentHash); proof.assertCurrent();
    admission.active = true; admission.calls++;
    try { return await task({ assertCurrent() { proof.assertCurrent(); assertAdmission(); } }); }
    finally { admission.active = false; }
  });
  const fetchImpl = async (url, request = {}) => {
    const path = new URL(url).pathname, method = request.method || "GET"; server.calls.push({ path, method });
    assert.equal(request.credentials, "include"); assert.equal(request.redirect, "error"); let value;
    if (path.endsWith("/auth/me")) value = { ok: true, user: { id: controls.wrongActor ? "foreign" : binding.actorId } };
    else if (path.endsWith("/authorization")) value = { ok: true, authorization: { version: 1, role: controls.noRights ? "user" : "admin", capabilities: ["templates:write"] } };
    else if (path.endsWith("/capabilities")) value = { ok: true, service: "bikepacking-api", capabilities: controls.capabilities };
    else if (path.endsWith(stagePath) && method === "POST") {
      assertAdmission(); const body = JSON.parse(request.body), index = record.stages.findIndex(stage => stage.operationId === body.manifest?.operationId);
      assert.equal(request.headers["content-type"], "application/json"); assert.deepEqual(Object.keys(body), ["manifest"]); assert.notEqual(index, -1);
      assert.deepEqual(body.manifest, record.stages[index]); server.stagePosts.push(copy(body));
      if (!controls.unknownStage) { const stage = copy(stages[index]); controls.mutateStage?.(stage, index); server.stages.set(body.manifest.operationId, stage); }
      controls.afterRequest?.(path, method);
      if (controls.unknownStage || controls.loseStage) throw TypeError("Stage ACK lost"); value = server.stages.get(body.manifest.operationId);
    } else if (path.includes(`${stagePath}/`) && method === "GET") {
      const stageId = path.split("/").at(-1);
      value = server.stages.get(stageId) || { ok: true, operation: { id: stageId, environment: binding.environment, actorId: binding.actorId, state: "unknown" } };
    } else if (path.endsWith("/template-operations") && method === "POST") {
      assertAdmission(); const body = JSON.parse(request.body);
      assert.deepEqual(body, { expectedActorId: binding.actorId, environment: binding.environment, operationId: id, kind: "template.save", listId: binding.listId, itemKey: binding.itemKey, body: record.action.body });
      server.savePosts.push(copy(body));
      if (!controls.unknownSave) { server.saved = copy(receipt); controls.mutateSave?.(server.saved); }
      controls.afterRequest?.(path, method);
      if (controls.unknownSave || controls.loseSave) throw TypeError("Save ACK lost"); value = { ok: true, ...server.saved };
    } else if (path.endsWith(`/template-operations/${id}`) && method === "GET") value = server.saved && !controls.hideSave
      ? { ok: true, ...server.saved } : { ok: true, operation: { id, state: "unknown" } };
    else throw Error(`Unexpected request ${method} ${path}`);
    controls.afterRequest?.(path, method);
    return { status: controls.responseStatus, json: async () => copy(value) };
  };
  const make = (extra = {}) => {
    const real = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" }, selection: "direct", locks, storage });
    const transport = { ...real, get mode() { return real.mode; }, get writes() { return real.writes; }, async beginWrite(...args) {
      assertAdmission(); const result = await real.beginWrite(...args); controls.afterBegin?.(...args);
      if (args[0].endsWith("/template-operations") && controls.throwAfterSaveBegin) throw TypeError("Stopped after durable save claim"); return result;
    } };
    const clientStore = { binding: store.binding, read: id => store.read(id), async claimStage(...args) {
      assertAdmission(); const claim = await store.claimStage(...args); assertAdmission(); controls.afterClaim?.(); return claim;
    } };
    const client = createAdminTemplatePhotoTreeCopyClient({ binding, getContext: () => current, store: clientStore, transport, storage, locks, fetchImpl,
      enabled: true, adminEnabled: true, appendEnabled: true, createEnabled: true, copyEnabled: true, withDispatchAdmission, ...extra });
    return { client, transport };
  };
  return { input, id, binding, current, idb, store, makeStore, record, intent, stages, receipt, controls, values, storage, locks, server,
    fetchImpl, make, admission, withDispatchAdmission };
}
