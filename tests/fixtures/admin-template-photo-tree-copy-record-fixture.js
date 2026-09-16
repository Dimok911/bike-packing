import { randomUUID } from "node:crypto";
import { treeCopyFixture, hash } from "./admin-template-photo-tree-copy-fixture.js";
import { adminTemplatePhotoTreeCopyStageManifests, adminTemplatePhotoTreeCopyStageDigest } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

export async function refreshTreeRecordDigests(input) {
  const copy = input.action.body.photoCopy;
  copy.source.payloadDigest = hash(copy.source.payload);
  const manifests = await adminTemplatePhotoTreeCopyStageManifests({ ...input.binding, ...input.action }), assets = copy.owners.flatMap(owner => owner.photos);
  for (const [index, manifest] of manifests.entries()) assets[index].assetDigest = await adminTemplatePhotoTreeCopyStageDigest(manifest);
}

export async function adminPhotoTreeCopyRecordInput({ sameProjectionId = false, ...options } = {}) {
  const f = await treeCopyFixture(options), { environment, actorId, itemKey, listId } = f.intent;
  const binding = { environment, actorId, itemKey, listId }, action = { operationId: f.intent.id, kind: "template.save", itemKey, listId, body: structuredClone(f.body) };
  const copy = action.body.photoCopy, input = { binding, action };
  // Match assembled list bindings on every raw photo, including unselected
  // opaque legacy references. None of their other raw metadata is replaced.
  for (const [payload, photoListId] of [[copy.source.payload, copy.source.listId], [action.body.payload, listId]])
    for (const type of ["items", "containers"]) for (const row of Object.values(payload[type])) for (const photo of row.photos || []) {
      photo.listId = photoListId;
      // Current causal references require the complete stored-file shape in
      // the real renderer; the pure grammar fixture also exercises partial raw refs.
      if (photo.assetId) Object.assign(photo, { photoId: photo.id, fileName: "Original.jpg", type: "image/jpeg", size: 42, width: 640, height: 480 });
    }
  await refreshTreeRecordDigests(input);
  const sourceDecisionId = randomUUID();
  const side = (sideBinding, payload, revision, label, metadata) => {
    const layoutId = `tree-${label}-editor`, demo = sideBinding.listId.startsWith("public-demo-state");
    const layout = { id: layoutId, ...(demo ? { adminDemo: true, adminDemoListId: sideBinding.listId, adminDemoLanguage: metadata.language }
      : { adminSharedSourceId: sideBinding.listId.slice("public-shared-layout-".length) }) };
    const projection = projectAdminTemplateServerVariant(layout, { exists: true, visibility: "private", stateRevision: revision, payload, metadata },
      label === "source" || sameProjectionId ? sourceDecisionId : randomUUID(), { photoBinding: sideBinding, photoOwnerMapEnabled: true });
    const ownerMap = projection.layout.adminCausalSource.photoOwnerMap;
    projection.layout.adminCausalSource = { ...projection.layout.adminCausalSource, version: 1, binding: structuredClone(sideBinding), exists: true,
      visibility: "private", deleted: false, base: { stateRevision: revision }, planId: null };
    const beforeState = { activeLayoutId: layoutId, layouts: { [layoutId]: projection.layout }, items: projection.items, containers: projection.containers,
      locations: structuredClone(payload.locations || []), categories: structuredClone(payload.categories || []), packedItems: structuredClone(projection.layout.arrangement.packedItems) };
    return { layoutId, ownerMap, beforeState, metadata: structuredClone(metadata) };
  };
  const source = side({ ...binding, listId: copy.source.listId, itemKey: copy.source.itemKey }, copy.source.payload, copy.source.base.stateRevision,
    "source", { title: "Tree source", description: "Raw confirmed source", language: "en" });
  const target = side(binding, action.body.payload, action.body.base.stateRevision, "target", action.body.metadata);
  input.snapshot = { version: 1, source, target, copiedOwners: copy.owners.map(owner => ({ entityType: owner.entityType,
    sourceLocalId: source.ownerMap.owners.find(row => row.type === (owner.entityType === "item" ? "items" : "containers") && row.serverId === owner.sourceEntityId).localId,
    localId: `local-${owner.entityId}`, serverId: owner.entityId })) };
  return input;
}
