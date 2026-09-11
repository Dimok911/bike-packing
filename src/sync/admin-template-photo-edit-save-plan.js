import { adminTemplateIntent, canonicalTemplateJson } from "./admin-template-protocol.js";
import { adminTemplatePhotoEdit, adminTemplatePhotoEditFields, assertAdminTemplatePhotoEditPayload } from "./admin-template-photo-edit-protocol.js";
import { assertAdminTemplatePhotoOwnerMap } from "./admin-template-photo-owner-map.js";
import { assertAdminTemplatePhotoView } from "./admin-template-photo-view.js";
import { recoverPersonalAdminDrafts } from "./personal-admin-draft-recovery.js";
import { personalBusinessPayload } from "./personal-business-payload.js";
import { stripAdminTemplateEditorMetadata } from "../public/admin-template-causal-save-flow.js";

const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (left, right) => canonicalTemplateJson(left) === canonicalTemplateJson(right);
const fail = () => { throw Object.assign(Error("Сохранённая форма изменения фотографий требует сверки."),
  { code: "admin-template-plan-paused", isAdminTemplateBlocked: true }); };
const collections = ["layouts", "items", "containers"];
const fieldValue = (row, field) => Object.hasOwn(row, field) ? [row[field]] : [];

// A JSON-only selection captures the confirmed raw source and both complete
// editor views. It neither uploads files nor grants dispatch authority.
export function adminTemplatePhotoEditSavePlan({ binding, operationId, body, editorSnapshot, photoSnapshot }) {
  try {
    if (!exact(binding, ["actorId", "environment", "listId", "itemKey"])
      || !exact(photoSnapshot, ["version", "layoutId", "ownerMap", "sourcePayload", "beforeState", "state", "metadata"])
      || photoSnapshot.version !== 1 || !exact(editorSnapshot, ["payload", "metadata"])) fail();
    const intent = adminTemplateIntent({ ...binding, operationId, kind: "template.save", body });
    const edit = adminTemplatePhotoEdit(intent.body, operationId), { layoutId, ownerMap, sourcePayload, beforeState, state, metadata } = photoSnapshot;
    canonicalTemplateJson(photoSnapshot); canonicalTemplateJson(editorSnapshot);
    if (!same(metadata, intent.body.metadata) || !same(editorSnapshot.metadata, metadata)
      || !plain(sourcePayload.layouts) || Object.keys(sourcePayload.layouts).length !== 1) fail();
    const stateRevision = intent.body.base.stateRevision;
    for (const value of [beforeState, state]) {
      if (!exact(value, ["activeLayoutId", "layouts", "items", "containers", "locations", "categories", "packedItems"])
        || value.activeLayoutId !== layoutId || !plain(value.layouts) || Object.keys(value.layouts).length !== 1) fail();
      assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision, map: ownerMap, state: value, sourcePayload });
      const source = value.layouts[layoutId].adminCausalSource;
      if (!plain(source) || source.version !== 1 || !same(source.binding, binding) || source.exists !== true
        || source.visibility !== "private" || source.deleted || source.planId || source.photoAppendPending || source.photoEditPending
        || !exact(source.base, ["stateRevision"]) || source.base.stateRevision !== stateRevision) fail();
      const owned = recoverPersonalAdminDrafts({ layouts: {}, items: {}, containers: {} }, canonicalTemplateJson(value),
        { scopeKey: `id:${binding.actorId}`, enabled: true });
      if (collections.some(type => !same(owned[type], value[type]))) fail();
    }
    const type = edit.entityType === "item" ? "items" : "containers";
    const mapped = ownerMap.owners.find(row => row.type === type && row.serverId === edit.entityId);
    if (!mapped) fail();
    assertAdminTemplatePhotoEditPayload(sourcePayload, intent.body.payload, edit);
    const fields = adminTemplatePhotoEditFields(edit.entityType);
    const projection = value => { const result = clone(value); for (const field of [...fields, "photos"]) delete result[type][mapped.localId][field]; return result; };
    if (!same(projection(beforeState), projection(state))) fail();
    const rawBefore = sourcePayload[type][edit.entityId], rawAfter = intent.body.payload[type][edit.entityId];
    const before = beforeState[type][mapped.localId], after = state[type][mapped.localId];
    for (const field of fields) if ((!same(fieldValue(rawBefore, field), fieldValue(rawAfter, field))
      || !same(fieldValue(before, field), fieldValue(after, field))) && !same(fieldValue(rawAfter, field), fieldValue(after, field))) fail();
    const baseline = beforeState.layouts[layoutId].adminCausalSource.photoView;
    assertAdminTemplatePhotoView({ binding, layoutId, baseline, state: beforeState });
    for (const row of ownerMap.owners) {
      const raw = sourcePayload[row.type][row.serverId].photos || [];
      const view = baseline?.owners.find(value => value.type === row.type && value.localId === row.localId);
      if (raw.length && (!view || view.serverId !== row.serverId || !same(view.rawPhotos, raw))) fail();
      if (view && (view.serverId !== row.serverId || !same(view.rawPhotos, raw))) fail();
    }
    const old = rawBefore.photos, view = before.photos;
    if (!Array.isArray(view) || view.length !== old.length || !Array.isArray(after.photos)) fail();
    const byId = new Map(old.map((photo, index) => [photo.id ?? photo.photoId, view[index]]));
    if (!same(after.photos, edit.photoIds.map(id => byId.get(id)))) fail();
    const expected = { payload: stripAdminTemplateEditorMetadata(personalBusinessPayload(state)), metadata: clone(metadata) };
    if (!same(expected, editorSnapshot)) fail();
    return clone({ version: 6, id: operationId, binding, operations: [intent], editorSnapshot, photoSnapshot });
  } catch { fail(); }
}
