import { canonicalTemplateJson as canonical, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoWholeCopyIntent, adminTemplatePhotoWholeCopyStageManifests,
  adminTemplatePhotoWholeCopyStageDigest } from "../sync/admin-template-photo-whole-copy-protocol.js";
import { prepareAdminTemplatePhotoWholeCopyRecord } from "../sync/admin-template-photo-whole-copy-record.js";

const clone = value => JSON.parse(canonical(value));
const exact = (value, keys) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Object.assign(Error("Исходный шаблон и выбранная копия требуют сверки. Повторная копия не создана."),
  { code: "admin-template-photo-whole-copy-form", isAdminTemplateBlocked: true });
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");

// No allocation, mutation, persistence or network: the synchronous selection
// fixes every identity. The final typed record proves the exact source editor
// and all manifests independently, including when this helper is called alone.
export async function prepareAdminTemplatePhotoWholeCopyForm(input) {
  try {
    const value = clone(input);
    if (!exact(value, ["binding", "operationId", "sourcePayload", "snapshot", "photos"])) throw paused();
    const { binding, operationId, sourcePayload, snapshot, photos } = value;
    if (!validTemplateOperationId(operationId) || !Array.isArray(snapshot?.copiedOwners)
      || !Array.isArray(photos) || photos.length !== snapshot.copiedOwners.length) throw paused();
    const source = snapshot.source.beforeState.layouts[snapshot.source.layoutId].adminCausalSource;
    const owners = snapshot.copiedOwners.map((selected, index) => {
      const original = snapshot.source.ownerMap.owners.find(owner => owner.localId === selected.sourceLocalId
        && owner.type === (selected.entityType === "item" ? "items" : "containers"));
      if (!original || !Array.isArray(photos[index])) throw paused();
      return { entityType: selected.entityType, sourceEntityId: original.serverId, entityId: selected.serverId,
        photos: photos[index].map(photo => {
          if (!exact(photo, ["sourcePhotoId", "photoId", "assetId"])) throw paused();
          return { ...photo, assetDigest: "0".repeat(64) };
        }) };
    });
    const body = { version: 1, base: null, source: { itemKey: source.binding.itemKey, listId: source.binding.listId,
      base: clone(source.base), payloadDigest: await digest(sourcePayload) }, metadata: clone(snapshot.target.metadata),
      photoCopy: { version: 3, sourcePayload, owners } };
    let intent = adminTemplatePhotoWholeCopyIntent({ ...binding, operationId, kind: "template.copy", body });
    const manifests = await adminTemplatePhotoWholeCopyStageManifests(intent), assets = owners.flatMap(owner => owner.photos);
    for (const [index, manifest] of manifests.entries()) assets[index].assetDigest = await adminTemplatePhotoWholeCopyStageDigest(manifest);
    intent = adminTemplatePhotoWholeCopyIntent({ ...binding, operationId, kind: "template.copy", body });
    return await prepareAdminTemplatePhotoWholeCopyRecord({ binding,
      action: { operationId, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body }, snapshot });
  } catch { throw paused(); }
}
