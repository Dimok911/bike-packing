import { prepareAdminTemplatePhotoTreeCopyRecord } from "./admin-template-photo-tree-copy-record.js";
import { createAdminTemplatePhotoCopyAdmissionScope } from "./admin-template-photo-copy-admission-scope.js";

// Trusted internal descriptor; callers provide live inventory/namespace scopes.
const descriptor = Object.freeze({
  prefix: "admin-template-photo-tree-copy",
  message: "Копирование дерева сохранено и требует проверки исходных шаблонов.",
  prepareRecord: prepareAdminTemplatePhotoTreeCopyRecord,
  source: record => record.action.body.photoCopy.source,
});

export function createAdminTemplatePhotoTreeCopyAdmission(options) {
  return createAdminTemplatePhotoCopyAdmissionScope(descriptor, options);
}
