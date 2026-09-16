import { randomUUID } from "node:crypto";
import { wholeCopyProtocolFixture, prepareWholeCopyProtocolFixture, hash } from "./admin-template-photo-whole-copy-protocol-fixture.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { prepareAdminTemplatePhotoWholeCopyRecord } from "../../src/sync/admin-template-photo-whole-copy-record.js";
import { createAdminTemplatePhotoWholeCopyActionStore, readAdminTemplatePhotoWholeCopyActorInventory } from "../../src/sync/admin-template-photo-whole-copy-action-store.js";
import { wholePhotoIndexedDBFixture } from "./admin-template-photo-whole-copy-idb-fixture.js";

export async function refreshWholeRecordDigests(input) {
  input.action.body.source.payloadDigest = hash(input.action.body.photoCopy.sourcePayload);
  await prepareWholeCopyProtocolFixture({ ...input.binding, ...input.action });
}
export async function wholeRecordInput({ protocolInput, sourceVisibility = "private" } = {}) {
  const f = protocolInput ? await prepareWholeCopyProtocolFixture(structuredClone(protocolInput)) : await wholeCopyProtocolFixture();
  const { environment, actorId, itemKey, listId } = f.intent, binding = { environment, actorId, itemKey, listId };
  const action = { operationId: f.intent.id, kind: "template.copy", itemKey, listId, body: structuredClone(f.body) };
  const sourceBinding = { ...binding, itemKey: action.body.source.itemKey, listId: action.body.source.listId };
  const payload = action.body.photoCopy.sourcePayload, revision = action.body.source.base.stateRevision;
  const layoutId = "whole-source-editor", metadata = { title: "Whole source", description: "Confirmed raw catalog", language: "en" };
  const projection = projectAdminTemplateServerVariant({ id: layoutId, adminDemo: true, adminDemoListId: sourceBinding.listId, adminDemoLanguage: "en" },
    { exists: true, visibility: sourceVisibility, stateRevision: revision, payload, metadata }, randomUUID(), { photoBinding: sourceBinding, photoOwnerMapEnabled: true, allowPublicSource: true });
  const ownerMap = projection.layout.adminCausalSource.photoOwnerMap;
  projection.layout.adminCausalSource = { ...projection.layout.adminCausalSource, version: 1, binding: structuredClone(sourceBinding),
    exists: true, visibility: sourceVisibility, deleted: false, base: { stateRevision: revision }, planId: null };
  projection.layout.templatePublished = sourceVisibility === "public";
  const source = { layoutId, ownerMap, metadata, beforeState: { activeLayoutId: layoutId, layouts: { [layoutId]: projection.layout },
    items: projection.items, containers: projection.containers, locations: structuredClone(payload.locations),
    categories: structuredClone(payload.categories), packedItems: structuredClone(projection.layout.arrangement.packedItems) } };
  return { binding, action, snapshot: { version: 1, source,
    target: { layoutId: `local-layout-${action.operationId}`, serverLayoutId: `layout-${action.operationId}`, metadata: structuredClone(action.body.metadata) },
    copiedOwners: action.body.photoCopy.owners.map(owner => ({ entityType: owner.entityType,
      sourceLocalId: ownerMap.owners.find(row => row.type === (owner.entityType === "item" ? "items" : "containers") && row.serverId === owner.sourceEntityId).localId,
      localId: `local-${owner.entityId}`, serverId: owner.entityId })) } };
}
export async function wholeStoreFixture({ recordInput } = {}) {
  const input = recordInput || await wholeRecordInput(), prepared = await prepareAdminTemplatePhotoWholeCopyRecord(input), idb = wholePhotoIndexedDBFixture();
  const context = { ...input.binding, scope: "admin-template", admin: true, generation: "whole-generation" };
  const create = extra => createAdminTemplatePhotoWholeCopyActionStore({ binding: input.binding, getContext: () => context,
    indexedDB: idb.indexedDB, enabled: true, ...extra });
  const inventory = extra => readAdminTemplatePhotoWholeCopyActorInventory({ actorId: input.binding.actorId, environment: input.binding.environment,
    indexedDB: idb.indexedDB, getContext: () => context, ...extra });
  return { input, prepared, idb, context, create, inventory, store: create(), value: { action: input.action, snapshot: input.snapshot } };
}
