import { adminPhotoIndexedDBFixture } from "./admin-template-photo-record-fixture.js";
import { adminPhotoTreeCopyRecordInput, refreshTreeRecordDigests } from "./admin-template-photo-tree-copy-record-fixture.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { createAdminTemplatePhotoTreeCopyActionStore } from "../../src/sync/admin-template-photo-tree-copy-action-store.js";

export async function treeStoreInput({ targetRevision = 11, ...options } = {}) {
  const input = structuredClone(await adminPhotoTreeCopyRecordInput(options));
  if (input.action.body.base.stateRevision !== targetRevision) {
    const side = input.snapshot.target, source = side.beforeState.layouts[side.layoutId].adminCausalSource;
    input.action.body.base.stateRevision = targetRevision; source.base.stateRevision = targetRevision;
    side.ownerMap.stateRevision = targetRevision; source.photoOwnerMap.stateRevision = targetRevision;
    await refreshTreeRecordDigests(input);
  }
  return input;
}

// Reuse the eventful, serialized IDB transaction model. This proves orchestration
// against cloned transaction snapshots; native browser quota remains a later proof.
export async function treeActionStoreFixture(options = {}) {
  const input = await treeStoreInput(options), prepared = await prepareAdminTemplatePhotoTreeCopyRecord(input), fake = adminPhotoIndexedDBFixture();
  const idb = { ...fake, rows: (name = "actions") => fake.databases.get("bike-packing-admin-template-photo-tree-copy-actions-v1")?.stores.get(name) };
  const context = { ...input.binding, scope: "admin-template", admin: true, generation: "tree-copy-generation" };
  const create = extra => createAdminTemplatePhotoTreeCopyActionStore({ binding: input.binding, indexedDB: idb.indexedDB,
    getContext: () => context, enabled: true, ...extra });
  return { input, prepared, idb, context, create, store: create(), value: { action: input.action, snapshot: input.snapshot } };
}
