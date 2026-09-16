import { createHash, randomUUID } from "node:crypto";
import { canonicalAccessJson } from "../../src/sync/personal-access-protocol.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyStageManifests, adminTemplatePhotoTreeCopyStageDigest,
  adminTemplatePhotoTreeCopyPayload } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";

export const copy = value => structuredClone(value);
export const hash = value => createHash("sha256").update(canonicalAccessJson(value)).digest("hex");
const layout = (id, roots, containers, items, quantities, packed) => ({ id, name: "Raw layout", rootContainerIds: [...roots],
  updatedAt: "2024-01-01T00:00:00Z", opaque: { keep: "layout" }, locations: ["raw divergent mirror"],
  arrangement: { rootContainerIds: [...roots], containers, items, itemQuantities: quantities, packedItems: packed, opaque: { keep: "arrangement" } } });
const placement = parent => ({ parentId: parent, childIds: [], itemIds: [], order: [], opaque: { keep: "placed only" } });
const bag = (id, p) => ({ id, name: `Raw ${id}`, weight: 1.25, volume: 4.25, nestable: true, color: "Raw_Color", photos: [],
  ...copy(p), opaque: { keep: "row only", literalId: id }, createdAt: "2025-01-01T00:00:00Z" });

export async function treeCopyFixture({ depth = 3, owners = 5, photos = 4 } = {}) {
  const sourceBinding = { itemKey: "demo-state:en", listId: "public-demo-state-en" };
  const binding = { environment: "bike-packing-experiment", actorId: "copy-admin", itemKey: "shared-layout:target", listId: "public-shared-layout-target" };
  const source = { opaque: { sourceOnly: [null, 17] }, locations: ["source dictionary"], categories: [], activeLayoutId: "source-layout", packedItems: {},
    containers: {}, items: {}, layouts: {} };
  const placements = {}, itemLinks = {}, quantities = {}, packed = {};
  for (let i = 0; i < depth; i++) {
    const key = `source-bag-${i}`, p = placement(i ? `source-bag-${i - 1}` : ""); placements[key] = p;
    if (i) { placements[p.parentId].childIds.push(key); placements[p.parentId].order.push({ type: "container", id: key }); }
  }
  for (let i = depth; i < owners; i++) {
    const key = `source-item-${i}`, parent = `source-bag-${(i - depth) % depth}`, p = placements[parent];
    p.itemIds.push(key); p.order.unshift({ type: "item", id: key }); itemLinks[key] = parent; quantities[key] = i + 2; packed[key] = true;
    source.items[key] = { id: key, name: `Raw ${key}`, containerId: parent, quantity: 7, photos: [],
      availabilityStatus: "available", opaque: { literalId: key, preserve: [false, { future: 1 }] }, weight: 12.75 };
  }
  for (const [key, p] of Object.entries(placements)) source.containers[key] = bag(key, p);
  const selected = [...Object.keys(source.containers).map(sourceEntityId => ({ entityType: "container", sourceEntityId })),
    ...Object.keys(source.items).map(sourceEntityId => ({ entityType: "item", sourceEntityId }))].sort((a, b) => `${a.entityType}:${a.sourceEntityId}` < `${b.entityType}:${b.sourceEntityId}` ? -1 : 1);
  for (let i = 0; i < photos; i++) {
    const owner = selected[i % selected.length], row = source[owner.entityType === "item" ? "items" : "containers"][owner.sourceEntityId];
    row.photos.push(i % 2 ? { photoId: `old-photo-${i}`, src: `https://old.example/file/${i}`, thumb_url: `https://old.example/thumb/${i}`,
      createdAt: null, updatedAt: "2025-04-02T00:00:00Z" } : { id: `old-photo-${i}`, assetId: randomUUID(), listId: sourceBinding.listId,
      status: "synced", url: `https://old.example/file/${i}`, thumbUrl: `https://old.example/thumb/${i}`, createdAt: "2024-01-01T00:00:00Z" });
  }
  // The non-selected root and detached catalog row deliberately contain photo
  // metadata unsupported for copying. They must remain raw and untouched.
  placements.neighbor = placement(""); source.containers.neighbor = bag("neighbor", placements.neighbor);
  source.containers.neighbor.photos = [{ id: "neighbor-photo", futureMetadata: { keep: true } }];
  source.items.detached = { id: "detached", photos: [], opaque: { keep: "catalog only" } };
  source.layouts["source-layout"] = layout("source-layout", ["source-bag-0", "neighbor"], placements, itemLinks, quantities, packed);
  const targetP = placement(""); targetP.itemIds = ["target-item"]; targetP.order = [{ type: "item", id: "target-item" }];
  const target = { opaque: { targetOnly: [1, "source-bag-0"] }, activeLayoutId: "target-layout", locations: ["target dictionary"], categories: [], packedItems: {},
    containers: { "target-bag": bag("target-bag", targetP) }, items: { "target-item": { id: "target-item", name: "Target original", containerId: "target-bag", photos: [{ photoId: "target-photo", futureMetadata: 8 }], quantity: 4 } },
    layouts: { "target-layout": layout("target-layout", ["target-bag"], { "target-bag": targetP }, { "target-item": "target-bag" }, { "target-item": 9 }, { "target-item": true }) } };
  const operationId = randomUUID(), mapping = selected.map((owner, index) => ({ ...owner, entityId: `new-owner-${index}`,
    photos: source[owner.entityType === "item" ? "items" : "containers"][owner.sourceEntityId].photos.map((photo, pi) => ({ sourcePhotoId: photo.id ?? photo.photoId,
      photoId: `new-photo-${index}-${pi}`, assetId: randomUUID(), assetDigest: "0".repeat(64) })) }));
  const body = { version: 1, base: { stateRevision: 11 }, payload: target, metadata: { title: "Target", description: "Keep metadata", language: "ru" }, photoCopy: {
    version: 2, source: { ...sourceBinding, base: { stateRevision: 7 }, payloadDigest: hash(source), payload: source, layoutId: "source-layout", rootId: "source-bag-0" },
    placement: { layoutId: "target-layout", index: 1 }, fields: { name: "Whole tree copy", createdAt: "2026-09-12T12:00:00Z", updatedAt: "2026-09-12T12:00:00Z", updatedByDeviceId: "device", updatedByDeviceName: "Fixture" }, owners: mapping } };
  const request = { ...binding, operationId, kind: "template.save", body };
  return prepareTreeFixture(request);
}

