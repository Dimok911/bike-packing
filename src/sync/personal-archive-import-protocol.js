import { personalArchiveImportPlan, personalArchiveBusinessPayload } from "./personal-archive-import-plan.js";
export { personalArchiveBusinessPayload } from "./personal-archive-import-plan.js";

export const PERSONAL_ARCHIVE_IMPORT_ENABLED = false;
export const PERSONAL_ARCHIVE_IMPORT_CAPABILITY = "personalCausalArchiveImportV1";
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const personalArchiveJson = value => JSON.stringify(value && typeof value === "object" ? Array.isArray(value)
  ? value.map(entry => JSON.parse(personalArchiveJson(entry)))
  : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(personalArchiveJson(value[key]))])) : value);
export const personalArchiveHash = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(personalArchiveJson(value))))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const fail = () => { throw Object.assign(Error("Состав сохранённого импорта не совпадает с выбранным архивом."), { code: "archive-import-body" }); };

export function personalArchiveImportManifest(value) {
  if (!exact(value, ["version", "mode", "sourcePayload", "sourceHash", "layoutTargets", "sourceActiveLayoutId", "editMeta", "targetStateRevision", "payloadHash"])
    || value.version !== 1 || !["full", "replace", "copy"].includes(value.mode) || !hash(value.sourceHash) || !hash(value.payloadHash)
    || !Number.isSafeInteger(value.targetStateRevision) || value.targetStateRevision < 1 || !Array.isArray(value.layoutTargets)) fail();
  personalArchiveBusinessPayload(value.sourcePayload);
  return clone(value);
}

export function assertPersonalArchiveImportBody(body, { base, causal = false } = {}) {
  if (!exact(body, ["baseStateRevision", "payload", "archiveImport", ...(causal ? ["causal"] : [])])) fail();
  const manifest = personalArchiveImportManifest(body.archiveImport);
  if (body.baseStateRevision !== manifest.targetStateRevision) fail();
  const plan = personalArchiveImportPlan({ ...manifest, currentPayload: base });
  if (personalArchiveJson(plan.payload) !== personalArchiveJson(body.payload)) fail();
  return plan;
}

export async function assertPersonalArchiveImportHashes(body) {
  const manifest = personalArchiveImportManifest(body?.archiveImport);
  if (await personalArchiveHash(manifest.sourcePayload) !== manifest.sourceHash
    || await personalArchiveHash(body.payload) !== manifest.payloadHash) fail();
}

export function personalArchiveImportReceipt(manifest) {
  personalArchiveImportManifest(manifest);
  const { sourcePayload, editMeta, ...receipt } = manifest;
  return clone(receipt);
}

export function validatePersonalArchiveImportResult(result, expected) {
  try {
    const manifest = personalArchiveImportManifest(expected.body.archiveImport), revision = manifest.targetStateRevision + 1;
    return result?.ok === true && result.list?.id === expected.listId && result.list.stateRevision === revision
      && result.stateRevision === revision && personalArchiveJson(result.archiveImport) === personalArchiveJson(personalArchiveImportReceipt(manifest))
      && personalArchiveJson(personalArchiveBusinessPayload(result.list.payload)) === personalArchiveJson(expected.body.payload);
  } catch { return false; }
}
