import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { PERSONAL_SERVER_IMPORT_CAPABILITY } from "./personal-server-import-source.js";
import { assertPersonalPublicPhotoFormReference, assertPersonalPublicPhotoFormSummary, assertPersonalPublicPhotoFormBase,
  personalPublicPhotoFormSummary, validatePersonalPublicPhotoFormResult } from "./personal-public-photo-form-result.js";

export const PERSONAL_SERVER_PHOTO_FORM_ENABLED = false;
export const PERSONAL_SERVER_PHOTO_FORM_CAPABILITY = "personalCausalServerPhotoFormsV1";
export const PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED = false;
export const PERSONAL_SERVER_NEW_OWNER_FORM_CAPABILITY = "personalCausalServerNewOwnerFormsV1";
export const personalServerPhotoFormCapabilities = reference => [PERSONAL_SERVER_IMPORT_CAPABILITY, PERSONAL_SERVER_PHOTO_FORM_CAPABILITY,
  ...([7, 14].includes(reference?.version) ? [PERSONAL_SERVER_NEW_OWNER_FORM_CAPABILITY] : [])];
const clone = value => JSON.parse(JSON.stringify(value));
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && personalArchiveJson(Object.keys(value).sort()) === personalArchiveJson([...keys].sort());
const fail = () => { throw Object.assign(Error("Не подтверждён состав фотографий после серверной копии. Поля и файлы сохранены."),
  { code: "server-photo-form-result" }); };

// Version 6 edits an existing owner; version 7 creates a new owner. Server
// lineage has its own versions and UUID field on wire and disk. Only this
// temporary validation view shares the established multi-owner inventory.
function validationBody(body) {
  assertListOperationJsonValue(body);
  const ref = body.ownerResult;
  if (!exact(ref, ["version", "operationId", "serverOperationId", "owner", "pendingPhotos"]) || ![6, 7].includes(ref.version)) fail();
  return { ...body, ownerResult: { version: ref.version === 7 ? 5 : 2, operationId: ref.operationId,
    publicOperationId: ref.serverOperationId, owner: ref.owner, pendingPhotos: ref.pendingPhotos } };
}

function validationSummary(summary) {
  assertListOperationJsonValue(summary);
  if (!exact(summary, ["version", "serverOperationId", "pendingPhotos"]) || summary.version !== 1) fail();
  return { version: 1, publicOperationId: summary.serverOperationId, pendingPhotos: summary.pendingPhotos };
}

export function assertPersonalServerPhotoFormReference(body, listId) {
  assertPersonalPublicPhotoFormReference(validationBody(body), listId);
  return clone(body.ownerResult);
}

export function assertPersonalServerPhotoFormSummary(summary, listId) {
  assertPersonalPublicPhotoFormSummary(validationSummary(summary), listId);
  return clone(summary);
}

export function assertPersonalServerPhotoFormBase(body, basePayload, listId) {
  assertPersonalPublicPhotoFormBase(validationBody(body), basePayload, listId);
  return clone(body.ownerResult);
}

export function personalServerPhotoFormSummary(body, listId) {
  const summary = personalPublicPhotoFormSummary(validationBody(body), listId);
  return { version: 1, serverOperationId: body.ownerResult.serverOperationId, pendingPhotos: summary.pendingPhotos };
}

export function validatePersonalServerPhotoFormResult(payload, body, listId) {
  try {
    if (["publicPhotoForm", "importPhotoForm"].some(key => Object.hasOwn(payload, key))) return false;
    const summary = assertPersonalServerPhotoFormSummary(payload.serverPhotoForm, listId);
    return summary.serverOperationId === body.ownerResult.serverOperationId
      && validatePersonalPublicPhotoFormResult({ ...payload, publicPhotoForm: validationSummary(summary) }, validationBody(body), listId);
  } catch { return false; }
}