export async function prepareTreeFixture(request) {
  const manifests = await adminTemplatePhotoTreeCopyStageManifests(request), assets = request.body.photoCopy.owners.flatMap(owner => owner.photos);
  for (const [i, manifest] of manifests.entries()) assets[i].assetDigest = await adminTemplatePhotoTreeCopyStageDigest(manifest);
  const intent = adminTemplatePhotoTreeCopyIntent(request), c = intent.body.photoCopy;
  const added = c.owners.map(owner => ({ entityType: owner.entityType, sourceEntityId: owner.sourceEntityId, entityId: owner.entityId,
    added: owner.photos.map((asset, index) => {
      const raw = c.source.payload[owner.entityType === "item" ? "items" : "containers"][owner.sourceEntityId].photos[index];
      return { assetId: asset.assetId, assetDigest: asset.assetDigest, sourcePhotoId: asset.sourcePhotoId,
        photo: { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: intent.listId, status: "synced",
          url: `/bike-packing/lists/${intent.listId}/photos/${asset.photoId}/file`, thumbUrl: `/bike-packing/lists/${intent.listId}/photos/${asset.photoId}/thumb`,
          fileName: "Preserved.jpg", type: "image/jpeg", size: 42, width: 640, height: 480,
          ...Object.fromEntries(["createdAt", "updatedAt"].filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])) } };
    }) }));
  return { request, body: request.body, intent, manifests, added, projected: adminTemplatePhotoTreeCopyPayload(intent, added) };
}
