import { randomUUID } from "node:crypto";
import { adminPhotoCreateFixture, copy, hash } from "./admin-template-photo-create-fixture.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyStageDigest,
  adminTemplatePhotoCopyMaterialization, adminTemplatePhotoCopyPayload } from "../../src/sync/admin-template-photo-copy-protocol.js";

export { copy, hash };
export async function adminPhotoCopyFixture({ entityType = "item", count = 2 } = {}) {
  const base = await adminPhotoCreateFixture({ placed: false }), payload = copy(base.source), sourcePayload = copy(base.source);
  const binding = base.binding, operationId = randomUUID(), entityId = `copied-${entityType}-${randomUUID()}`;
  const sourceBinding = { itemKey: "demo-state:en", listId: "public-demo-state-en" }, sourceEntityId = entityType === "item" ? "old-item" : "сумка";
  const sourceOwner = sourcePayload[entityType === "item" ? "items" : "containers"][sourceEntityId];
  sourceOwner.opaque = { preserve: [null, false, { future: 7 }] }; sourceOwner.weight = 13.75; sourceOwner.color = "Raw_Color";
  sourceOwner.createdAt = "2025-01-01T00:00:00Z"; sourceOwner.availabilityStatus = "lost";
  sourceOwner.photos = Array.from({ length: count }, (_, i) => i % 2 ? {
    photoId: `source-photo-${i}`, src: `https://old.example/photo/${i}`, thumb_url: `https://old.example/thumb/${i}`,
    fileName: `Photo-${i}.jpg`, type: "image/jpeg", size: 42, width: 640, height: 480,
    createdAt: null, updatedAt: "2026-09-12T01:00:00Z", localId: "", error: ""
  } : {
    id: i === 0 ? "старое-фото" : `source-photo-${i}`, photoId: i === 0 ? "старое-фото" : `source-photo-${i}`,
    assetId: randomUUID(), listId: sourceBinding.listId, status: "synced", url: `https://old.example/photo/${i}`, thumbUrl: `https://old.example/thumb/${i}`,
    fileName: `Photo-${i}.jpg`, type: "image/jpeg", size: 42, width: 640, height: 480,
    createdAt: "2025-01-02T00:00:00Z", updatedAt: "2026-09-12T01:00:00Z"
  });
  // Bag contents belong to the unchanged source; only the selected bag's own photos copy.
  if (entityType === "container") {
    sourcePayload.items["old-item"].photos = [{ id: "child-photo", unknown: { keep: true } }];
    const links = { parentId: "сумка", childIds: [], itemIds: [], order: [] };
    sourcePayload.containers["nested-bag"] = { id: "nested-bag", ...copy(links), photos: [{ id: "nested-photo", unknown: true }], opaque: "nested" };
    sourceOwner.childIds.push("nested-bag"); sourceOwner.order.push({ type: "container", id: "nested-bag" });
    const a = sourcePayload.layouts.source.arrangement;
    a.containers["nested-bag"] = copy(links); a.containers["сумка"].childIds.push("nested-bag");
    a.containers["сумка"].order.push({ type: "container", id: "nested-bag" });
  }
  sourcePayload.locations = ["different source dictionary"]; sourcePayload.layouts.source.locations = ["raw layout mirror"];
  const fields = { name: "Copied owner", createdAt: "2026-09-12T12:00:00Z", updatedAt: "2026-09-12T12:00:00Z",
    updatedByDeviceId: "copy-device", updatedByDeviceName: "Copy fixture" };
  const assets = sourceOwner.photos.map((photo, i) => ({ assetId: randomUUID(), assetDigest: "0".repeat(64), sourcePhotoId: photo.id ?? photo.photoId, photoId: `copied-photo-${i}` }));
  const body = { version: 1, base: { stateRevision: 9 }, payload, metadata: copy(base.body.metadata), photoCopy: {
    version: 1, entityType, entityId, fields, source: { ...sourceBinding, base: { stateRevision: 7 }, payloadDigest: hash(sourcePayload), payload: sourcePayload, entityId: sourceEntityId }, assets } };
  const request = { ...binding, operationId, kind: "template.save", body };
  const manifests = await adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent(request));
  for (const [index, manifest] of manifests.entries()) assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
  const intent = adminTemplatePhotoCopyIntent(request), stages = [], added = [];
  for (const [index, asset] of assets.entries()) {
    const stored = { file: { hash: hash(`source-stored-file-${index}`), size: 42, type: "image/jpeg", fileName: `Photo-${index}.jpg`, width: 640, height: 480 },
      thumb: { hash: hash(`source-stored-thumb-${index}`), size: 20, type: "image/webp" } };
    const materialization = await adminTemplatePhotoCopyMaterialization({ filePath: `legacy/source-${index}.jpg`, thumbPath: `legacy/source-${index}.webp` },
      { filePath: `operations/${asset.assetId}.file.jpg`, thumbPath: `operations/${asset.assetId}.thumb.webp` });
    stages.push({ ok: true, assetState: "ready", receipt: { version: 1, kind: "admin-template-photo-copy", manifest: manifests[index], assetDigest: asset.assetDigest,
      sourceOwnerId: "source-template-owner", ownerId: "target-template-owner", baseEntityRevision: 0, sourceStored: copy(stored), stored, materialization } });
    const photo = { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: binding.listId, status: "synced",
      url: `https://api.example/api/bike-packing/lists/${binding.listId}/photos/${asset.photoId}/file`,
      thumbUrl: `https://api.example/api/bike-packing/lists/${binding.listId}/photos/${asset.photoId}/thumb`,
      ...Object.fromEntries(["fileName", "type", "size", "width", "height"].map(key => [key, stored.file[key]])),
      ...Object.fromEntries(["createdAt", "updatedAt"].filter(key => Object.hasOwn(sourceOwner.photos[index], key)).map(key => [key, sourceOwner.photos[index][key]])) };
    added.push({ assetId: asset.assetId, assetDigest: asset.assetDigest, sourcePhotoId: asset.sourcePhotoId, photo });
  }
  const confirmedPayload = adminTemplatePhotoCopyPayload(intent, added), result = { version: 1, sourceOwnerId: "source-template-owner", ownerId: "target-template-owner",
    entityType, entityId, added, confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) };
  const observation = { actorId: binding.actorId, canManage: true,
    source: { ...sourceBinding, stateRevision: 7, visibility: "private", deleted: false, ownerId: result.sourceOwnerId, payload: copy(sourcePayload) },
    target: { itemKey: binding.itemKey, listId: binding.listId, stateRevision: 9, visibility: "private", deleted: false, ownerId: result.ownerId, payload: copy(payload) } };
  return { request, body, intent, operationId, binding, entityId, sourceOwner, manifests, stages, added, result, observation, expected: { intent, stageReceipts: stages } };
}
