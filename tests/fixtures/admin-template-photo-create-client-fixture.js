import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { adminPhotoCreateRecordInput } from "./admin-template-photo-create-record-fixture.js";
import { adminPhotoIndexedDBFixture } from "./admin-template-photo-record-fixture.js";
import { prepareAdminTemplatePhotoCreateRecord } from "../../src/public/admin-template-photo-create-state.js";
import { createAdminTemplatePhotoActionStore } from "../../src/sync/admin-template-photo-action-store.js";
import { createAdminTemplatePhotoStaging } from "../../src/sync/admin-template-photo-staging.js";
import { createAdminTemplateClient } from "../../src/sync/admin-template-client.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoCreateEditorSnapshot } from "../../src/sync/admin-template-photo-create-save-plan.js";
import { adminTemplatePhotoCreateIntent, adminTemplatePhotoCreatePayload } from "../../src/sync/admin-template-photo-create-protocol.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";

export const copy = value => structuredClone(value);
export const hash = value => createHash("sha256").update(canonicalTemplateJson(value)).digest("hex");
export async function adminPhotoCreateClientFixture(options = {}) {
  const input = await adminPhotoCreateRecordInput(options), prepared = await prepareAdminTemplatePhotoCreateRecord(input);
  const { binding } = input, id = input.operationId, current = { ...binding, scope: "admin-template", admin: true, generation: "create-1" };
  const idb = adminPhotoIndexedDBFixture(), locks = { request: async (_key, fn) => fn() };
  const makeStore = extra => createAdminTemplatePhotoActionStore({ binding, getContext: () => current, indexedDB: idb.indexedDB,
    enabled: true, createEnabled: true, ...extra });
  const store = makeStore(), record = await store.capture({ action: prepared.action, snapshot: prepared.snapshot,
    files: prepared.files.map(({ stage, file, thumb }) => ({ stage, file, thumb })) });
  const intent = adminTemplatePhotoCreateIntent({ ...binding, ...record.action }), { id: _id, ...digestInput } = intent;
  const stages = record.files.map(({ stage, fileMetadata, thumbMetadata }, i) => ({ ok: true, assetState: "ready", receipt: {
    version: 2, manifest: copy(stage), assetDigest: intent.body.photoCreate.assets[i].assetDigest, ownerId: "template-owner-b", baseEntityRevision: 0,
    stored: { file: { ...fileMetadata, fileName: stage.file.fileName, width: 640, height: 480 }, thumb: thumbMetadata || copy(fileMetadata) } } }));
  const added = intent.body.photoCreate.assets.map(({ photoId, ...asset }, i) => ({ ...asset, photo: { id: photoId, photoId,
    assetId: asset.assetId, listId: binding.listId, status: "synced",
    url: `https://api.example/bike-packing/lists/${binding.listId}/photos/${photoId}/file`,
    thumbUrl: `https://api.example/bike-packing/lists/${binding.listId}/photos/${photoId}/thumb`,
    ...Object.fromEntries(["fileName", "size", "type", "width", "height"].map(key => [key, stages[i].receipt.stored.file[key]])) } }));
  const confirmedPayload = adminTemplatePhotoCreatePayload(intent, added);
  const receipt = { operation: { ...Object.fromEntries(["environment", "actorId", "listId", "itemKey", "kind"].map(key => [key, intent[key]])),
    id, payloadDigest: hash(digestInput), state: "committed" }, result: { status: 200, payload: { ok: true, listId: binding.listId,
    itemKey: binding.itemKey, stateRevision: 8, visibility: "private", indexes: [], photoCreate: { version: 1, ownerId: "template-owner-b",
      entityType: intent.body.photoCreate.entityType, entityId: intent.body.photoCreate.entityId, added, confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) } } } };
  const values = new Map(), controls = { quota: false, quotaPrefix: null, unknownStage: false, loseStage: false, loseSave: false, hideSave: false,
    mutateReceipt: null, afterRequest: null, beforeSave: null, capabilities: ["adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoCreateV1"] };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (controls.quota || controls.quotaPrefix && key.startsWith(controls.quotaPrefix)) throw Error("Quota"); values.set(key, value); },
    removeItem: key => values.delete(key) };
  const server = { saved: null, known: new Map(), calls: [], stagePosts: [], savePosts: [] };
  const fetchImpl = async (url, request = {}) => {
    const path = new URL(url).pathname; server.calls.push({ path, method: request.method || "GET" }); let result;
    if (path.endsWith("/auth/me")) result = { ok: true, user: { id: binding.actorId } };
    else if (path.endsWith("/authorization")) result = { ok: true, authorization: { version: 1, role: "admin", capabilities: ["templates:write"] } };
    else if (path.endsWith("/capabilities")) result = { ok: true, service: "bikepacking-api", capabilities: controls.capabilities };
    else if (path.endsWith("/template-photo-assets") && request.method === "POST") {
      const manifest = JSON.parse(request.body.get("manifest")), index = record.files.findIndex(part => part.stage.operationId === manifest.operationId);
      assert.notEqual(index, -1); assert.deepEqual(manifest, record.files[index].stage);
      assert.equal(await request.body.get("file").text(), await record.files[index].file.text());
      server.stagePosts.push(manifest);
      if (!controls.unknownStage) server.known.set(manifest.operationId, copy(stages[index]));
      controls.afterRequest?.(path);
      if (controls.unknownStage || controls.loseStage) throw TypeError("Lost stage ACK");
      result = server.known.get(manifest.operationId);
    } else if (path.includes("/template-photo-assets/")) {
      const stageId = path.split("/").at(-1);
      result = server.known.get(stageId) || { ok: true, operation: { id: stageId, environment: binding.environment, actorId: binding.actorId, state: "unknown" } };
    } else if ((path.endsWith("/template-operations") || path.endsWith(`/${id}/cancel`)) && request.method === "POST") {
      const envelope = JSON.parse(request.body); assert.deepEqual(envelope.body, record.action.body); server.savePosts.push({ path, envelope });
      controls.beforeSave?.();
      if (!server.saved) server.saved = path.endsWith("/cancel") ? { operation: { ...copy(receipt.operation), state: "rejected" },
        result: { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } } }
        : copy(receipt);
      controls.mutateReceipt?.(server.saved); controls.afterRequest?.(path);
      if (controls.loseSave) throw TypeError("Lost save ACK"); result = { ok: true, ...server.saved };
    } else if (path.endsWith(`/template-operations/${id}`)) result = server.saved && !controls.hideSave ? { ok: true, ...server.saved }
      : { ok: true, operation: { id, state: "unknown" } };
    else throw Error(`Unexpected path ${path}`);
    controls.afterRequest?.(path);
    return { status: 200, json: async () => copy(result) };
  };
  const make = (extra = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" },
      selection: "direct", locks, storage });
    const photoStore = extra.photoStore === undefined ? store : extra.photoStore;
    const staging = createAdminTemplatePhotoStaging({ store: photoStore || store, getContext: () => current, transport, fetchImpl, locks,
      enabled: extra.photoAppendEnabled ?? true, createEnabled: extra.photoCreateEnabled ?? true });
    const client = createAdminTemplateClient({ binding, getContext: () => current, storage, locks, transport, fetchImpl, enabled: true,
      photoAppendEnabled: true, photoCreateEnabled: true, photoStore, photoStaging: staging, ...extra });
    const plans = createAdminTemplateSavePlans({ binding, getContext: () => current, storage, locks, client, enabled: true,
      photoCreateEnabled: extra.photoCreateEnabled ?? true, photoStore });
    return { transport, staging, client, plans };
  };
  const planInput = { operationId: id, body: copy(intent.body), editorSnapshot: adminTemplatePhotoCreateEditorSnapshot(record), recordIntentHash: record.intentHash };
  return { input, id, binding, current, idb, store, makeStore, record, intent, stages, receipt, controls, values, storage, locks, server, make, planInput };
}
