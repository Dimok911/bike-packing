import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { assertAdminTemplatePhotoCopyEditor } from "./admin-template-photo-copy-record.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyStageManifests,
  adminTemplatePhotoTreeCopyStageDigest } from "./admin-template-photo-tree-copy-protocol.js";

const kind = "admin-template-photo-tree-copy", collections = ["layouts", "items", "containers"], maxBytes = 12 * 1024 * 1024;
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const id = value => typeof value === "string" && value.length <= 191 && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const invalid = () => { throw Object.assign(Error("Сохранённое копирование дерева и оба исходных шаблона требуют сверки."),
  { code: "admin-template-photo-tree-copy-record", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  byte => byte.toString(16).padStart(2, "0")).join("");
const bindingKey = binding => canonical(binding);
const recordKey = (binding, operationId) => canonical([bindingKey(binding), operationId]);

function validate(input) {
  if (!exact(input, ["binding", "action", "snapshot"])) invalid();
  const binding = adminTemplatePhotoActionBinding(input.binding), { action, snapshot } = input;
  if (!exact(action, ["operationId", "kind", "listId", "itemKey", "body"]) || action.listId !== binding.listId || action.itemKey !== binding.itemKey) invalid();
  const intent = adminTemplatePhotoTreeCopyIntent({ ...binding, ...action }), copy = intent.body.photoCopy;
  if (!exact(snapshot, ["version", "source", "target", "copiedOwners"]) || snapshot.version !== 1
    || !Array.isArray(snapshot.copiedOwners) || snapshot.copiedOwners.length !== copy.owners.length
    || snapshot.source?.layoutId === snapshot.target?.layoutId || !same(snapshot.target?.metadata, action.body.metadata)) invalid();

  // No pending-tree adapter exists yet. Presence is a fence, including malformed
  // or false markers; the shared editor proof continues to enforce V1 fences.
  for (const side of [snapshot.source, snapshot.target]) {
    const source = side?.beforeState?.layouts?.[side?.layoutId]?.adminCausalSource;
    if (!plain(source) || ["treePending", "photoTreeCopyPending"].some(key => Object.hasOwn(source, key))) invalid();
  }
  const sourceBinding = adminTemplatePhotoActionBinding({ ...binding, listId: copy.source.listId, itemKey: copy.source.itemKey });
  assertAdminTemplatePhotoCopyEditor({ binding: sourceBinding, revision: copy.source.base.stateRevision, payload: copy.source.payload, side: snapshot.source });
  assertAdminTemplatePhotoCopyEditor({ binding, revision: action.body.base.stateRevision, payload: action.body.payload, side: snapshot.target });

  // Both namespaces remain complete before snapshots. All new local identities
  // are allocations only, not optimistic rows or authority inferred from IDs.
  const seen = new Set();
  for (const side of [snapshot.source, snapshot.target]) for (const collection of collections) for (const key of Object.keys(side.beforeState[collection])) {
    if (seen.has(key)) invalid(); seen.add(key);
  }
  for (const [index, selected] of snapshot.copiedOwners.entries()) {
    const owner = copy.owners[index], type = owner.entityType === "item" ? "items" : "containers";
    if (!exact(selected, ["entityType", "sourceLocalId", "localId", "serverId"])
      || selected.entityType !== owner.entityType || selected.serverId !== owner.entityId
      || !id(selected.sourceLocalId) || !id(selected.localId) || seen.has(selected.localId)
      || !snapshot.source.ownerMap.owners.some(row => row.type === type && row.localId === selected.sourceLocalId && row.serverId === owner.sourceEntityId)) invalid();
    seen.add(selected.localId);
  }
  return { binding, action, snapshot, intent };
}

async function derive(input) {
  // Detach everything before the first await. Every later call repeats this
  // semantic proof from its own bytes; no cached ID or prior hash grants trust.
  const frozen = clone(input), { binding, action, snapshot, intent } = validate(frozen);
  const stages = await adminTemplatePhotoTreeCopyStageManifests(intent), assets = intent.body.photoCopy.owners.flatMap(owner => owner.photos);
  for (const [index, stage] of stages.entries()) if (await adminTemplatePhotoTreeCopyStageDigest(stage) !== assets[index].assetDigest) invalid();
  const envelope = { version: 1, kind, binding, action, snapshot, stages }, intentJson = canonical(envelope);
  if (new TextEncoder().encode(intentJson).byteLength > maxBytes) invalid();
  return { envelope, intentJson };
}

const decoded = (value, intentHash) => clone({ binding: value.binding, action: value.action,
  snapshot: value.snapshot, stages: value.stages, intentHash });

export async function encodeAdminTemplatePhotoTreeCopyRecord(input) {
  try {
    const { envelope: { binding, action }, intentJson } = await derive(input);
    return { version: 1, kind, key: recordKey(binding, action.operationId), bindingKey: bindingKey(binding), intentJson, intentHash: await digest(intentJson) };
  } catch { invalid(); }
}

export async function decodeAdminTemplatePhotoTreeCopyRecord(input, bindingInput, operationId) {
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
    // The complete derived envelope includes every ordered manifest and both
    // editor proofs, not merely the operation ID or a client-supplied digest.
    if (expected.intentJson !== record.intentJson) invalid();
    return decoded(value, record.intentHash);
  } catch { invalid(); }
}

export async function prepareAdminTemplatePhotoTreeCopyRecord(input) {
  try {
    const { envelope, intentJson } = await derive(input);
    return decoded(envelope, await digest(intentJson));
  } catch { invalid(); }
}
