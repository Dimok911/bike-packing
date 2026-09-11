import { canonicalTemplateJson, adminTemplateIntent } from "../sync/admin-template-protocol.js";
import { personalBusinessPayload } from "../sync/personal-business-payload.js";
import { stripAdminTemplateEditorMetadata } from "./admin-template-causal-save-flow.js";
import { adminTemplatePhotoStageManifest, adminTemplatePhotoStageDigest } from "../sync/admin-template-photo-append-protocol.js";
import { encodeAdminTemplatePhotoRecord, decodeAdminTemplatePhotoRecord, adminTemplatePhotoActionBinding, adminTemplatePhotoFormFieldNames } from "../sync/admin-template-photo-record.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const fail = () => { throw Object.assign(Error("Форма с фотографиями шаблона требует сверки с исходной версией."), { code: "admin-template-photo-form-source", isAdminTemplateBlocked: true }); };
const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value);

// The caller first validates this recorded map against the current actor,
// revision and actual namespace. This exact raw projection grants no authority
// and never derives an identity from a display/shared-source field.
export function adminTemplatePhotoFormPayload({ sourcePayload, ownerMap, entityType, entityId, fields }) {
  try {
    const allowed = adminTemplatePhotoFormFieldNames(entityType), types = ["items", "containers"];
    if (!plain(sourcePayload) || ![...types, "layouts"].every(type => plain(sourcePayload[type])) || !plain(fields)
      || Object.keys(fields).some(field => !allowed.includes(field))
      || !exact(ownerMap, ["version", "binding", "layoutId", "stateRevision", "owners"]) || ownerMap.version !== 1
      || !id(ownerMap.layoutId) || !Number.isSafeInteger(ownerMap.stateRevision) || ownerMap.stateRevision < 1 || !Array.isArray(ownerMap.owners)) fail();
    adminTemplatePhotoActionBinding(ownerMap.binding);
    const layouts = Object.keys(sourcePayload.layouts), serverIds = new Set(layouts), localIds = new Set([ownerMap.layoutId]);
    if (layouts.length !== 1 || layouts.some(key => !id(key) || !plain(sourcePayload.layouts[key]) || sourcePayload.layouts[key].id !== key)) fail();
    const sources = new Set(), mapped = new Set();
    for (const type of types) for (const [serverId, row] of Object.entries(sourcePayload[type])) {
      if (!id(serverId) || !plain(row) || row.id !== serverId || serverIds.has(serverId)) fail();
      serverIds.add(serverId); sources.add(`${type}:${serverId}`);
    }
    for (const owner of ownerMap.owners) {
      if (!exact(owner, ["type", "localId", "serverId"]) || !types.includes(owner.type) || !id(owner.localId) || !id(owner.serverId)
        || localIds.has(owner.localId) || !sources.has(`${owner.type}:${owner.serverId}`) || mapped.has(`${owner.type}:${owner.serverId}`)) fail();
      localIds.add(owner.localId); mapped.add(`${owner.type}:${owner.serverId}`);
    }
    if (mapped.size !== sources.size) fail();
    const type = entityType === "item" ? "items" : "containers";
    const owner = ownerMap.owners.find(row => row.type === type && row.localId === entityId);
    if (!owner) fail();
    const payload = clone(sourcePayload), selected = payload[type][owner.serverId];
    for (const [field, value] of Object.entries(clone(fields))) {
      if (field === "dimensions" && value === null) delete selected.dimensions;
      else selected[field] = value;
    }
    return payload;
  } catch { fail(); }
}

export function adminTemplatePhotoNamespace(state, layoutId) {
  const layout = state.layouts?.[layoutId]; if (!layout || layout.id !== layoutId) fail();
  return clone({ activeLayoutId: layoutId, layouts: { [layoutId]: layout },
    items: Object.fromEntries(Object.entries(state.items || {}).filter(([, row]) => row.publicCatalogLayoutId === layoutId)),
    containers: Object.fromEntries(Object.entries(state.containers || {}).filter(([, row]) => row.publicCatalogLayoutId === layoutId)),
    locations: layout.locations || state.locations || [], categories: layout.categories || state.categories || [],
    packedItems: layout.arrangement?.packedItems || {} });
}

export function adminTemplatePhotoEditorSnapshot(state, layoutId, metadata) {
  return { payload: stripAdminTemplateEditorMetadata(personalBusinessPayload(adminTemplatePhotoNamespace(state, layoutId))), metadata: clone(metadata) };
}

// All selected UI values and Blob handles are detached before hashing yields.
// The raw payload applies only the selected form fields to the exact source;
// snapshot.state separately preserves the intended pending-photo view.
export async function prepareAdminTemplatePhotoRecord(input) {
  const { files, ...json } = input, frozen = clone(json);
  const selected = files?.map(file => ({ ...clone(Object.fromEntries(Object.entries(file).filter(([key]) => !["blob", "thumbBlob"].includes(key)))),
    blob: file.blob, thumbBlob: file.thumbBlob ?? null }));
  if (!Array.isArray(selected) || !selected.length || selected.length > 50) fail();
  const { binding, operationId, snapshot, payload, entityType, entityId } = frozen;
  const type = entityType === "item" ? "items" : entityType === "container" ? "containers" : null;
  const mapped = snapshot.ownerMap?.owners.find(row => row.type === type && row.localId === entityId);
  if (!mapped || !snapshot.state[type]?.[entityId] || !payload[type]?.[mapped.serverId]) fail();
  const assets = [], parts = []; let total = 0;
  for (const file of selected) {
    if (file.fullBlobVerified !== true || !(file.blob instanceof Blob) || file.blob.type !== file.type || file.blob.size !== file.size
      || file.blob.size <= 0 || file.blob.size > 10 * 1024 * 1024 || file.thumbBlob !== null && !(file.thumbBlob instanceof Blob)) fail();
    total += file.blob.size + (file.thumbBlob?.size || 0); if (total > 50 * 1024 * 1024) fail();
    const manifest = adminTemplatePhotoStageManifest({ version: 1, ...binding, operationId: crypto.randomUUID(), templateOperationId: operationId,
      baseStateRevision: snapshot.state.layouts[snapshot.layoutId].adminCausalSource.base.stateRevision,
      entityType, entityId: mapped.serverId, photoId: file.id,
      file: { hash: await hash(file.blob), size: file.blob.size, type: file.blob.type, fileName: file.fileName },
      thumb: file.thumbBlob ? { hash: await hash(file.thumbBlob), size: file.thumbBlob.size, type: file.thumbBlob.type } : null });
    assets.push({ assetId: manifest.operationId, assetDigest: await adminTemplatePhotoStageDigest(manifest), entityType, entityId: mapped.serverId, photoId: file.id });
    parts.push({ stage: manifest, file: file.blob, thumb: file.thumbBlob });
  }
  const action = { operationId, kind: "template.save", listId: binding.listId, itemKey: binding.itemKey,
    body: { version: 1, base: { stateRevision: snapshot.state.layouts[snapshot.layoutId].adminCausalSource.base.stateRevision },
      payload, metadata: snapshot.metadata, photoAppend: { version: 1, assets } } };
  adminTemplateIntent({ ...binding, ...action });
  const encoded = await encodeAdminTemplatePhotoRecord({ binding, action, snapshot, files: parts });
  return decodeAdminTemplatePhotoRecord(encoded, binding, operationId);
}
