import { treeCopyClientFixture } from "./admin-template-photo-tree-copy-client-fixture.js";
import { adminTemplatePhotoTreeCopyEditorSnapshot, adminTemplatePhotoTreeCopySavePlan } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";

export async function treeCopyProjectionFixture(options = {}) {
  const f = await treeCopyClientFixture(options), { source, target } = f.record.snapshot;
  const arrangement = (bag, item) => ({ rootContainerIds: [bag], containers: { [bag]: { parentId: "", childIds: [], itemIds: [item], order: [{ type: "item", id: item }] } },
    items: { [item]: bag }, itemQuantities: { [item]: 3 }, packedItems: { [item]: true }, opaque: { unrelated: true } });
  const state = { activeLayoutId: "private-layout", locations: ["private location"], categories: ["private category"], packedItems: { "private-item": true },
    unrelatedTopLevel: { keep: [false, null, { route: "never normalize" }] }, layouts: { ...structuredClone(source.beforeState.layouts), ...structuredClone(target.beforeState.layouts),
      "private-layout": { id: "private-layout", rootContainerIds: ["private-bag"], arrangement: arrangement("private-bag", "private-item"), opaque: { keep: "private" } },
      "other-admin-layout": { id: "other-admin-layout", adminSharedSourceId: "other-admin", rootContainerIds: ["other-bag"],
        arrangement: arrangement("other-bag", "other-item"), opaque: { keep: "other editor" } } },
    items: { ...structuredClone(source.beforeState.items), ...structuredClone(target.beforeState.items),
      "private-item": { id: "private-item", containerId: "private-bag", quantity: 9, photos: [{ id: "private-photo", status: "pending", localId: "private-binary" }], opaque: { untouched: true } },
      "other-item": { id: "other-item", containerId: "other-bag", publicCatalogLayoutId: "other-admin-layout", quantity: 2 } },
    containers: { ...structuredClone(source.beforeState.containers), ...structuredClone(target.beforeState.containers),
      "private-bag": { id: "private-bag", parentId: null, childIds: [], itemIds: ["private-item"], order: [{ type: "item", id: "private-item" }] },
      "other-bag": { id: "other-bag", publicCatalogLayoutId: "other-admin-layout", parentId: null, childIds: [], itemIds: ["other-item"], order: [{ type: "item", id: "other-item" }] } } };
  const plan = adminTemplatePhotoTreeCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    editorSnapshot: adminTemplatePhotoTreeCopyEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  return { ...f, state, plan, args: { state, plan, store: f.store, receipt: structuredClone(f.receipt), stageReceipts: structuredClone(f.stages) } };
}
