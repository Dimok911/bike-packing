import { canonicalTemplateJson as canonical, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyStageManifests,
  adminTemplatePhotoTreeCopyStageDigest } from "../sync/admin-template-photo-tree-copy-protocol.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../sync/admin-template-photo-tree-copy-record.js";

const clone = value => JSON.parse(canonical(value));
const exact = (value, keys) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Object.assign(Error("Исходная укладка и выбранная копия требуют сверки. Повторная копия не создана."),
  { code: "admin-template-photo-tree-copy-form", isAdminTemplateBlocked: true });
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");

// The caller freezes both editors and allocates every owner/photo/operation ID
// synchronously. This function derives a typed tree record from that selection;
// it never allocates IDs, normalizes raw server rows or reads photograph bytes.
export async function prepareAdminTemplatePhotoTreeCopyForm(input) {
  try {
    const value = clone(input);
    if (!exact(value, ["binding", "operationId", "sourcePayload", "targetPayload", "snapshot", "sourceRootLocalId", "placementIndex", "fields", "photos"])) throw paused();
    const { binding, operationId, sourcePayload, targetPayload, snapshot, sourceRootLocalId, placementIndex, fields, photos } = value;
    if (!validTemplateOperationId(operationId) || !Array.isArray(snapshot?.copiedOwners)
      || !Array.isArray(photos) || photos.length !== snapshot.copiedOwners.length) throw paused();
    const source = snapshot.source.beforeState.layouts[snapshot.source.layoutId].adminCausalSource;
    const target = snapshot.target.beforeState.layouts[snapshot.target.layoutId].adminCausalSource;
    const selectedRoot = snapshot.source.ownerMap.owners.find(owner => owner.type === "containers" && owner.localId === sourceRootLocalId);
    if (!selectedRoot || !snapshot.copiedOwners.some(owner => owner.entityType === "container" && owner.sourceLocalId === sourceRootLocalId)) throw paused();
    const owners = snapshot.copiedOwners.map((selected, index) => {
      const sourceOwner = snapshot.source.ownerMap.owners.find(owner => owner.localId === selected.sourceLocalId
        && owner.type === (selected.entityType === "item" ? "items" : "containers"));
      if (!sourceOwner || !Array.isArray(photos[index])) throw paused();
      return { entityType: selected.entityType, sourceEntityId: sourceOwner.serverId, entityId: selected.serverId,
        photos: photos[index].map(photo => {
          if (!exact(photo, ["sourcePhotoId", "photoId", "assetId"])) throw paused();
          return { ...photo, assetDigest: "0".repeat(64) };
        }) };
    });
    const body = { version: 1, base: clone(target.base), payload: targetPayload, metadata: clone(snapshot.target.metadata), photoCopy: {
      version: 2, source: { itemKey: source.binding.itemKey, listId: source.binding.listId, base: clone(source.base),
        payloadDigest: await digest(sourcePayload), payload: sourcePayload, layoutId: sourcePayload.activeLayoutId, rootId: selectedRoot.serverId },
      placement: { layoutId: targetPayload.activeLayoutId, index: placementIndex }, fields, owners
    } };
    let intent = adminTemplatePhotoTreeCopyIntent({ ...binding, operationId, kind: "template.save", body });
    const manifests = await adminTemplatePhotoTreeCopyStageManifests(intent), assets = body.photoCopy.owners.flatMap(owner => owner.photos);
    for (const [index, manifest] of manifests.entries()) assets[index].assetDigest = await adminTemplatePhotoTreeCopyStageDigest(manifest);
    intent = adminTemplatePhotoTreeCopyIntent({ ...binding, operationId, kind: "template.save", body });
    return await prepareAdminTemplatePhotoTreeCopyRecord({ binding,
      action: { operationId, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body }, snapshot });
  } catch { throw paused(); }
}
