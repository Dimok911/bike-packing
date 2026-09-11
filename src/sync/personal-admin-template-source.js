import { assertListOperationJsonValue } from "./list-operation-payload.js";

export const PERSONAL_ADMIN_TEMPLATE_IMPORT_ENABLED = false;
export const PERSONAL_ADMIN_TEMPLATE_IMPORT_CAPABILITY = "personalCausalAdminTemplateImportV1";

// A distinct source precondition for the current administrative draft. It does
// not grant access or assert publication; the server rechecks administrator
// rights, the template head and the full payload under the destination lock.
export function personalAdminTemplateImportSource(value) {
  assertListOperationJsonValue(value);
  const keys = ["kind", "listId", "itemKey", "stateRevision", "language", "payloadDigest"];
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key)) || value.kind !== "admin-template"
    || typeof value.listId !== "string" || value.listId.length > 64 || !/^public-(?:demo-state(?:-[a-z0-9-]+)?|shared-layout-[a-z0-9-]+)$/.test(value.listId)
    || typeof value.itemKey !== "string" || value.itemKey.length > 191 || !/^(?:demo-state(?:[:-][A-Za-z0-9._:-]+)?|shared-layout:[A-Za-z0-9._:-]+)$/.test(value.itemKey)
    || !Number.isSafeInteger(value.stateRevision) || value.stateRevision < 1 || !["ru", "en"].includes(value.language)
    || typeof value.payloadDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.payloadDigest)) {
    throw Object.assign(Error("Не подтверждена выбранная версия административного шаблона."), { code: "admin-template-import-source" });
  }
  return JSON.parse(JSON.stringify(value));
}
