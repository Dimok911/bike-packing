import { createHash, randomUUID } from "node:crypto";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoWholeCopySourceReference } from "../../src/sync/admin-template-photo-whole-copy-source.js";
import { wholeCopyFixture } from "./admin-template-photo-whole-copy-fixture.js";
import { adminTemplatePhotoWholeCopyIntent, adminTemplatePhotoWholeCopyStageManifests, adminTemplatePhotoWholeCopyStageDigest,
  adminTemplatePhotoWholeCopyPayload } from "../../src/sync/admin-template-photo-whole-copy-protocol.js";

export const copy = structuredClone;
export const clone = structuredClone;
export const hash = value => createHash("sha256").update(canonicalTemplateJson(value)).digest("hex");

export async function wholeCopyProtocolFixture() {
  const f = wholeCopyFixture(), targetId = randomUUID();
  const input = { environment: "bike-packing-experiment", actorId: "whole-copy-admin", operationId: f.operationId, kind: "template.copy",
    itemKey: `shared-layout:${targetId}`, listId: `public-shared-layout-${targetId}`,
    body: { version: 1, base: null, source: { itemKey: "demo-state:whole-source", listId: f.sourceListId,
      base: { stateRevision: 7 }, payloadDigest: hash(f.sourcePayload) }, metadata: f.metadata,
    photoCopy: { version: 3, sourcePayload: f.sourcePayload, owners: f.owners.map(owner => ({ entityType: owner.entityType,
      sourceEntityId: owner.sourceEntityId, entityId: owner.entityId, photos: owner.photos.map(photo => ({
        sourcePhotoId: photo.sourcePhotoId, photoId: randomUUID(), assetId: randomUUID(), assetDigest: "0".repeat(64) })) })) } } };
  return prepareWholeCopyProtocolFixture(input);
}

export async function prepareWholeCopyProtocolFixture(input) {
  const manifests = await adminTemplatePhotoWholeCopyStageManifests(input), assets = input.body.photoCopy.owners.flatMap(owner => owner.photos);
  for (const [index, manifest] of manifests.entries()) assets[index].assetDigest = await adminTemplatePhotoWholeCopyStageDigest(manifest);
  const intent = adminTemplatePhotoWholeCopyIntent(input), sourcePayload = intent.body.photoCopy.sourcePayload;
  const added = intent.body.photoCopy.owners.map(owner => ({ entityType: owner.entityType, sourceEntityId: owner.sourceEntityId, entityId: owner.entityId,
    added: owner.photos.map((asset, index) => {
      const original = sourcePayload[owner.entityType === "item" ? "items" : "containers"][owner.sourceEntityId].photos[index];
      const route = `/letters-vniipo/api/bike-packing/lists/${intent.listId}/photos/${asset.photoId}`;
      return { assetId: asset.assetId, assetDigest: asset.assetDigest, sourcePhotoId: asset.sourcePhotoId,
        photo: { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: intent.listId, status: "synced",
          url: route + "/file", thumbUrl: route + "/thumb", fileName: "Original.png", type: "image/png", size: 42, width: 1, height: 1,
          ...adminTemplatePhotoWholeCopySourceReference(original, intent.body.source.listId) } };
    }) }));
  return { input, request: input, body: input.body, intent, sourcePayload, manifests, added, resultOwners: added,
    projected: adminTemplatePhotoWholeCopyPayload(intent, added) };
}
