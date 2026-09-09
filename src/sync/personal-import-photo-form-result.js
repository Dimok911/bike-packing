import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { assertPersonalPublicPhotoFormReference, assertPersonalPublicPhotoFormSummary, assertPersonalPublicPhotoFormBase,
  personalPublicPhotoFormSummary, validatePersonalPublicPhotoFormResult } from "./personal-public-photo-form-result.js";

export const PERSONAL_IMPORT_PHOTO_FORM_ENABLED = false;
export const PERSONAL_IMPORT_PHOTO_FORM_CAPABILITY = "personalCausalImportPhotoFormsV1";
// The shared capability may be advertised for just one import kind. Check
// the selected kind's parent and descendant support before any file claim.
export const personalImportPhotoFormCapabilities = reference => [PERSONAL_IMPORT_PHOTO_FORM_CAPABILITY,
  ...(reference?.version === 3 ? reference.importKind === "guest"
    ? ["personalCausalGuestImportV1", "personalCausalGuestDescendantsV1"]
    : ["personalCausalArchiveImportV1", "personalCausalArchivePhotoImportV1", "personalCausalArchiveDescendantsV1"] : [])];
const clone = value => JSON.parse(JSON.stringify(value));
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && personalArchiveJson(Object.keys(value).sort()) === personalArchiveJson([...keys].sort());
const kind = value => ["guest", "archive"].includes(value);
const fail = () => { throw Object.assign(Error("Не подтверждён полный состав фотографий после переноса или архива. Поля и файлы сохранены."),
  { code: "import-photo-form-result" }); };

// Reuse the exact multi-owner inventory grammar through a validation-only
// view. The view never becomes a stored action, receipt or network request;
// guest/archive lineage remains explicitly distinct from public copies.
function validationBody(body) {
  assertListOperationJsonValue(body);
  const ref = body.ownerResult;
  if (!exact(ref, ["version", "operationId", "importOperationId", "importKind", "owner", "pendingPhotos"])
    || ref.version !== 3 || !kind(ref.importKind)) fail();
  return { ...body, ownerResult: { version: 2, operationId: ref.operationId, publicOperationId: ref.importOperationId,
    owner: ref.owner, pendingPhotos: ref.pendingPhotos } };
}

function validationSummary(summary) {
  assertListOperationJsonValue(summary);
  if (!exact(summary, ["version", "importOperationId", "importKind", "pendingPhotos"]) || summary.version !== 1 || !kind(summary.importKind)) fail();
  return { version: 1, publicOperationId: summary.importOperationId, pendingPhotos: summary.pendingPhotos };
}

export function assertPersonalImportPhotoFormReference(body, listId) {
  assertPersonalPublicPhotoFormReference(validationBody(body), listId);
  return clone(body.ownerResult);
}

export function assertPersonalImportPhotoFormSummary(summary, listId) {
  assertPersonalPublicPhotoFormSummary(validationSummary(summary), listId);
  return clone(summary);
}

export function assertPersonalImportPhotoFormBase(body, basePayload, listId) {
  assertPersonalPublicPhotoFormBase(validationBody(body), basePayload, listId);
  return clone(body.ownerResult);
}

export function personalImportPhotoFormSummary(body, listId) {
  const summary = personalPublicPhotoFormSummary(validationBody(body), listId);
  return { version: 1, importOperationId: body.ownerResult.importOperationId, importKind: body.ownerResult.importKind, pendingPhotos: summary.pendingPhotos };
}

export function validatePersonalImportPhotoFormResult(payload, body, listId) {
  try {
    const summary = assertPersonalImportPhotoFormSummary(payload.importPhotoForm, listId), ref = body.ownerResult;
    return summary.importKind === ref.importKind && summary.importOperationId === ref.importOperationId
      && validatePersonalPublicPhotoFormResult({ ...payload, publicPhotoForm: validationSummary(summary) }, validationBody(body), listId);
  } catch { return false; }
}
