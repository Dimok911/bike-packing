import { randomUUID } from "node:crypto";
import { adminPhotoCopyFixture, hash } from "./admin-template-photo-copy-fixture.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyStageDigest } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { adminPhotoIndexedDBFixture } from "./admin-template-photo-record-fixture.js";

export async function adminPhotoCopyRecordInput(options = {}) {
  const f = await adminPhotoCopyFixture(options), action = { operationId: f.operationId, kind: "template.save", listId: f.binding.listId,
    itemKey: f.binding.itemKey, body: structuredClone(f.body) }, copy = action.body.photoCopy;
  // Real assembled admin rows carry their list binding, including unselected
  // opaque photos. The pure source fixture intentionally has looser raw rows.
  for (const type of ["items", "containers"]) for (const row of Object.values(copy.source.payload[type]))
    for (const photo of row.photos || []) {
      photo.listId = copy.source.listId;
      // Existing Unicode IDs are legacy references. Current causal uploaded
      // references always allocate ASCII photo IDs; the renderer enforces it.
      if (!/^[A-Za-z0-9._:-]+$/.test(photo.id ?? photo.photoId)) delete photo.assetId;
    }
  copy.source.payloadDigest = hash(copy.source.payload);
  const manifests = await adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent({ ...f.binding, ...action }));
  for (const [index, manifest] of manifests.entries()) copy.assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
  const side = (binding, payload, revision, label, metadata) => {
    const layoutId = `copy-${label}-editor`, demo = binding.listId.startsWith("public-demo-state");
    const layout = { id: layoutId, ...(demo ? { adminDemo: true, adminDemoListId: binding.listId, adminDemoLanguage: metadata.language }
      : { adminSharedSourceId: binding.listId.slice("public-shared-layout-".length) }) };
    const projection = projectAdminTemplateServerVariant(layout, { exists: true, visibility: "private", stateRevision: revision, payload, metadata },
      randomUUID(), { photoBinding: binding, photoOwnerMapEnabled: true });
    const ownerMap = projection.layout.adminCausalSource.photoOwnerMap;
    projection.layout.adminCausalSource = { ...projection.layout.adminCausalSource, version: 1, binding: structuredClone(binding), exists: true,
      visibility: "private", deleted: false, base: { stateRevision: revision }, planId: null };
    const beforeState = { activeLayoutId: layoutId, layouts: { [layoutId]: projection.layout }, items: projection.items, containers: projection.containers,
      locations: structuredClone(payload.locations || []), categories: structuredClone(payload.categories || []), packedItems: structuredClone(projection.layout.arrangement.packedItems) };
    return { layoutId, ownerMap, beforeState, metadata: structuredClone(metadata) };
  };
  const source = side({ ...f.binding, listId: copy.source.listId, itemKey: copy.source.itemKey }, copy.source.payload,
    copy.source.base.stateRevision, "source", { title: "Source template", description: "Unchanged source", language: "en" });
  const target = side(f.binding, action.body.payload, action.body.base.stateRevision, "target", action.body.metadata);
  const selected = source.ownerMap.owners.find(row => row.type === (copy.entityType === "item" ? "items" : "containers") && row.serverId === copy.source.entityId);
  return { binding: f.binding, action, snapshot: { version: 1, source, target, copiedOwner: {
    entityType: copy.entityType, sourceLocalId: selected.localId, localId: `local-${copy.entityId}`, serverId: copy.entityId } } };
}

export function adminPhotoCopyIndexedDBFixture() {
  const fixture = adminPhotoIndexedDBFixture();
  return { ...fixture, rows: (storeName = "actions") => fixture.databases.get("bike-packing-admin-template-photo-copy-actions-v1")?.stores.get(storeName) };
}
