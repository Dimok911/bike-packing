import { canonicalTemplateJson } from "./admin-template-protocol.js";
import { adminTemplatePhotoCopyReference } from "./admin-template-photo-copy-protocol.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const fail = () => { throw Object.assign(Error("Исходный шаблон требует сверки."),
  { code: "admin-template-photo-whole-copy-source", isAdminTemplateBlocked: true }); };

// Historical synced references retained their own remote ID in localId. Only
// this exact alias is accepted; pending local files and different IDs still fail.
export function adminTemplatePhotoWholeCopySourceReference(photo, listId) {
  const value = clone(photo);
  if (value?.localId && value.status === "synced" && value.localId === (value.id ?? value.photoId)) value.localId = "";
  return adminTemplatePhotoCopyReference(value, listId);
}

// Older arrangements have no quantity map. Derive the same display quantities
// as createLayoutArrangementFromCurrentState, on a detached value only. Present
// (including malformed or incomplete) maps are never repaired by this adapter.
export function adminTemplatePhotoWholeCopySourceArrangement(payload, arrangement) {
  const value = clone(arrangement);
  if (value && !Object.hasOwn(value, "itemQuantities")) {
    if (!value.items || Object.getPrototypeOf(value.items) !== Object.prototype) fail();
    value.itemQuantities = Object.fromEntries(Object.keys(value.items).map(id => {
      if (!Object.hasOwn(payload.items || {}, id)) fail();
      const quantity = Math.max(1, Math.round(Number(payload.items[id].quantity) || 1));
      if (!Number.isSafeInteger(quantity)) fail();
      return [id, quantity];
    }));
  }
  return value;
}
