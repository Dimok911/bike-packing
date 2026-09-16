import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplateCaptureLease } from "../sync/admin-template-capture-lease.js";
import { projectAdminTemplatePhotoWholeCopyPlanResult } from "../sync/admin-template-photo-whole-copy-save-plan.js";
import { assertAdminTemplatePhotoCopyEditor } from "../sync/admin-template-photo-copy-record.js";
import { captureAdminTemplatePhotoOwnerMap } from "../sync/admin-template-photo-owner-map.js";
import { captureAdminTemplatePhotoView } from "../sync/admin-template-photo-view.js";
import { projectAdminTemplateServerVariant } from "./admin-template-server-variant.js";
import { prepareAdminTemplatePhotoWholeCopyNamespaces } from "./admin-template-photo-whole-copy-namespaces.js";

const collections = ["layouts", "items", "containers"], types = ["items", "containers"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const copy = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const pause = code => { throw Object.assign(Error("Подтверждённая копия сохранена для сверки. Не удалось добавить местный шаблон."),
  { code: `admin-template-photo-whole-copy-apply-${code}`, isAdminTemplateBlocked: true }); };
const sync = fn => {
  const value = fn();
  if (value && typeof value.then === "function") { Promise.resolve(value).catch(() => {}); pause("async-guard"); }
  return value;
};

function targetSnapshot(proof, plan) {
  const binding = plan.binding, { target, confirmedPayload, stateRevision, metadata } = proof;
  const demo = binding.listId.startsWith("public-demo-state"), seed = { id: target.layoutId,
    ...(demo ? { adminDemo: true, adminDemoLanguage: metadata.language, adminDemoListId: binding.listId }
      : { adminSharedSourceId: binding.itemKey.split(":")[1] }) };
  const value = projectAdminTemplateServerVariant(seed, { exists: true, deleted: false, visibility: "private",
    stateRevision, payload: confirmedPayload, metadata }, plan.id, { photoBinding: binding, photoOwnerMapEnabled: true });
  const maps = { items: new Map(), containers: new Map() }, mappings = { items: {}, containers: {} };
  const owners = value.layout.adminCausalSource.photoOwnerMap.owners;
  if (owners.length !== proof.copiedOwners.length) pause("owners");
  for (const owner of owners) {
    const selected = proof.copiedOwners.find(row => (row.entityType === "item" ? "items" : "containers") === owner.type && row.serverId === owner.serverId);
    if (!selected) pause("owners");
    maps[owner.type].set(owner.localId, selected.localId); mappings[owner.type][selected.localId] = owner.serverId;
  }
  const ref = (id, type) => { if (!id) return ""; if (!maps[type].has(id)) pause("reference"); return maps[type].get(id); };
  const ids = (rows, type) => (rows || []).map(id => ref(id, type));
  const placement = row => ({ ...row, parentId: ref(row.parentId, "containers"), childIds: ids(row.childIds, "containers"),
    itemIds: ids(row.itemIds, "items"), order: (row.order || []).map(entry => {
      if (!["item", "container"].includes(entry.type)) pause("reference");
      return { ...entry, id: ref(entry.id, entry.type === "item" ? "items" : "containers") };
    }) });
  value.containers = Object.fromEntries(Object.entries(value.containers).map(([id, row]) => [ref(id, "containers"), { ...placement(row), id: ref(id, "containers") }]));
  value.items = Object.fromEntries(Object.entries(value.items).map(([id, row]) => [ref(id, "items"), { ...row, id: ref(id, "items"), containerId: ref(row.containerId, "containers") }]));
  const object = (rows, type, convert) => Object.fromEntries(Object.entries(rows || {}).map(([id, row]) => [ref(id, type), convert(row)]));
  const a = value.layout.arrangement;
  value.layout.rootContainerIds = ids(value.layout.rootContainerIds, "containers");
  value.layout.arrangement = { ...a, rootContainerIds: ids(a.rootContainerIds, "containers"), containers: object(a.containers, "containers", placement),
    items: object(a.items, "items", id => ref(id, "containers")), itemQuantities: object(a.itemQuantities, "items", row => row), packedItems: object(a.packedItems, "items", row => row) };
  const beforeState = { activeLayoutId: target.layoutId, layouts: { [target.layoutId]: value.layout }, items: value.items, containers: value.containers,
    locations: copy(value.layout.locations), categories: copy(value.layout.categories), packedItems: copy(value.layout.arrangement.packedItems) };
  const photoView = captureAdminTemplatePhotoView({ binding, layoutId: target.layoutId, state: beforeState, sourcePayload: confirmedPayload, mappings });
  const photoOwnerMap = captureAdminTemplatePhotoOwnerMap({ binding, layoutId: target.layoutId, stateRevision,
    state: beforeState, sourcePayload: confirmedPayload, mappings });
  value.layout.adminCausalSource = { version: 1, binding: copy(binding), exists: true, deleted: false, visibility: "private",
    base: { stateRevision }, planId: null, indexes: [], canonicalPayload: copy(confirmedPayload), photoView, photoOwnerMap };
  value.layout.templatePublished = false; value.layout.templateDraftServerHydrated = true;
  const result = { layoutId: target.layoutId, ownerMap: copy(photoOwnerMap), beforeState, metadata: copy(metadata) };
  assertAdminTemplatePhotoCopyEditor({ binding, revision: stateRevision, payload: confirmedPayload, side: result });
  return result;
}

function merge(state, target) {
  if (!plain(state) || !collections.every(type => plain(state[type]))) pause("state");
  const next = { ...state };
  for (const type of collections) {
    next[type] = { ...state[type] };
    for (const [id, row] of Object.entries(target.beforeState[type])) {
      if (collections.some(collection => Object.hasOwn(state[collection], id))) pause("target-present");
      next[type][id] = copy(row);
    }
  }
  return next;
}

// First application only: caller holds a NEW real source/target capture lease
// and inventory guard. Full receipt/stages and current namespaces are proved
// again here. A retained runner result alone grants no application authority.
// The exact target is persisted before live changes; no command, stage or claim
// is retired. Acceptance and cold recovery are separate unfinished boundaries.
export async function applyAdminTemplatePhotoWholeCopyResult(input, externalGuard) {
  if (!exact(input, ["plan", "store", "receipt", "stageReceipts", "captureLease", "getState", "getContext", "getMirrorContext"])
    || [externalGuard, input.getState, input.getContext, input.getMirrorContext].some(fn => typeof fn !== "function")) pause("dependencies");
  const { store, captureLease, getState, getContext, getMirrorContext } = input;
  const { plan, receipt, stageReceipts } = copy({ plan: input.plan, receipt: input.receipt, stageReceipts: input.stageReceipts });
  const binding = adminTemplatePhotoActionBinding(plan.binding), source = plan.operations?.[0]?.body?.source;
  const sourceBinding = adminTemplatePhotoActionBinding({ ...binding, listId: source?.listId, itemKey: source?.itemKey });
  const bindings = [sourceBinding, binding], live = sync(getState), selection = live?.activeLayoutId;
  const initialContext = copy(sync(getContext)), mirrorContext = sync(getMirrorContext);
  if (!exact(mirrorContext, ["storage", "key", "scopeKey"]) || typeof mirrorContext.key !== "string" || !mirrorContext.key
    || mirrorContext.scopeKey !== `id:${binding.actorId}` || typeof mirrorContext.storage?.getItem !== "function"
    || typeof mirrorContext.storage.setItem !== "function") pause("mirror-context");
  const { storage, key, scopeKey } = mirrorContext;
  let namespaces = null;
  const guard = () => {
    if (sync(externalGuard) === false) pause("guard");
    assertAdminTemplateCaptureLease(captureLease, bindings);
    const context = sync(getContext), currentMirror = sync(getMirrorContext);
    if (!same(context, initialContext) || !plain(context) || context.scope !== "admin-template" || context.admin !== true
      || typeof context.generation !== "string" || !context.generation || Object.keys(binding).some(field => context[field] !== binding[field])
      || sync(getState) !== live || live?.activeLayoutId !== selection || !same(store?.binding, binding)
      || !exact(currentMirror, ["storage", "key", "scopeKey"]) || currentMirror.storage !== storage
      || currentMirror.key !== key || currentMirror.scopeKey !== scopeKey) pause("context");
  };
  guard();
  namespaces = await prepareAdminTemplatePhotoWholeCopyNamespaces({ plan, store, getState, getContext }, guard);
  const current = () => { guard(); namespaces.assertCurrent(); };
  current();
  const proof = await projectAdminTemplatePhotoWholeCopyPlanResult({ plan, store, receipt, stageReceipts }, current); current();
  const target = targetSnapshot(proof, plan);
  current();
  const raw = storage.getItem(key); current();
  if (typeof raw !== "string") pause("mirror-missing");
  let mirror; try { mirror = JSON.parse(raw); } catch { pause("mirror-json"); }
  if (!plain(mirror) || !collections.every(type => plain(mirror[type]))) pause("mirror-state");
  // A preceding write may have succeeded while its readback failed. Recognize
  // only the complete receipt-derived namespace, never an ID/hash-only match.
  const alreadyMirrored = Object.hasOwn(mirror.layouts, target.layoutId), absentMirror = copy(mirror);
  if (alreadyMirrored) {
    for (const type of collections) {
      const actual = Object.fromEntries(Object.entries(mirror[type]).filter(([id, row]) => type === "layouts"
        ? id === target.layoutId : row?.publicCatalogLayoutId === target.layoutId));
      if (!same(actual, target.beforeState[type])) pause("mirror-target");
      for (const id of Object.keys(actual)) delete absentMirror[type][id];
    }
  }
  const mirrorGuard = () => { current(); if (storage.getItem(key) !== raw) pause("mirror-changed"); current(); };
  const mirrorNamespaces = await prepareAdminTemplatePhotoWholeCopyNamespaces({ plan, store, getState: () => absentMirror, getContext }, mirrorGuard);
  mirrorNamespaces.assertCurrent(); current();
  const nextMirror = merge(absentMirror, target), encoded = JSON.stringify(nextMirror);
  mirrorGuard(); merge(live, target); current();
  if (!alreadyMirrored) {
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) pause("mirror-readback");
  }
  current();
  if (storage.getItem(key) !== (alreadyMirrored ? raw : encoded)) pause("mirror-changed");
  current();
  const nextLive = merge(live, target);
  // No await, callback or storage operation after this point. Preserve current
  // unrelated object references, runtime selection, packed mirror and settings.
  for (const type of collections) live[type] = nextLive[type];
  return { state: "applied", operationId: plan.id, layoutId: target.layoutId,
    recordIntentHash: proof.recordIntentHash, targetSnapshot: copy(target) };
}
