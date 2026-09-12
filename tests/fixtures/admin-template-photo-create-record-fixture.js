import { randomUUID } from "node:crypto";
import { adminPhotoCreateFixture } from "./admin-template-photo-create-fixture.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

export async function adminPhotoCreateRecordInput(options = {}) {
  const f = await adminPhotoCreateFixture(options), { entityType = "item", empty = false } = options;
  if (empty) {
    f.source.items = {}; f.source.containers = {}; f.source.layouts.source.rootContainerIds = [];
    f.source.layouts.source.arrangement = { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} };
    if (entityType === "item") f.body.photoCreate.formContext.placement = null;
  }
  const layoutId = "create-editor", layout = { id: layoutId, ...(f.binding.listId === "public-demo-state"
    ? { adminDemo: true, adminDemoListId: f.binding.listId } : { adminSharedSourceId: "selected" }) };
  const projection = projectAdminTemplateServerVariant(layout, { exists: true, visibility: "private", stateRevision: 7,
    payload: f.source, metadata: f.body.metadata }, randomUUID(), { photoBinding: f.binding, photoOwnerMapEnabled: true });
  const ownerMap = projection.layout.adminCausalSource.photoOwnerMap;
  projection.layout.adminCausalSource = { ...projection.layout.adminCausalSource, version: 1, binding: structuredClone(f.binding),
    exists: true, visibility: "private", base: { stateRevision: 7 }, planId: null };
  const beforeState = { activeLayoutId: layoutId, layouts: { [layoutId]: projection.layout }, items: projection.items,
    containers: projection.containers, locations: structuredClone(f.source.locations), categories: structuredClone(f.source.categories),
    packedItems: structuredClone(projection.layout.arrangement.packedItems) };
  const files = f.stages.map(({ receipt }, i) => {
    const blob = new Blob([`Original create photo ${i}: exact bytes`], { type: "image/jpeg" });
    const thumbBlob = i % 2 ? null : new Blob([`Create thumbnail ${i}`], { type: "image/webp" });
    return { id: receipt.manifest.photoId, stageOperationId: receipt.manifest.operationId, fileName: `Original ${i}.jpg`,
      type: blob.type, size: blob.size, fullBlobVerified: true, blob, thumbBlob };
  });
  const photos = files.map(file => ({ id: file.id, localId: file.id, status: "pending", url: "", thumbUrl: "",
    fileName: file.fileName, type: file.type, size: file.size, width: 640, height: 480,
    createdAt: "2026-09-12T12:00:00.000Z", updatedAt: "2026-09-12T12:00:00.000Z", error: "" }));
  return { binding: f.binding, operationId: f.operationId,
    snapshot: { version: 1, layoutId, ownerMap, sourcePayload: f.source, beforeState, metadata: f.body.metadata,
      createdOwner: { entityType, localId: `local-${f.entityId}`, serverId: f.entityId } },
    fields: f.body.photoCreate.fields, formContext: f.body.photoCreate.formContext, photos, files };
}
