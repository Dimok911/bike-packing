import { randomUUID } from "node:crypto";
import { adminPhotoTreeCopyRecordInput } from "./admin-template-photo-tree-copy-record-fixture.js";
import { treeAppRunnerFixture } from "./admin-template-photo-tree-copy-runner-fixture.js";
import { allocateAdminTemplatePhotoTreeCopySelection } from "../../src/public/admin-template-photo-tree-copy-selection.js";
import { prepareAdminTemplatePhotoTreeCopyForm } from "../../src/public/admin-template-photo-tree-copy-flow.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { persistAdminTemplatePhotoTreeCopyPending } from "../../src/public/admin-template-photo-tree-copy-pending.js";
import { applyAdminTemplatePhotoTreeCopyResult } from "../../src/public/admin-template-photo-tree-copy-apply.js";
import { assertAdminTemplatePhotoTreeCopyExternalReferences } from "../../src/public/admin-template-photo-tree-copy-projection.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";

export async function treeFormFixture() {
  const original = await adminPhotoTreeCopyRecordInput(), copy = original.action.body.photoCopy, uuidValues = [];
  const sourceRootLocalId = original.snapshot.source.ownerMap.owners.find(row => row.type === "containers" && row.serverId === copy.source.rootId).localId;
  for (const side of [original.snapshot.source, original.snapshot.target]) {
    const layout = side.beforeState.layouts[side.layoutId];
    side.metadata = { title: String(layout.name || "").trim(), description: String(layout.note || "").trim(), language: layout.language || "en" };
  }
  const fields = { ...copy.fields, name: `${original.snapshot.source.beforeState.containers[sourceRootLocalId].name} (copy)` };
  const selection = allocateAdminTemplatePhotoTreeCopySelection({ binding: original.binding, source: original.snapshot.source, target: original.snapshot.target,
    sourceRootLocalId, fields, placementIndex: 1, occupiedIds: [] }, { newUuid() { const id = randomUUID(); uuidValues.push(id); return id; } });
  const prepared = await prepareAdminTemplatePhotoTreeCopyForm({ ...selection, sourcePayload: copy.source.payload, targetPayload: original.action.body.payload });
  const f = await treeAppRunnerFixture({ recordInput: { binding: prepared.binding, action: prepared.action, snapshot: prepared.snapshot } });
  f.values.delete(f.planKey); f.idb.rows().clear(); f.values.set("mirror", JSON.stringify(f.state));
  const attempts = new WeakMap(), notifications = [], allocations = [];
  const input = { entityType: "container", includeContents: true, sourceId: sourceRootLocalId,
    sourceLayoutId: selection.snapshot.source.layoutId, targetLayoutId: selection.snapshot.target.layoutId, placementIndex: 1, formSnapshot: { saved: true } };
  const controls = { current: true, afterBaseline: null };
  const build = (replace = {}) => f.build({ replace, names: ["withAdminTemplatePhotoTreeCopyCaptureInventory", "adminTemplatePhotoTreeCopyFormEnabled", "adminTemplatePhotoTreeCopyEligible",
    "captureAdminTemplatePhotoTreeCopyForm", "applyAdminTemplatePhotoTreeCopyFormResult", "submitAdminTemplatePhotoTreeCopyForm", "resumeAdminTemplatePhotoTreeCopyForm"], deps: {
      adminTemplatePhotoCopyFormEnabled: () => Object.values(f.flags).every(value => value === true),
      currentUser: { id: f.binding.actorId }, canOpenAdminPublishedEdit: () => f.current.admin, administrativePhotoForms: new Map(), adminTemplateSaveCoordinator: () => ({ hasPendingCapture: () => false }),
      administrativePhotoTreeCopyAttempts: attempts, clone: structuredClone, adminTemplatePhotoNamespace,
      allocateAdminTemplatePhotoTreeCopySelection: value => {
        const queue = [...uuidValues]; const actual = allocateAdminTemplatePhotoTreeCopySelection(value, { newUuid: () => queue.shift() });
        allocations.push(actual); return actual;
      },
      prepareAdminTemplatePhotoTreeCopyRecord, prepareAdminTemplatePhotoTreeCopyForm,
      persistAdminTemplatePhotoTreeCopyPending, applyAdminTemplatePhotoTreeCopyResult, assertAdminTemplatePhotoTreeCopyExternalReferences, withAdminTemplateCapture,
      navigator: { locks: f.locks }, localStorage: f.storage, scopedLocalStorageKey: () => "mirror", STORAGE_KEY: "mirror", localStorageScopeKey: `id:${f.binding.actorId}`,
      normalizeUiLanguage: value => value, uiLanguage: "en", nowIso: () => fields.createdAt, currentEditMeta: () => fields,
      restoreAdminPublishedLayoutContext: id => { f.modeState.adminPublishedEditLayoutId = id; return true; },
      adminTemplateSourceBaseline: binding => ({ async read() {
        controls.afterBaseline?.(); return binding.listId === f.binding.listId ? { stateRevision: copy.source.base.stateRevision + 4, payload: original.action.body.payload }
          : { stateRevision: copy.source.base.stateRevision, payload: copy.source.payload };
      } }), render() {} } });
  const submit = () => build().submitAdminTemplatePhotoTreeCopyForm(input, { isCurrent: () => controls.current, onDurable: record => notifications.push(record) });
  return { ...f, selection, prepared, input, submit, form: build, formControls: controls, attempts, notifications, allocations };
}
