import { createHash, randomUUID } from "node:crypto";
import { adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { createAdminTemplatePhotoStaging } from "../../src/sync/admin-template-photo-staging.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";

export const sha = value => createHash("sha256").update(value).digest("hex");
export const copy = value => JSON.parse(JSON.stringify(value));
export async function adminPhotoStagingFixture() {
  const binding = { actorId: "administrator", environment: "bike-packing-experiment", listId: "public-demo-state", itemKey: "demo-state" };
  const current = { ...binding, scope: "admin-template", admin: true, generation: "editor-1" };
  const bytes = "complete original bytes", file = new Blob([bytes], { type: "image/jpeg" });
  const stage = { version: 1, ...binding, operationId: randomUUID(), templateOperationId: randomUUID(), baseStateRevision: 3,
    entityType: "item", entityId: "server-item", photoId: "photo-" + randomUUID(),
    file: { hash: sha(bytes), size: file.size, type: file.type, fileName: "camera.jpg" }, thumb: null };
  const assetDigest = await adminTemplatePhotoStageDigest(stage);
  const body = { version: 1, base: { stateRevision: 3 }, metadata: { title: "Template", description: "", language: "ru" },
    payload: { items: { "server-item": { id: "server-item", name: "Edited", photos: [] } }, containers: {},
      layouts: { l: { id: "l", name: "Template" } }, activeLayoutId: "l" },
    photoAppend: { version: 1, assets: [{ assetId: stage.operationId, assetDigest, entityType: stage.entityType, entityId: stage.entityId, photoId: stage.photoId }] } };
  const action = { operationId: stage.templateOperationId, kind: "template.save", listId: binding.listId, itemKey: binding.itemKey, body };
  const record = { binding, action, stage, file, thumb: null, intentHash: sha(JSON.stringify(action)), fileMetadata: stage.file, thumbMetadata: null };
  const data = { ok: true, assetState: "ready", receipt: { version: 1, manifest: copy(stage), assetDigest, ownerId: "another-template-owner", baseEntityRevision: 2,
    stored: { file: { hash: stage.file.hash, size: file.size, type: file.type, fileName: stage.file.fileName, width: null, height: null },
      thumb: { hash: stage.file.hash, size: file.size, type: file.type } } } };
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: async (_key, task) => task() }, claims = new Map(), calls = [];
  const controls = { known: null, lost: false, unknown: false, capabilities: ["adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1"], afterRead: null, afterPost: null };
  const store = { binding, read: async () => ({ ...record, files: [{ stage, file, thumb: null }] }),
    readStage: async () => { controls.afterRead?.(); return record; },
    claimStage: async (actionOperationId, stageOperationId) => {
      const prior = claims.get(stageOperationId), value = { actionOperationId, stageOperationId, intentHash: record.intentHash, assetDigest };
      if (!prior) claims.set(stageOperationId, value); return { ...value, fresh: !prior };
    } };
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname; calls.push({ path, options }); let result;
    if (path.endsWith("/auth/me")) result = { ok: true, user: { id: binding.actorId } };
    else if (path.endsWith("/authorization")) result = { ok: true, authorization: { version: 1, role: "admin", capabilities: ["templates:write"] } };
    else if (path.endsWith("/capabilities")) result = { ok: true, service: "bikepacking-api", capabilities: controls.capabilities };
    else if (path.endsWith("/template-photo-assets") && options.method === "POST") {
      if (!controls.unknown) controls.known = copy(data);
      controls.afterPost?.();
      if (controls.lost || controls.unknown) throw new TypeError("Lost stage response");
      result = controls.known;
    } else if (path.endsWith("/template-photo-assets/" + stage.operationId)) result = controls.known || {
      ok: true, operation: { id: stage.operationId, environment: binding.environment, actorId: binding.actorId, state: "unknown" } };
    else throw Error("Unexpected request: " + path);
    return { status: 200, json: async () => copy(result) };
  };
  const make = options => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" },
      selection: "direct", locks, storage });
    return { transport, client: createAdminTemplatePhotoStaging({ store, transport, locks, getContext: () => current, fetchImpl, enabled: true, ...options }) };
  };
  return { binding, current, stage, body, record, data, controls, storage, values, claims, calls, make, store, locks, fetchImpl,
    posts: () => calls.filter(call => call.options.method === "POST") };
}
