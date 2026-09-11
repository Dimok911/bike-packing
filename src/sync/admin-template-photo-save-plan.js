import { adminTemplateIntent, canonicalTemplateJson } from "./admin-template-protocol.js";

// The save body contains old raw refs; the separate editor snapshot contains
// selected pending photos. Neither is rebuilt from stage responses on reload.
export function adminTemplatePhotoSavePlan({ binding, operationId, body, editorSnapshot }) {
  const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || !body?.photoAppend || !exact(editorSnapshot, ["payload", "metadata"])
    || canonicalTemplateJson(editorSnapshot.metadata) !== canonicalTemplateJson(body.metadata)) {
    throw Object.assign(Error("Фотопакет шаблона требует сверки."), { code: "admin-template-plan-paused", isAdminTemplateBlocked: true });
  }
  const intent = adminTemplateIntent({ ...binding, operationId, kind: "template.save", body });
  return JSON.parse(canonicalTemplateJson({ version: 5, id: operationId, binding, operations: [intent], editorSnapshot }));
}
