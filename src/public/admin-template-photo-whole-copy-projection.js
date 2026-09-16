import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { projectAdminTemplatePhotoWholeCopyPlanResult } from "../sync/admin-template-photo-whole-copy-save-plan.js";
import { assertAdminTemplatePhotoCopyEditor } from "../sync/admin-template-photo-copy-record.js";
import { captureAdminTemplatePhotoOwnerMap } from "../sync/admin-template-photo-owner-map.js";
import { captureAdminTemplatePhotoView } from "../sync/admin-template-photo-view.js";
import { projectAdminTemplateServerVariant } from "./admin-template-server-variant.js";

const copy = value => JSON.parse(canonical(value));
const exact = (value, keys) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const pause = code => { throw Object.assign(Error("Подтверждённая копия и местный шаблон требуют сверки."),
  { code: `admin-template-photo-whole-copy-projection-${code}`, isAdminTemplateBlocked: true }); };
const current = guard => {
  if (typeof guard !== "function") pause("guard");
  const result = guard();
  if (result?.then) { Promise.resolve(result).catch(() => {}); pause("async-guard"); }
  if (result === false) pause("guard");
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

// Detached target only, independently reconstructed from the full historical
// typed record and committed receipt. Current source/mirror admission and any
// durable/live application remain the caller's responsibility.
export async function prepareAdminTemplatePhotoWholeCopyProjection(input, guard) {
  if (!exact(input, ["plan", "store", "receipt", "stageReceipts"])) pause("dependencies");
  const { store } = input, frozen = copy({ plan: input.plan, receipt: input.receipt, stageReceipts: input.stageReceipts });
  current(guard);
  const proof = await projectAdminTemplatePhotoWholeCopyPlanResult({ ...frozen, store }, () => current(guard));
  current(guard);
  const result = targetSnapshot(proof, frozen.plan);
  current(guard);
  return copy({ proof, targetSnapshot: result });
}