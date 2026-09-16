import { randomUUID } from "node:crypto";
import { adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { adminPhotoEditFixture, copy, hash } from "./admin-template-photo-edit-fixture.js";

export { copy, hash };
export async function adminPhotoReplaceFixture({ entityType = "item", photoIds = ["photo-new-1", "photo-2", "photo-new-2", "photo-1"] } = {}) {
  const f = adminPhotoEditFixture({ entityType }), operationId = randomUUID();
  const body = copy(f.body); delete body.photoEdit;
  const assets = [], stageReceipts = [], added = [];
  for (let index = 1; index <= 2; index++) {
    const stage = { version: 1, ...f.binding, operationId: randomUUID(), templateOperationId: operationId,
      baseStateRevision: 7, entityType, entityId: f.serverId, photoId: `photo-new-${index}`,
      file: { hash: hash(`Original ${index}`), size: 40 + index, type: "image/jpeg", fileName: `Новое ${index}.jpg` },
      thumb: index === 1 ? { hash: hash("Input thumbnail"), size: 15, type: "image/webp" } : null };
    const assetDigest = await adminTemplatePhotoStageDigest(stage), asset = { assetId: stage.operationId, assetDigest, entityType, entityId: f.serverId, photoId: stage.photoId };
    const file = { hash: hash(`Server stripped ${index}`), size: 30 + index, type: "image/jpeg", fileName: stage.file.fileName, width: 600, height: 400 };
    const thumb = stage.thumb ? { hash: hash("Server thumbnail"), size: 12, type: "image/webp" } : { hash: file.hash, size: file.size, type: file.type };
    assets.push(asset);
    stageReceipts.push({ ok: true, assetState: "ready", receipt: { version: 1, manifest: stage, assetDigest,
      ownerId: "template-owner", baseEntityRevision: 5, stored: { file, thumb } } });
    const photo = { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: f.binding.listId, status: "synced",
      url: `https://example.test/api/bike-packing/lists/${f.binding.listId}/photos/${asset.photoId}/file`,
      thumbUrl: `https://example.test/api/bike-packing/lists/${f.binding.listId}/photos/${asset.photoId}/thumb`,
      fileName: file.fileName, type: file.type, size: file.size, width: file.width, height: file.height };
    const { photoId: _photoId, ...descriptor } = asset; added.push({ ...descriptor, photo });
  }
  body.photoAppend = { version: 2, assets, photoIds: [...photoIds] };
  const intent = adminTemplateIntent({ ...f.binding, operationId, kind: "template.save", body });
  const confirmedPayload = copy(body.payload), old = body.payload[f.type][f.serverId].photos;
  const references = new Map([...old.map(photo => [photo.id ?? photo.photoId, photo]), ...added.map(value => [value.photo.id, value.photo])]);
  confirmedPayload[f.type][f.serverId].photos = photoIds.map(id => copy(references.get(id)));
  const result = { version: 2, ownerId: "template-owner", added, photoIds: [...photoIds],
    removedPhotoIds: old.map(photo => photo.id ?? photo.photoId).filter(id => !photoIds.includes(id)),
    confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) };
  return { binding: f.binding, sourcePayload: f.sourcePayload, type: f.type, serverId: f.serverId, operationId, body, intent,
    result, stageReceipts, expected: { intent, stageReceipts } };
}
