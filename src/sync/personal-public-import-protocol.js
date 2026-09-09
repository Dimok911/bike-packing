import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { personalGuestImportManifest, assertPersonalGuestImportBody, assertPersonalGuestImportHashes,
  personalGuestImportReceipt, validatePersonalGuestImportResult } from "./personal-guest-import-protocol.js";

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
  assertListOperationJsonValue(value);
  if (!exact(value, ["kind", "listId", "itemKey", "stateRevision", "language"]) || value.kind !== "public-template"
    || typeof value.listId !== "string" || value.listId.length > 64 || !/^public-(?:demo-state(?:-[a-z0-9-]+)?|shared-layout-[a-z0-9-]+)$/.test(value.listId)
    || typeof value.itemKey !== "string" || value.itemKey.length > 191 || !/^(?:demo-state(?:[:-][A-Za-z0-9._:-]+)?|shared-layout:[A-Za-z0-9._:-]+)$/.test(value.itemKey)
    || !Number.isSafeInteger(value.stateRevision) || value.stateRevision < 1 || !["ru", "en"].includes(value.language)) fail();
  return clone(value);
}

export function personalPublicImportManifest(value) {
  assertListOperationJsonValue(value);
  if (!value || !Object.hasOwn(value, "source")) fail();
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
  if (options.causal && !same(body.causal?.reads, [{ listId: source.listId, revision: source.stateRevision }])) fail();
  return assertPersonalGuestImportBody(copyBody(body), options);
}

export async function assertPersonalPublicImportHashes(body) {
  assertListOperationJsonValue(body);
  await assertPersonalGuestImportHashes(copyBody(clone(body)));
}

export function personalPublicImportReceipt(value) {
  const manifest = personalPublicImportManifest(value);
  return { ...personalGuestImportReceipt(copyManifest(manifest)), source: clone(manifest.source) };
}

export function validatePersonalPublicImportResult(result, expected) {
  try {
    assertListOperationJsonValue(result); assertListOperationJsonValue(expected);
    const manifest = personalPublicImportManifest(expected.body.publicImport);
    if (!same(result.publicImport, personalPublicImportReceipt(manifest)) || !Array.isArray(result.publicPhotos)
      || Object.hasOwn(result, "guestImport") || Object.hasOwn(result, "archiveImport")) return false;
    return validatePersonalGuestImportResult({ ...result, guestImport: personalGuestImportReceipt(copyManifest(manifest)), guestPhotos: result.publicPhotos },
      { ...expected, body: copyBody(expected.body) });
  } catch { return false; }
}
