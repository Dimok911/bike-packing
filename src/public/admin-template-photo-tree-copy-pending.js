import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../sync/admin-template-photo-tree-copy-record.js";
import { assertAdminTemplateCaptureLease } from "../sync/admin-template-capture-lease.js";

const collections = ["layouts", "items", "containers"], types = ["items", "containers"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const copy = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const pause = code => { throw Object.assign(Error("Копирование сохранено для сверки. Не удалось отметить ожидающее действие в местном шаблоне."),
  { code: `admin-template-photo-tree-copy-pending-${code}`, isAdminTemplateBlocked: true }); };
const sync = fn => {
  const value = fn();
  if (value && typeof value.then === "function") { Promise.resolve(value).catch(() => {}); pause("async-callback"); }
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

// The caller already proved its durable store, plan and client under this same
// common lease. This helper rederives the complete typed record, then records
// only the target's pending pointer. It creates no owners or remote effects.
// Mirror first/readback, live last; a failed readback never rolls back shared
// storage. After success the caller must retire or update its before-state guard.
export async function persistAdminTemplatePhotoTreeCopyPending(input, externalGuard) {
  if (!exact(input, ["record", "captureLease", "getState", "getContext", "getMirrorContext"])
    || [externalGuard, input.getState, input.getContext, input.getMirrorContext].some(fn => typeof fn !== "function")) pause("dependencies");
  const record = copy(input.record);
  if (!exact(record, ["binding", "action", "snapshot", "stages", "intentHash"])) pause("record");
  const binding = adminTemplatePhotoActionBinding(record.binding), source = record.snapshot?.source, target = record.snapshot?.target;
  const sourceBinding = adminTemplatePhotoActionBinding({ ...binding, listId: record.action?.body?.photoCopy?.source?.listId,
    itemKey: record.action?.body?.photoCopy?.source?.itemKey });
  const bindings = [binding, sourceBinding], { captureLease, getState, getContext, getMirrorContext } = input;
  assertAdminTemplateCaptureLease(captureLease, bindings);
  if (sync(externalGuard) === false) pause("guard");
  const live = sync(getState), initial = copy(live), initialContext = copy(sync(getContext)), mirrorContext = sync(getMirrorContext);
  if (!exact(mirrorContext, ["storage", "key", "scopeKey"]) || typeof mirrorContext.key !== "string" || !mirrorContext.key
    || mirrorContext.scopeKey !== `id:${binding.actorId}` || typeof mirrorContext.storage?.getItem !== "function"
    || typeof mirrorContext.storage.setItem !== "function") pause("mirror-context");
  const { storage, key, scopeKey } = mirrorContext, selected = [source?.layoutId, target?.layoutId];
  const layoutRefs = selected.map(id => live?.layouts?.[id]);
  const guard = () => {
    assertAdminTemplateCaptureLease(captureLease, bindings);
    if (sync(externalGuard) === false) pause("guard");
    const current = sync(getState), currentMirror = sync(getMirrorContext), context = sync(getContext);
    if (current !== live || live.activeLayoutId !== initial.activeLayoutId
      || !plain(context) || context.scope !== "admin-template" || context.admin !== true
      || typeof context.generation !== "string" || !context.generation || !same(context, initialContext)
      || Object.keys(binding).some(field => context[field] !== binding[field])
      || !exact(currentMirror, ["storage", "key", "scopeKey"]) || currentMirror.storage !== storage
      || currentMirror.key !== key || currentMirror.scopeKey !== scopeKey) pause("context");
    for (const [index, id] of selected.entries()) if (live.layouts?.[id] !== layoutRefs[index]
      || !same(namespace(live, id), namespace(initial, id))) pause("changed");
  };
  guard();
  const expected = await prepareAdminTemplatePhotoTreeCopyRecord({ binding: record.binding, action: record.action, snapshot: record.snapshot });
  guard(); if (!same(expected, record)) pause("record");
  const pending = copy(target.beforeState), pendingLayout = pending.layouts[target.layoutId];
  pendingLayout.adminCausalSource = { ...pendingLayout.adminCausalSource, planId: record.action.operationId,
    base: { operationId: record.action.operationId }, photoTreeCopyPending: record.action.operationId };
  pendingLayout.templateDraftSyncPending = true;
  const accepted = value => same(value, target.beforeState) || same(value, pending);
  if (!same(namespace(initial, source.layoutId), source.beforeState)) pause("source");
  const liveTarget = namespace(initial, target.layoutId);
  if (!accepted(liveTarget)) pause("target");
  const raw = sync(() => storage.getItem(key)); guard();
  if (typeof raw !== "string") pause("mirror-missing");
  let mirror; try { mirror = JSON.parse(raw); } catch { pause("mirror-json"); }
  if (!same(namespace(mirror, source.layoutId), source.beforeState)
    || !accepted(namespace(mirror, target.layoutId))) pause("mirror-changed");
  const needsWrite = !same(namespace(mirror, target.layoutId), pending);
  const nextMirror = { ...mirror, layouts: { ...mirror.layouts, [target.layoutId]: copy(pendingLayout) } };
  const encoded = JSON.stringify(nextMirror), nextLayout = copy(pendingLayout);
  const result = { state: same(liveTarget, pending) ? "already-pending" : "pending", operationId: record.action.operationId,
    layoutId: target.layoutId, recordIntentHash: record.intentHash };
  guard(); if (sync(() => storage.getItem(key)) !== raw) pause("mirror-changed");
  guard();
  if (needsWrite) {
    sync(() => storage.setItem(key, encoded)); guard();
    if (sync(() => storage.getItem(key)) !== encoded) pause("mirror-readback");
  }
  guard();
  if (sync(() => storage.getItem(key)) !== (needsWrite ? encoded : raw)) pause("mirror-changed");
  guard();
  // No callback, storage operation, or await follows this single live mutation.
  if (result.state !== "already-pending") live.layouts[target.layoutId] = nextLayout;
  return result;
}
