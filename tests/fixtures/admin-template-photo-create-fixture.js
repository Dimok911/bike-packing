import { createHash, randomUUID } from "node:crypto";
import { canonicalAccessJson } from "../../src/sync/personal-access-protocol.js";
import { adminTemplatePhotoCreateIntent, adminTemplatePhotoCreateStageDigest, adminTemplatePhotoCreatePayload } from "../../src/sync/admin-template-photo-create-protocol.js";

export const copy = value => structuredClone(value);
export const hash = value => createHash("sha256").update(canonicalAccessJson(value)).digest("hex");
export async function adminPhotoCreateFixture({ entityType = "item", placed = true, shared = true, count = 2 } = {}) {
  const operationId = randomUUID(), entityId = `new-${entityType}-${randomUUID()}`;
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: shared ? "public-shared-layout-selected" : "public-demo-state",
    itemKey: shared ? "shared-layout:selected" : "demo-state" };
  const oldPhoto = { photoId: "старое-фото", listId: binding.listId, url: "old://opaque", unknown: { untouched: true } };
  const order = [{ type: "item", id: "old-item" }];
  const source = { activeLayoutId: "source", opaque: { keep: [1, 2] }, locations: [{ id: "location", opaque: true }], categories: [], packedItems: {},
    items: { "old-item": { id: "old-item", name: "Old item", containerId: "сумка", photos: [oldPhoto], opaque: 42 },
      detached: { id: "detached", photos: [], unknown: "catalog record" } },
    containers: { "сумка": { id: "сумка", name: "Old bag", parentId: "", childIds: [], itemIds: ["old-item"], order: copy(order), photos: [], opaque: { keep: true } } },
    layouts: { source: { id: "source", name: "Original", rootContainerIds: ["сумка"], opaque: { keep: true }, arrangement: {
      rootContainerIds: ["сумка"], items: { "old-item": "сумка" }, itemQuantities: { "old-item": 3 }, packedItems: { "old-item": true },
      containers: { "сумка": { parentId: "", childIds: [], itemIds: ["old-item"], order: copy(order), opaque: "kept" } }, unknown: ["raw"] } } } };
  const fields = { name: "New owner", weight: 25.5, color: "blue", location: "location", category: "tools", categories: ["tools"], note: "Note\nline two",
    dimensions: { width: 1.2, height: 3, depth: 0 }, updatedAt: "2026-09-12T12:00:00.000Z", updatedByDeviceId: "test-device", updatedByDeviceName: "Fixture",
    ...(entityType === "item" ? { quantity: 1 } : { volume: 4.5, nestable: true, createdAt: "2026-09-12T12:00:00.000Z" }) };
  const formContext = entityType === "item" ? { version: 1, availabilityStatus: "available", placement: placed ? { layoutId: "source", containerId: "сумка", quantity: 2 } : null }
    : { version: 1, placement: placed ? { layoutId: "source" } : null };
  const assets = [], stages = [], added = [];
  for (let i = 0; i < count; i++) {
    const manifest = { version: 2, ...binding, operationId: randomUUID(), templateOperationId: operationId, baseStateRevision: 7,
      entityType, entityId, photoId: `new-photo-${i}`, file: { hash: hash(`input-${i}`), size: 42, type: "image/jpeg", fileName: `Photo ${i}.jpg` },
      thumb: i % 2 ? null : { hash: hash("thumb-input"), size: 22, type: "image/webp" } };
    const assetDigest = await adminTemplatePhotoCreateStageDigest(manifest), asset = { assetId: manifest.operationId, assetDigest, entityType, entityId, photoId: manifest.photoId };
    const file = { hash: hash(`stored-${i}`), size: 40, type: "image/jpeg", fileName: `Photo-${i}.jpg`, width: 640, height: 480 };
    const thumb = manifest.thumb ? { hash: hash("stored-thumb"), size: 20, type: "image/webp" } : { hash: file.hash, size: file.size, type: file.type };
    assets.push(asset); stages.push({ ok: true, assetState: "ready", receipt: { version: 2, manifest, assetDigest, ownerId: "template-owner",
      baseEntityRevision: 0, stored: { file, thumb } } });
    const { photoId, ...descriptor } = asset;
    added.push({ ...descriptor, photo: { id: photoId, photoId, assetId: asset.assetId, listId: binding.listId, status: "synced",
      url: `https://api.example/api/bike-packing/lists/${binding.listId}/photos/${photoId}/file`,
      thumbUrl: `https://api.example/api/bike-packing/lists/${binding.listId}/photos/${photoId}/thumb`,
      ...Object.fromEntries(["fileName", "size", "type", "width", "height"].map(key => [key, file[key]])) } });
  }
  const body = { version: 1, base: { stateRevision: 7 }, payload: copy(source), metadata: { title: "Template", description: "Original", language: "ru" },
    photoCreate: { version: 1, entityType, entityId, fields, formContext, assets } };
  const request = { ...binding, operationId, kind: "template.save", body }, intent = adminTemplatePhotoCreateIntent(request);
  const confirmedPayload = adminTemplatePhotoCreatePayload(intent, added), result = { version: 1, ownerId: "template-owner", entityType, entityId,
    added, confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) };
  return { binding, operationId, entityId, source, body, request, intent, stages, added, result, expected: { intent, stageReceipts: stages } };
}
