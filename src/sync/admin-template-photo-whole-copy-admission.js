import { prepareAdminTemplatePhotoWholeCopyRecord } from "./admin-template-photo-whole-copy-record.js";
import { createAdminTemplatePhotoCopyAdmissionScope } from "./admin-template-photo-copy-admission-scope.js";

// Trusted internal descriptor; callers provide live inventory/namespace scopes.
const descriptor = Object.freeze({
  prefix: "admin-template-photo-whole-copy",
  message: "Копирование укладки сохранено и требует проверки исходных шаблонов.",
  prepareRecord: prepareAdminTemplatePhotoWholeCopyRecord,
  source: record => record.action.body.source,
});

export function createAdminTemplatePhotoWholeCopyAdmission(options) {
  return createAdminTemplatePhotoCopyAdmissionScope(descriptor, options);
}
