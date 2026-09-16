import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifests,
  adminTemplatePhotoCopyStageDigest } from "./admin-template-photo-copy-protocol.js";
import { assertAdminTemplatePhotoOwnerMap } from "./admin-template-photo-owner-map.js";
import { assertAdminTemplatePhotoView } from "./admin-template-photo-view.js";
import { recoverPersonalAdminDrafts } from "./personal-admin-draft-recovery.js";
import { normalizeItemPhotos } from "../state/item-photos.js";
import { adminTemplatePhotoWholeCopySourceArrangement } from "./admin-template-photo-whole-copy-source.js";

const kind = "admin-template-photo-copy", types = ["items", "containers"], collections = ["layouts", ...types];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const id = value => typeof value === "string" && value.length <= 191 && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const invalid = () => { throw Object.assign(Error("Исходный шаблон, получатель и сохранённое копирование требуют сверки."),
  { code: "admin-template-photo-copy-record", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  byte => byte.toString(16).padStart(2, "0")).join("");
const bindingKey = binding => canonical(binding);
const recordKey = (binding, operationId) => canonical([bindingKey(binding), operationId]);

function assertDerivedPhotoView(rawPhotos, viewPhotos) {
  rawPhotos.forEach((raw, index) => {
    const view = viewPhotos[index], expected = clone(raw);
    if (expected.id == null) expected.id = expected.photoId;
    // Legacy display timestamps are generated once by the actual projector.
    // Preserve that recorded display time only where no raw string existed.
    // All other fields are derived from RAW, never from edited view fields.
    if (!Object.hasOwn(expected, "assetId")) for (const key of ["createdAt", "updatedAt"]) if (typeof expected[key] !== "string") {
      if (typeof view[key] !== "string" || !Number.isFinite(Date.parse(view[key]))) invalid(); expected[key] = view[key];
    }
    const projected = { photos: [expected] }; normalizeItemPhotos(projected);
    if (!same(projected.photos[0], view)) invalid();
  });
}

// As with create's before-proof, compare every business field against its exact
// raw source. Only proven projector-owned IDs, metadata and placement mirrors
// may differ. No normalization of the supplied editor can hide an unsaved edit.
function assertEditor({ binding, revision, payload, side, allowPublicSource = false }) {
  if (!exact(side, ["layoutId", "ownerMap", "beforeState", "metadata"]) || !id(side.layoutId)
    || !exact(side.metadata, ["title", "description", "language"])) invalid();
  const { beforeState: before, layoutId, ownerMap, metadata } = side;
  for (const [key, max, empty] of [["title", 255, false], ["description", 10000, true]]) {
    const value = metadata[key];
    if (typeof value !== "string" || value.length > max || (!empty && !value) || value !== value.trim()
      || ["__proto__", "prototype", "constructor"].includes(value)) invalid();
  }
  if (!["en", "ru"].includes(metadata.language)) invalid();
  if (!exact(before, ["activeLayoutId", "layouts", "items", "containers", "locations", "categories", "packedItems"])
    || before.activeLayoutId !== layoutId || !collections.every(type => plain(before[type]))
    || Object.keys(before.layouts).length !== 1 || before.layouts[layoutId]?.id !== layoutId
    || types.some(type => Object.values(before[type]).some(row => !plain(row) || row.publicCatalogLayoutId !== layoutId))) invalid();
  const source = before.layouts[layoutId].adminCausalSource;
  if (!plain(source) || source.version !== 1 || !same(source.binding, binding) || source.exists !== true || source.deleted
    || !(source.visibility === "private" || allowPublicSource === true && source.visibility === "public") || source.planId || source.photoAppendPending || source.photoEditPending || source.photoCreatePending || source.photoCopyPending
    || !exact(source.base, ["stateRevision"]) || source.base.stateRevision !== revision
    || source.photoOwnerMap !== undefined && !same(source.photoOwnerMap, ownerMap)) invalid();
  const recovered = recoverPersonalAdminDrafts({ layouts: {}, items: {}, containers: {} }, canonical(before),
    { scopeKey: `id:${binding.actorId}`, enabled: true });
  if (collections.some(type => !same(recovered[type], before[type]))) invalid();
  assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision: revision, map: ownerMap, state: before, sourcePayload: payload });
  assertAdminTemplatePhotoView({ binding, layoutId, baseline: source.photoView, state: before });
  const local = (type, serverId) => {
    const owner = ownerMap.owners.find(row => row.type === type && row.serverId === serverId);
    if (!owner) invalid(); return owner.localId;
  };
  const ref = (type, value) => value ? local(type, value) : "";
  const links = row => ({ parentId: ref("containers", row.parentId),
    childIds: (row.childIds || []).map(key => local("containers", key)), itemIds: (row.itemIds || []).map(key => local("items", key)),
    order: (row.order || []).map(entry => ({ ...entry, id: local(entry.type === "item" ? "items" : "containers", entry.id) })) });
  const rawLayout = Object.values(payload.layouts)[0], actualLayout = before.layouts[layoutId], arrangement = allowPublicSource === true
    ? adminTemplatePhotoWholeCopySourceArrangement(payload, rawLayout.arrangement) : clone(rawLayout.arrangement);
  if (allowPublicSource === true && source.visibility === "public" && actualLayout.templatePublished !== true) invalid();
  arrangement.rootContainerIds = arrangement.rootContainerIds.map(key => local("containers", key));
  arrangement.containers = Object.fromEntries(Object.entries(arrangement.containers).map(([key, row]) => [local("containers", key), { ...row, ...links(row) }]));
  arrangement.items = Object.fromEntries(Object.entries(arrangement.items).map(([key, value]) => [local("items", key), local("containers", value)]));
  for (const field of ["itemQuantities", "packedItems"]) arrangement[field] = Object.fromEntries(Object.entries(arrangement[field]).map(([key, value]) => [local("items", key), value]));
  if (!same(actualLayout.arrangement, arrangement) || !same(before.packedItems, arrangement.packedItems)
    || !same(before.locations, payload.locations || []) || !same(before.categories, payload.categories || [])) invalid();
  const copied = typeof payload.activeLayoutId === "string" && payload.activeLayoutId.startsWith("layout-")
    && validTemplateOperationId(payload.activeLayoutId.slice(7)) ? payload.activeLayoutId : null;
  for (const owner of ownerMap.owners) {
    const raw = payload[owner.type][owner.serverId], actual = before[owner.type][owner.localId], expected = clone(raw), rawPhotos = raw.photos || [];
    const view = source.photoView?.owners?.find(row => row.type === owner.type && row.localId === owner.localId);
    if (!Array.isArray(rawPhotos) || (rawPhotos.length ? !view || view.serverId !== owner.serverId || !same(view.rawPhotos, rawPhotos) : view !== undefined)) invalid();
    if (view) assertDerivedPhotoView(rawPhotos, view.viewPhotos);
    expected.id = owner.localId; expected.publicCatalogLayoutId = layoutId;
    if (Object.hasOwn(actual, "adminDemo")) {
      if (actual.adminDemo !== Boolean(actualLayout.adminDemo)) invalid(); expected.adminDemo = actual.adminDemo;
    }
    if (Object.hasOwn(actual, "sharedSourceId")) expected.sharedSourceId = copied ? owner.serverId : raw.sharedSourceId || owner.serverId;
    if (Object.hasOwn(actual, "photos") || Object.hasOwn(raw, "photos")) expected.photos = view ? clone(view.viewPhotos) : [];
    const rawLinks = owner.type === "items" ? { containerId: ref("containers", raw.containerId) } : links(raw);
    const placed = owner.type === "items" ? { containerId: arrangement.items[owner.localId] || rawLinks.containerId } : arrangement.containers[owner.localId] || rawLinks;
    for (const [field, rawValue] of Object.entries(rawLinks)) {
      if (!Object.hasOwn(actual, field) && !Object.hasOwn(raw, field)) continue;
      const value = actual[field], applied = placed[field];
      if (!same([value], [rawValue]) && !same([value], [applied]) && !(field === "parentId" && value === null && (rawValue === "" || applied === ""))) invalid();
      expected[field] = clone(value);
    }
    if (!same(actual, expected)) invalid();
  }
  const expected = { ...clone(rawLayout), id: layoutId, name: metadata.title, note: metadata.description, language: metadata.language,
    locations: clone(payload.locations || []), categories: clone(payload.categories || []),
    rootContainerIds: rawLayout.rootContainerIds.map(key => local("containers", key)), arrangement };
  if (copied) expected.sharedSourceId = copied;
  const actual = clone(actualLayout), demo = binding.listId.startsWith("public-demo-state");
  const localMetadata = { adminDemo: value => value === demo, adminDemoLanguage: value => demo && value === metadata.language,
    adminDemoListId: value => demo && value === binding.listId, adminSharedSourceId: value => !demo && value === binding.listId.slice("public-shared-layout-".length),
    adminTemplateCopy: value => value === Boolean(copied), publicCatalogLayoutId: value => value === layoutId,
    templatePublished: value => value === (allowPublicSource === true && source.visibility === "public"), templateDraftServerHydrated: value => value === true,
    templateDraftSyncPending: value => value === false, templateUnpublishPending: value => value === false };
  for (const [key, valid] of Object.entries(localMetadata)) {
    if (Object.hasOwn(actual, key) && !valid(actual[key])) invalid(); delete actual[key]; delete expected[key];
  }
  delete actual.adminCausalSource; delete expected.adminCausalSource;
  if (!same(actual, expected)) invalid();
}

