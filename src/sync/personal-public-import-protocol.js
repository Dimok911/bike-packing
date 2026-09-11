import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalAdminTemplateImportSource } from "./personal-admin-template-source.js";
import { personalPublicEntityPlan } from "./personal-public-entity-plan.js";
import { personalGuestImportPlan } from "./personal-guest-import-plan.js";
import { personalArchiveJson, personalArchiveHash } from "./personal-archive-import-protocol.js";
import { personalGuestImportManifest, assertPersonalGuestImportBody,
  personalGuestImportReceipt, validatePersonalImportedResult } from "./personal-guest-import-protocol.js";

export const PERSONAL_PUBLIC_IMPORT_ENABLED = false;
export const PERSONAL_PUBLIC_IMPORT_CAPABILITY = "personalCausalPublicImportV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Object.assign(Error("Выбранный шаблон или состав личной копии изменён. Исходные данные сохранены."), { code: "public-import-body" }); };

// Public identity is an explicit read precondition. This shape alone never
// grants source access: the API must verify publication, the canonical key and
// the complete snapshot under the same transaction as the private destination.
export function personalPublicImportSource(value) {
  if (value?.kind === "admin-template") return personalAdminTemplateImportSource(value);
  assertListOperationJsonValue(value);
  if (!exact(value, ["kind", "listId", "itemKey", "stateRevision", "language"]) || value.kind !== "public-template"
    || typeof value.listId !== "string" || value.listId.length > 64 || !/^public-(?:demo-state(?:-[a-z0-9-]+)?|shared-layout-[a-z0-9-]+)$/.test(value.listId)
    || typeof value.itemKey !== "string" || value.itemKey.length > 191 || !/^(?:demo-state(?:[:-][A-Za-z0-9._:-]+)?|shared-layout:[A-Za-z0-9._:-]+)$/.test(value.itemKey)
    || !Number.isSafeInteger(value.stateRevision) || value.stateRevision < 1 || !["ru", "en"].includes(value.language)) fail();
  return clone(value);
}

// Pending administrative sources are resolved in their own server namespace;
// they never become personal list revision reads or personal dependencies.
export function personalPublicImportSourceReads(value) {
  const source = personalPublicImportSource(value);
  return source.kind === "admin-template" && source.base ? [] : [{ listId: source.listId, revision: source.stateRevision }];
}

export function personalPublicImportManifest(value) {
  assertListOperationJsonValue(value);
  if (!value || !Object.hasOwn(value, "source")) fail();
  if (value.source?.kind === "admin-template" && (value.files?.length !== 0 || value.photoTargets?.length !== 0)) fail();
  if (value.source?.kind === "admin-template" && value.source.base?.operationId === value.operationId) fail();
  if (value.version === 2) {
    if (!exact(value, ["version", "operationId", "sourcePayload", "sourceHash", "copy", "ownerTargets", "photoTargets", "editMeta", "targetStateRevision", "payloadHash", "files", "source"])
      || typeof value.operationId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.operationId)
      || [value.sourceHash, value.payloadHash].some(hash => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
      || !Number.isSafeInteger(value.targetStateRevision) || value.targetStateRevision < 1
      || !Array.isArray(value.ownerTargets) || !Array.isArray(value.photoTargets) || !Array.isArray(value.files)
      || value.files.length > 50 || value.files.length !== value.photoTargets.length) fail();
    personalPublicImportSource(value.source); return clone(value);
  }
  const { source, ...copy } = value;
  return { ...personalGuestImportManifest(copy), source: personalPublicImportSource(source) };
}

// The existing deterministic private-copy grammar is shared internally; the
// original operation remains publicImport in storage, on the wire and receipt.
const copyManifest = value => { const { source, ...copy } = personalPublicImportManifest(value); return copy; };
const copyBody = body => ({ baseStateRevision: body.baseStateRevision, payload: body.payload,
  guestImport: copyManifest(body.publicImport), ...(Object.hasOwn(body, "causal") ? { causal: body.causal } : {}) });

export function assertPersonalPublicImportBody(body, options = {}) {
  assertListOperationJsonValue(body);
  if (!exact(body, ["baseStateRevision", "payload", "publicImport", ...(options.causal ? ["causal"] : [])])) fail();
  const manifest = personalPublicImportManifest(body.publicImport), source = manifest.source;
  if (source.listId === options.listId || manifest.ownerTargets.some(target => target.reuse !== false)) fail();
  if (options.causal && (!same(body.causal?.reads, personalPublicImportSourceReads(source))
    || source.kind === "admin-template" && source.base && body.causal?.dependsOn?.some(dep => dep.operationId === source.base.operationId))) fail();
  if (body.baseStateRevision !== manifest.targetStateRevision || options.operationId !== manifest.operationId) fail();
  if (manifest.version === 1) return assertPersonalGuestImportBody(copyBody(body), options);
  const plan = personalPublicEntityPlan({ ...manifest, currentPayload: options.base, listId: options.listId }, manifest.files);
  if (!same(plan.payload, body.payload)) fail(); return plan;
}

export async function assertPersonalPublicImportHashes(body) {
  assertListOperationJsonValue(body);
  body = clone(body);
  const manifest = personalPublicImportManifest(body?.publicImport);
  if (await personalArchiveHash(manifest.sourcePayload) !== manifest.sourceHash || await personalArchiveHash(body.payload) !== manifest.payloadHash) fail();
  if (manifest.source.kind === "admin-template" && manifest.source.payloadDigest !== manifest.sourceHash) fail();
}

export function personalPublicImportReceipt(value) {
  const manifest = personalPublicImportManifest(value);
  if (manifest.version === 1) return { ...personalGuestImportReceipt(copyManifest(manifest)), source: clone(manifest.source) };
  const { sourcePayload, editMeta, ...receipt } = manifest; return receipt;
}

export function validatePersonalPublicImportResult(result, expected) {
  try {
    assertListOperationJsonValue(result); assertListOperationJsonValue(expected);
    const manifest = personalPublicImportManifest(expected.body.publicImport);
    if (!same(result.publicImport, personalPublicImportReceipt(manifest)) || !Array.isArray(result.publicPhotos)
      || Object.hasOwn(result, "guestImport") || Object.hasOwn(result, "archiveImport")) return false;
    return validatePersonalImportedResult(result, expected, manifest,
      { manifestKey: "publicImport", photosKey: "publicPhotos", receipt: personalPublicImportReceipt });
  } catch { return false; }
}

export function personalPublicImportPlan(input, files) {
  if (input.source?.kind === "admin-template" && (files?.length !== 0 || input.photoTargets?.length !== 0)) fail();
  return input.version === 2 ? personalPublicEntityPlan(input, files) : personalGuestImportPlan(input, files);
}
