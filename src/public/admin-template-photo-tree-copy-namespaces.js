import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplatePhotoTreeCopyPlanRecord } from "../sync/admin-template-photo-tree-copy-save-plan.js";

const collections = ["layouts", "items", "containers"], types = ["items", "containers"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const paused = code => { throw Object.assign(Error("Оба шаблона и сохранённое копирование дерева требуют сверки. Местные данные сохранены."),
  { code: `admin-template-photo-tree-copy-namespaces-${code}`, isAdminTemplateBlocked: true }); };
const sync = fn => {
  const value = fn();
  if (value && typeof value.then === "function") {
    // A rejected async getter must not escape as an unhandled rejection. Its
    // result is never awaited or used as permission for this synchronous guard.
    Promise.resolve(value).catch(() => {}); paused("async-guard");
  }
  return value;
};

function namespace(state, layoutId) {
  if (!plain(state) || !collections.every(type => plain(state[type]))) paused("state");
  const layout = state.layouts[layoutId];
  if (!plain(layout) || layout.id !== layoutId || !plain(layout.arrangement)
    || !Object.hasOwn(layout, "locations") || !Object.hasOwn(layout, "categories")
    || !Object.hasOwn(layout.arrangement, "packedItems")) paused("namespace");
  // No dictionary/packed fallback: even a removed key whose fallback happens
  // to have the same value is a change to the captured namespace.
  return { activeLayoutId: layoutId, layouts: { [layoutId]: layout },
    ...Object.fromEntries(types.map(type => [type, Object.fromEntries(Object.entries(state[type])
      .filter(([, row]) => row?.publicCatalogLayoutId === layoutId))])),
    locations: layout.locations, categories: layout.categories, packedItems: layout.arrangement.packedItems };
}

// This is a detached input adapter, not a lease, dispatch/receipt authority or
// persistence operation. The mandatory external synchronous guard must prove
// the actual raw plan pointer/inventory and expire with the caller's outer scope.
// assertCurrent below checks local context/namespaces; IDB is fully re-read only
// during preparation, never certified forever by this returned function.
//
// cleanState retains the initially captured unrelated/global fields. It must
// only feed the full V9 receipt projector and a guarded target-only merge: NEVER
// assign the whole snapshot to live state after an await. The app still chooses
// contextual active-target packed/dictionary hydration and quota rollback.
export async function prepareAdminTemplatePhotoTreeCopyNamespaces(input, guard) {
  if (!exact(input, ["plan", "store", "getState", "getContext"]) || typeof guard !== "function"
    || typeof input.getState !== "function" || typeof input.getContext !== "function") paused("dependencies");
  const { store, getState, getContext } = input, plan = clone(input.plan), binding = adminTemplatePhotoActionBinding(plan.binding);
  const context = () => {
    const value = sync(getContext);
    if (!plain(value) || value.scope !== "admin-template" || value.admin !== true
      || typeof value.generation !== "string" || !value.generation
      || Object.keys(binding).some(key => value[key] !== binding[key])) paused("context");
    return clone(value);
  };
  sync(guard);
  const initialContext = context(), live = sync(getState), initial = clone(live);
  if (!plain(live) || !collections.every(type => plain(live[type]))) paused("state");
  // Keep original object identities as well as detached bytes. A replacement
  // of either selected layout during cold proof is not silently adopted.
  const layouts = new Map(Object.entries(live.layouts));
  let selectedGuard = null;
  const assertCurrent = () => {
    sync(guard);
    if (!same(context(), initialContext) || sync(getState) !== live || !same(store?.binding, binding)) paused("context");
    selectedGuard?.();
    sync(guard);
  };
  assertCurrent();
  const record = await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, store, assertCurrent); assertCurrent();
  const { source, target, copiedOwners } = record.snapshot;
  for (const owner of copiedOwners) if (collections.some(type => Object.hasOwn(initial[type], owner.localId))) paused("identity-collision");
  const sourceNamespace = clone(namespace(initial, source.layoutId)), targetNamespace = clone(namespace(initial, target.layoutId));
  if (!same(sourceNamespace, source.beforeState)) paused("source");
  const pendingTargetNamespace = clone(target.beforeState), pendingLayout = pendingTargetNamespace.layouts[target.layoutId];
  pendingLayout.adminCausalSource = { ...pendingLayout.adminCausalSource, planId: plan.id,
    base: { operationId: plan.id }, photoTreeCopyPending: plan.id };
  pendingLayout.templateDraftSyncPending = true;
  const targetMode = same(targetNamespace, target.beforeState) ? "before" : same(targetNamespace, pendingTargetNamespace) ? "pending" : null;
  if (!targetMode) paused("target");
  selectedGuard = () => {
    for (const [side, expected] of [[source, sourceNamespace], [target, targetNamespace]]) {
      if (live.layouts?.[side.layoutId] !== layouts.get(side.layoutId) || !same(namespace(live, side.layoutId), expected)) paused("namespace-changed");
    }
    for (const owner of copiedOwners) if (collections.some(type => Object.hasOwn(live[type], owner.localId))) paused("identity-collision");
  };
  assertCurrent();
  const current = await assertAdminTemplatePhotoTreeCopyPlanRecord(plan, store, assertCurrent); assertCurrent();
  if (!same(current, record)) paused("record-changed");
  const cleanState = clone(initial);
  // The complete target matched a derived before/pending namespace above.
  // Restore exact before metadata (including absent vs false/null keys), not a
  // broad strip operation that could hide another writer or a similar marker.
  cleanState.layouts[target.layoutId] = clone(target.beforeState.layouts[target.layoutId]);
  assertCurrent();
  return Object.freeze({ ...freeze({ sourceLayoutId: source.layoutId, targetLayoutId: target.layoutId,
    recordIntentHash: record.intentHash, targetMode, sourceNamespace, targetNamespace, pendingTargetNamespace, cleanState }), assertCurrent });
}