function validate(input) {
  if (!exact(input, ["binding", "action", "snapshot"])) invalid();
  const binding = adminTemplatePhotoActionBinding(input.binding), { action, snapshot } = input;
  if (!exact(action, ["operationId", "kind", "listId", "itemKey", "body"]) || action.listId !== binding.listId || action.itemKey !== binding.itemKey) invalid();
  const intent = adminTemplatePhotoCopyIntent({ ...binding, ...action }), copy = intent.body.photoCopy;
  if (!exact(snapshot, ["version", "source", "target", "copiedOwner"]) || snapshot.version !== 1
    || !exact(snapshot.copiedOwner, ["entityType", "sourceLocalId", "localId", "serverId"])) invalid();
  const selected = snapshot.copiedOwner, type = copy.entityType === "item" ? "items" : "containers";
  if (selected.entityType !== copy.entityType || selected.serverId !== copy.entityId || !id(selected.localId) || !id(selected.sourceLocalId)
    || snapshot.source.layoutId === snapshot.target.layoutId || !same(snapshot.target.metadata, action.body.metadata)) invalid();
  const sourceBinding = adminTemplatePhotoActionBinding({ ...binding, listId: copy.source.listId, itemKey: copy.source.itemKey });
  assertEditor({ binding: sourceBinding, revision: copy.source.base.stateRevision, payload: copy.source.payload, side: snapshot.source });
  assertEditor({ binding, revision: action.body.base.stateRevision, payload: action.body.payload, side: snapshot.target });
  if (!snapshot.source.ownerMap.owners.some(row => row.type === type && row.localId === selected.sourceLocalId && row.serverId === copy.source.entityId)) invalid();
  const seen = new Set();
  for (const side of [snapshot.source, snapshot.target]) for (const collection of collections) for (const key of Object.keys(side.beforeState[collection])) {
    if (key === selected.localId || seen.has(key)) invalid(); seen.add(key);
  }
  return { binding, action: clone(action), snapshot: clone(snapshot), intent };
}

