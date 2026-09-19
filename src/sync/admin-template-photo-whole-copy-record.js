import { sameProtocolJson as same } from "./protocol-json-equality.js";
import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { assertAdminTemplatePhotoCopyEditor } from "./admin-template-photo-copy-record.js";
import { adminTemplatePhotoWholeCopyIntent, adminTemplatePhotoWholeCopyStageManifests,
  adminTemplatePhotoWholeCopyStageDigest } from "./admin-template-photo-whole-copy-protocol.js";

const kind = "admin-template-photo-whole-copy", collections = ["layouts", "items", "containers"], maxBytes = 12 * 1024 * 1024;
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const id = value => typeof value === "string" && value.length <= 191 && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const invalid = () => { throw Object.assign(Error("Сохранённое копирование укладки и исходный шаблон требуют сверки."),
  { code: "admin-template-photo-whole-copy-record", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  byte => byte.toString(16).padStart(2, "0")).join("");
const bindingKey = binding => canonical(binding);
const recordKey = (binding, operationId) => canonical([bindingKey(binding), operationId]);

function validate(input) {
  if (!exact(input, ["binding", "action", "snapshot"])) invalid();
  const binding = adminTemplatePhotoActionBinding(input.binding), { action, snapshot } = input;
  if (!exact(action, ["operationId", "kind", "listId", "itemKey", "body"]) || action.listId !== binding.listId || action.itemKey !== binding.itemKey) invalid();
  const intent = adminTemplatePhotoWholeCopyIntent({ ...binding, ...action }), copy = intent.body.photoCopy;
  if (!exact(snapshot, ["version", "source", "target", "copiedOwners"]) || snapshot.version !== 1
    || !Array.isArray(snapshot.copiedOwners) || snapshot.copiedOwners.length !== copy.owners.length
    || snapshot.source?.layoutId === snapshot.target?.layoutId || !same(snapshot.target?.metadata, action.body.metadata)) invalid();

  if (!exact(snapshot.target, ["layoutId", "serverLayoutId", "metadata"])
    || !id(snapshot.target.layoutId) || snapshot.target.serverLayoutId !== `layout-${intent.id}`) invalid();
  const sourceMeta = snapshot.source?.beforeState?.layouts?.[snapshot.source?.layoutId]?.adminCausalSource;
  // Presence of a newer pending marker cannot be normalized into a confirmed
  // source. The unchanged editor validator also checks legacy pending fields.
  if (!plain(sourceMeta) || ["treePending", "photoTreeCopyPending", "wholePending", "photoWholeCopyPending"]
    .some(key => Object.hasOwn(sourceMeta, key))) invalid();
  const source = intent.body.source;
  const sourceBinding = adminTemplatePhotoActionBinding({ ...binding, listId: source.listId, itemKey: source.itemKey });
  assertAdminTemplatePhotoCopyEditor({ binding: sourceBinding, revision: source.base.stateRevision, payload: copy.sourcePayload, side: snapshot.source, allowPublicSource: true });

  // Allocations only: this record does not prove absence from another local
  // namespace, SQL, or another store. Admission must prove those live facts.
  const occupied = new Set([intent.id, binding.listId, binding.itemKey, binding.itemKey.split(":")[1],
    source.listId, source.itemKey, source.itemKey.split(":")[1], snapshot.target.serverLayoutId]);
  for (const collection of collections) {
    for (const key of Object.keys(copy.sourcePayload[collection])) occupied.add(key);
    for (const key of Object.keys(snapshot.source.beforeState[collection])) occupied.add(key);
  }
  for (const owner of copy.owners) {
    occupied.add(owner.entityId);
    for (const photo of owner.photos) for (const value of [photo.sourcePhotoId, photo.photoId, photo.assetId]) occupied.add(value);
    for (const photo of copy.sourcePayload[owner.entityType === "item" ? "items" : "containers"][owner.sourceEntityId].photos || [])
      if (photo.assetId) occupied.add(photo.assetId);
  }
  if (occupied.has(snapshot.target.layoutId)) invalid();
  occupied.add(snapshot.target.layoutId);
  for (const [index, selected] of snapshot.copiedOwners.entries()) {
    const owner = copy.owners[index], type = owner.entityType === "item" ? "items" : "containers";
    if (!exact(selected, ["entityType", "sourceLocalId", "localId", "serverId"])
      || selected.entityType !== owner.entityType || selected.serverId !== owner.entityId
      || !id(selected.sourceLocalId) || !id(selected.localId) || occupied.has(selected.localId)
      || !snapshot.source.ownerMap.owners.some(row => row.type === type && row.localId === selected.sourceLocalId && row.serverId === owner.sourceEntityId)) invalid();
    occupied.add(selected.localId);
  }
  return { binding, action, snapshot, intent };
}

// A bounded memo of a pure derivation, not of storage observations or authority.
// Canonicalize the complete input on EVERY call; any changed byte recomputes the
// grammar, source/editor proof and every manifest/digest. Freeze the private
// result so no caller can poison later proofs. Store reads/readbacks are intact.
let derivedProof = null;
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
async function derive(input) {
  // Detach everything before the first await. Reuse only a complete exact-value
  // derivation; no cached ID or prior hash grants trust.
  const raw = canonical(input);
  if (new TextEncoder().encode(raw).byteLength > maxBytes) invalid();
  if (derivedProof?.raw === raw) return derivedProof.result;
  const frozen = JSON.parse(raw), { binding, action, snapshot, intent } = validate(frozen);
  const stages = await adminTemplatePhotoWholeCopyStageManifests(intent), assets = intent.body.photoCopy.owners.flatMap(owner => owner.photos);
  for (const [index, stage] of stages.entries()) if (await adminTemplatePhotoWholeCopyStageDigest(stage) !== assets[index].assetDigest) invalid();
  const envelope = { version: 1, kind, binding, action, snapshot, stages }, intentJson = canonical(envelope);
  if (new TextEncoder().encode(intentJson).byteLength > maxBytes) invalid();
  const result = freeze({ envelope, intentJson });
  derivedProof = { raw, result };
  return result;
}

const decoded = (value, intentHash) => clone({ binding: value.binding, action: value.action,
  snapshot: value.snapshot, stages: value.stages, intentHash });

export async function encodeAdminTemplatePhotoWholeCopyRecord(input) {
  try {
    const { envelope: { binding, action }, intentJson } = await derive(input);
    return { version: 1, kind, key: recordKey(binding, action.operationId), bindingKey: bindingKey(binding), intentJson, intentHash: await digest(intentJson) };
  } catch { invalid(); }
}

export async function decodeAdminTemplatePhotoWholeCopyRecord(input, bindingInput, operationId) {
  try {
    const record = clone(input), binding = adminTemplatePhotoActionBinding(bindingInput);
    if (!validTemplateOperationId(operationId) || !exact(record, ["version", "kind", "key", "bindingKey", "intentJson", "intentHash"])
      || record.version !== 1 || record.kind !== kind || record.key !== recordKey(binding, operationId) || record.bindingKey !== bindingKey(binding)
      || typeof record.intentJson !== "string" || new TextEncoder().encode(record.intentJson).byteLength > maxBytes
      || !/^[a-f0-9]{64}$/.test(record.intentHash) || await digest(record.intentJson) !== record.intentHash) invalid();
    const value = JSON.parse(record.intentJson);
    if (!exact(value, ["version", "kind", "binding", "action", "snapshot", "stages"]) || value.version !== 1 || value.kind !== kind
      || value.action?.operationId !== operationId || !same(value.binding, binding) || canonical(value) !== record.intentJson) invalid();
    const expected = await derive({ binding, action: value.action, snapshot: value.snapshot });
    // The complete derived envelope includes every ordered manifest and the source
    // editor proof, not merely the operation ID or a client-supplied digest.
    if (expected.intentJson !== record.intentJson) invalid();
    return decoded(value, record.intentHash);
  } catch { invalid(); }
}

export async function prepareAdminTemplatePhotoWholeCopyRecord(input) {
  try {
    const { envelope, intentJson } = await derive(input);
    return decoded(envelope, await digest(intentJson));
  } catch { invalid(); }
}
