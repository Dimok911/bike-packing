import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalServerImportSource } from "./personal-server-import-source.js";
import { personalGuestImportManifest, assertPersonalGuestImportBody, validatePersonalImportedResult } from "./personal-guest-import-protocol.js";
import { personalGuestImportPlan } from "./personal-guest-import-plan.js";
import { personalPublicEntityPlan } from "./personal-public-entity-plan.js";
import { personalArchiveJson, personalArchiveHash } from "./personal-archive-import-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Состав копии списка по ссылке не совпал с сохранённым выбором."), { code: "server-import-body" }); };

// The selected source and saved ID maps remain serverImport throughout the
// journal, wire and receipt. Only the deterministic owner/layout compiler is
// shared with other import adapters; their source permissions are not reused.
export function personalServerImportManifest(value) {
  assertListOperationJsonValue(value);
  if (!value || !Object.hasOwn(value, "source")) fail();
  const { source, ...copy } = value;
  personalServerImportSource(source);
  if (copy.version === 1) personalGuestImportManifest(copy);
  else if (copy.version !== 2 || !exact(copy, ["version", "operationId", "sourcePayload", "sourceHash", "copy", "ownerTargets", "photoTargets",
    "editMeta", "targetStateRevision", "payloadHash", "files"]) || !uuid(copy.operationId)
    || !hash(copy.sourceHash) || !hash(copy.payloadHash) || !Number.isSafeInteger(copy.targetStateRevision) || copy.targetStateRevision < 1
    || !Array.isArray(copy.ownerTargets) || !Array.isArray(copy.photoTargets) || !Array.isArray(copy.files)
    || copy.files.length > 50 || copy.files.length !== copy.photoTargets.length) fail();
  return clone(value);
}

export function personalServerImportPlan(input, files) {
  if (![1, 2].includes(input?.version)) fail();
  return input.version === 1 ? personalGuestImportPlan(input, files) : personalPublicEntityPlan(input, files);
}

export function assertPersonalServerImportBody(body, options = {}) {
  assertListOperationJsonValue(body);
  if (!exact(body, ["baseStateRevision", "payload", "serverImport", ...(options.causal ? ["causal"] : [])])) fail();
  const manifest = personalServerImportManifest(body.serverImport), { source, ...copy } = manifest;
  if (source.listId === options.listId || manifest.ownerTargets.some(owner => owner.reuse !== false)
    || body.baseStateRevision !== manifest.targetStateRevision || options.operationId !== manifest.operationId) fail();
  if (options.causal && !same(body.causal?.reads, [{ listId: source.listId, revision: source.stateRevision }])) fail();
  if (manifest.version === 1) return assertPersonalGuestImportBody({ baseStateRevision: body.baseStateRevision, payload: body.payload,
    guestImport: copy, ...(options.causal ? { causal: body.causal } : {}) }, options);
  const plan = personalPublicEntityPlan({ ...copy, currentPayload: options.base, listId: options.listId }, copy.files);
  if (!same(plan.payload, body.payload)) fail();
  return plan;
}

export async function assertPersonalServerImportHashes(body) {
  assertListOperationJsonValue(body);
  const frozen = clone(body), manifest = personalServerImportManifest(frozen.serverImport);
  if (await personalArchiveHash(manifest.sourcePayload) !== manifest.sourceHash || await personalArchiveHash(frozen.payload) !== manifest.payloadHash) fail();
}

export function personalServerImportReceipt(value) {
  const { sourcePayload, editMeta, ...receipt } = personalServerImportManifest(value);
  return receipt;
}

export function validatePersonalServerImportResult(result, expected) {
  try {
    assertListOperationJsonValue(result); assertListOperationJsonValue(expected);
    const manifest = personalServerImportManifest(expected.body.serverImport);
    if (["guestImport", "publicImport", "archiveImport", "sharedLink"].some(key => Object.hasOwn(result, key))) return false;
    return validatePersonalImportedResult(result, expected, manifest,
      { manifestKey: "serverImport", photosKey: "serverPhotos", receipt: personalServerImportReceipt });
  } catch { return false; }
}