// Final source/manifest digests are mandatory: construction helpers may fill
// placeholders earlier, but this boundary neither generates IDs nor accepts
// placeholders as dispatch authority. There are no Blob or receipt fields.
async function derive(input) {
  // Detach the entire input before the first await. This proof is local to this
  // invocation; later reads still validate their own actual stored bytes.
  const frozen = clone(input), { binding, action, snapshot, intent } = validate(frozen);
  const stages = await adminTemplatePhotoCopyStageManifests(intent);
  for (const [index, stage] of stages.entries()) {
    if (await adminTemplatePhotoCopyStageDigest(stage) !== intent.body.photoCopy.assets[index].assetDigest) invalid();
  }
  const envelope = { version: 1, kind, binding, action, snapshot, stages }, intentJson = canonical(envelope);
  if (new TextEncoder().encode(intentJson).byteLength > 12 * 1024 * 1024) invalid();
  return { envelope, intentJson };
}

const decoded = (value, intentHash) => clone({ binding: value.binding, action: value.action,
  snapshot: value.snapshot, stages: value.stages, intentHash });

export async function encodeAdminTemplatePhotoCopyRecord(input) {
  try {
    const { envelope: { binding, action }, intentJson } = await derive(input);
    return { version: 1, kind, key: recordKey(binding, action.operationId), bindingKey: bindingKey(binding), intentJson, intentHash: await digest(intentJson) };
  } catch { invalid(); }
}

export async function decodeAdminTemplatePhotoCopyRecord(input, bindingInput, operationId) {
  try {
    const record = clone(input), binding = adminTemplatePhotoActionBinding(bindingInput);
    if (!validTemplateOperationId(operationId) || !exact(record, ["version", "kind", "key", "bindingKey", "intentJson", "intentHash"])
      || record.version !== 1 || record.kind !== kind || record.key !== recordKey(binding, operationId) || record.bindingKey !== bindingKey(binding)
      || typeof record.intentJson !== "string" || new TextEncoder().encode(record.intentJson).byteLength > 12 * 1024 * 1024
      || !/^[a-f0-9]{64}$/.test(record.intentHash) || await digest(record.intentJson) !== record.intentHash) invalid();
    const value = JSON.parse(record.intentJson);
    if (!exact(value, ["version", "kind", "binding", "action", "snapshot", "stages"]) || value.version !== 1 || value.kind !== kind
      || value.action?.operationId !== operationId || !same(value.binding, binding) || canonical(value) !== record.intentJson) invalid();
    const expected = await derive({ binding, action: value.action, snapshot: value.snapshot });
    // The actual envelope hash was checked above. Compare the complete derived
    // content, including every stage, without hashing those same bytes again.
    if (expected.intentJson !== record.intentJson) invalid();
    return decoded(value, record.intentHash);
  } catch { invalid(); }
}

export async function prepareAdminTemplatePhotoCopyRecord(input) {
  try {
    const { envelope, intentJson } = await derive(input);
    return decoded(envelope, await digest(intentJson));
  } catch { invalid(); }
}

export { assertEditor as assertAdminTemplatePhotoCopyEditor };
