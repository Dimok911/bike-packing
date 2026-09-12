import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplatePhotoTreeCopyPlanRecord } from "../sync/admin-template-photo-tree-copy-save-plan.js";
import { prepareAdminTemplatePhotoTreeCopyProjection, assertAdminTemplatePhotoTreeCopyExternalReferences } from "./admin-template-photo-tree-copy-projection.js";
import { prepareAdminTemplatePhotoTreeCopyAcceptance } from "./admin-template-photo-tree-copy-acceptance.js";

const collections = ["layouts", "items", "containers"], types = ["items", "containers"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const copy = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const pause = code => { throw Object.assign(Error("Подтверждённая копия сохранена для сверки. Не удалось обновить местный шаблон."),
  { code: `admin-template-photo-tree-copy-apply-${code}`, isAdminTemplateBlocked: true }); };
const sync = fn => {
  const value = fn();
  if (value && typeof value.then === "function") { Promise.resolve(value).catch(() => {}); pause("async-guard"); }
  return value;
};
function namespace(state, layoutId) {
  if (!plain(state) || !collections.every(type => plain(state[type]))) pause("state");
  const layout = state.layouts[layoutId];
  if (!plain(layout) || layout.id !== layoutId || !plain(layout.arrangement)
    || !Object.hasOwn(layout, "locations") || !Object.hasOwn(layout, "categories")
    || !Object.hasOwn(layout.arrangement, "packedItems")) pause("namespace");
  return { activeLayoutId: layoutId, layouts: { [layoutId]: layout },
    ...Object.fromEntries(types.map(type => [type, Object.fromEntries(Object.entries(state[type])
      .filter(([, row]) => row?.publicCatalogLayoutId === layoutId))])),
    locations: layout.locations, categories: layout.categories, packedItems: layout.arrangement.packedItems };
}
function merge(state, selected) {
  const layoutId = selected.activeLayoutId;
  assertAdminTemplatePhotoTreeCopyExternalReferences(state, layoutId, types.flatMap(type => Object.keys(selected[type])));
  const next = { ...state, layouts: { ...state.layouts, [layoutId]: copy(selected.layouts[layoutId]) } };
  for (const type of types) next[type] = Object.fromEntries(Object.entries(state[type]).filter(([, row]) => row?.publicCatalogLayoutId !== layoutId));
  for (const type of types) for (const [id, row] of Object.entries(selected[type])) {
    if (collections.some(collection => Object.hasOwn(next[collection], id))) pause("identity-collision");
    next[type][id] = copy(row);
  }
  // Layout dictionaries remain isolated. As in the existing photo mirror,
  // only the currently selected layout's packed mirror needs hydration.
  if (state.activeLayoutId === layoutId) next.packedItems = copy(selected.packedItems);
  return next;
}

// Call after dispatch has returned, under a NEW genuine common/inventory scope.
// This function proves the complete receipt itself; a detached runner result
// does not grant apply authority. No command/stage/receipt is deleted here.
// Persist mirror, then exact typed acceptance, then change live collections
// without an intervening await. Ordinary saves cannot drop this separate row.
// A quota/readback failure leaves live state intact. Never blindly roll back a
// mirror which may already contain the result or another tab's newer data.
export async function applyAdminTemplatePhotoTreeCopyResult(input, externalGuard) {
  if (!exact(input, ["plan", "store", "receipt", "stageReceipts", "getState", "getContext", "getMirrorContext"])
    || [externalGuard, input.getState, input.getContext, input.getMirrorContext].some(fn => typeof fn !== "function")) pause("dependencies");
  const { store, getState, getContext, getMirrorContext } = input;
  const { plan, receipt, stageReceipts } = copy({ plan: input.plan, receipt: input.receipt, stageReceipts: input.stageReceipts });
  const binding = adminTemplatePhotoActionBinding(plan.binding), live = sync(getState);
  if (!plain(live) || !collections.every(type => plain(live[type]))) pause("state");
  // Runtime selection is non-enumerable and must survive this detached guard
  // snapshot without changing how the shared mirror stores that selection.
  const initial = copy({ ...live, activeLayoutId: live.activeLayoutId });
  const initialContext = copy(sync(getContext)), mirrorContext = sync(getMirrorContext);
  if (!exact(mirrorContext, ["storage", "key", "scopeKey"]) || typeof mirrorContext.key !== "string" || !mirrorContext.key
    || mirrorContext.scopeKey !== `id:${binding.actorId}` || typeof mirrorContext.storage?.getItem !== "function"
    || typeof mirrorContext.storage.setItem !== "function") pause("mirror-context");
  const { storage, key, scopeKey } = mirrorContext, layoutRefs = new Map(Object.entries(live.layouts));
  let selected = [];
  const guard = () => {
    sync(externalGuard);
    const context = sync(getContext), currentMirror = sync(getMirrorContext);
    if (!plain(context) || context.scope !== "admin-template" || context.admin !== true
      || typeof context.generation !== "string" || !context.generation || !same(context, initialContext)
      || Object.keys(binding).some(field => context[field] !== binding[field]) || !same(store?.binding, binding)
      || sync(getState) !== live || live.activeLayoutId !== initial.activeLayoutId
      || !exact(currentMirror, ["storage", "key", "scopeKey"]) || currentMirror.storage !== storage
      || currentMirror.key !== key || currentMirror.scopeKey !== scopeKey) pause("context");
    for (const id of selected) if (live.layouts?.[id] !== layoutRefs.get(id) || !same(namespace(live, id), namespace(initial, id))) pause("changed");
  };
  guard(); const record = await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, store, guard); guard();
  const { source, target } = record.snapshot; selected = [source.layoutId, target.layoutId]; guard();
  if (!same(namespace(initial, source.layoutId), source.beforeState)) pause("source");
  // This detached candidate only derives the exact confirmed target. It is
  // never assigned wholesale, and cannot hide edits: actual target comparison
  // below accepts only full before / own pending / fully proved confirmation.
  const candidate = merge(initial, target.beforeState);
  const prepared = await prepareAdminTemplatePhotoTreeCopyProjection({ state: candidate, plan, store, receipt, stageReceipts }, guard); guard();
  const confirmed = prepared.targetSnapshot.beforeState, pending = copy(target.beforeState), pendingLayout = pending.layouts[target.layoutId];
  pendingLayout.adminCausalSource = { ...pendingLayout.adminCausalSource, planId: plan.id,
    base: { operationId: plan.id }, photoTreeCopyPending: plan.id };
  pendingLayout.templateDraftSyncPending = true;
  const accepted = value => [target.beforeState, pending, confirmed].some(expected => same(value, expected));
  const currentTarget = namespace(initial, target.layoutId);
  if (!accepted(currentTarget)) pause("target");
  const acceptance = await prepareAdminTemplatePhotoTreeCopyAcceptance({ plan, store, receipt, stageReceipts,
    targetSnapshot: prepared.targetSnapshot, getContext, getMirrorContext }, guard); guard();
  const raw = storage.getItem(key); guard();
  if (typeof raw !== "string") pause("mirror-missing");
  let mirror; try { mirror = JSON.parse(raw); } catch { pause("mirror-json"); }
  if (!accepted(namespace(mirror, target.layoutId))) pause("mirror-changed");
  const nextMirror = merge(mirror, confirmed); merge(live, confirmed);
  const encoded = JSON.stringify(nextMirror), alreadyApplied = same(currentTarget, confirmed);
  guard(); if (storage.getItem(key) !== raw) pause("mirror-changed");
  guard(); merge(live, confirmed);
  const mirrorNeedsWrite = !same(mirror, nextMirror);
  if (mirrorNeedsWrite) {
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) pause("mirror-readback");
  }
  guard();
  if (storage.getItem(key) !== (mirrorNeedsWrite ? encoded : raw)) pause("mirror-changed");
  guard();
  acceptance.persist(); acceptance.assertCurrent();
  if (storage.getItem(key) !== (mirrorNeedsWrite ? encoded : raw)) pause("mirror-changed");
  acceptance.assertCurrent(); guard();
  const nextLive = merge(live, confirmed);
  // No callback, await, request or storage operation occurs after this point.
  for (const type of collections) live[type] = nextLive[type];
  if (live.activeLayoutId === target.layoutId) live.packedItems = nextLive.packedItems;
  return { state: alreadyApplied ? "already-applied" : "applied", operationId: plan.id,
    layoutId: target.layoutId, recordIntentHash: record.intentHash, targetSnapshot: copy(prepared.targetSnapshot), acceptance: copy(acceptance.acceptance) };
}
