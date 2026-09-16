import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplatePhotoWholeCopyPlanRecord } from "../sync/admin-template-photo-whole-copy-save-plan.js";

const collections = ["layouts", "items", "containers"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const paused = code => { throw Object.assign(Error("Исходная укладка и место для её копии требуют сверки. Местные данные сохранены."),
  { code: `admin-template-photo-whole-copy-namespaces-${code}`, isAdminTemplateBlocked: true }); };
const sync = fn => {
  const value = fn();
  if (value?.then) { Promise.resolve(value).catch(() => {}); paused("async-guard"); }
  return value;
};

function namespace(state, layoutId) {
  if (!plain(state) || !collections.every(type => plain(state[type]))) paused("state");
  const layout = state.layouts[layoutId];
  if (!plain(layout) || layout.id !== layoutId || !plain(layout.arrangement)
    || !Object.hasOwn(layout, "locations") || !Object.hasOwn(layout, "categories")
    || !Object.hasOwn(layout.arrangement, "packedItems")) paused("source");
  return { activeLayoutId: layoutId, layouts: { [layoutId]: layout },
    ...Object.fromEntries(["items", "containers"].map(type => [type, Object.fromEntries(Object.entries(state[type])
      .filter(([, row]) => row?.publicCatalogLayoutId === layoutId))])),
    locations: layout.locations, categories: layout.categories, packedItems: layout.arrangement.packedItems };
}

function allocations(plan, record) {
  const targetId = plan.binding.itemKey.split(":")[1];
  const ids = new Set([plan.id, plan.binding.listId, plan.binding.itemKey, targetId,
    `public-demo-state-${targetId}`, `public-shared-layout-${targetId}`, `demo-state:${targetId}`, `shared-layout:${targetId}`,
    record.snapshot.target.layoutId, record.snapshot.target.serverLayoutId]);
  for (const owner of record.snapshot.copiedOwners) { ids.add(owner.localId); ids.add(owner.serverId); }
  for (const owner of plan.operations[0].body.photoCopy.owners) {
    ids.add(owner.entityId);
    for (const photo of owner.photos) { ids.add(photo.photoId); ids.add(photo.assetId); }
  }
  return ids;
}

// Check schema-defined identities and references throughout all current local
// namespaces, including raw canonical catalogs and photo owner/view mappings.
// Opaque notes/metadata are not identity authority and are never rewritten.
function assertAbsent(state, reserved) {
  if (!plain(state) || !collections.every(type => plain(state[type]))) paused("state");
  const ref = value => { if (reserved.has(value)) paused("identity-collision"); };
  const ids = value => { if (Array.isArray(value)) value.forEach(ref); };
  const entries = value => plain(value) ? Object.entries(value) : [];
  const list = value => Array.isArray(value) ? value : [];
  const binding = value => { if (plain(value)) { ref(value.listId); ref(value.itemKey); } };
  const photo = value => {
    if (!plain(value)) return;
    for (const key of ["id", "photoId", "assetId", "listId"]) ref(value[key]);
    for (const url of [value.url, value.thumbUrl, value.urls?.original, value.urls?.thumb]) if (typeof url === "string") {
      let path; try { path = new URL(url, "https://local.invalid").pathname; } catch { continue; }
      for (const segment of path.split("/")) {
        let decoded; try { decoded = decodeURIComponent(segment); } catch { continue; }
        ref(decoded);
      }
    }
  };
  const placement = row => {
    if (!plain(row)) return;
    ref(row.id); ref(row.parentId); ref(row.containerId); ids(row.childIds); ids(row.itemIds);
    for (const part of list(row.order)) if (["item", "container"].includes(part?.type)) ref(part.id);
  };
  const arrangement = value => {
    if (!plain(value)) return;
    ids(value.rootContainerIds);
    for (const [key, row] of entries(value.containers)) { ref(key); placement(row); }
    for (const [key, parent] of entries(value.items)) { ref(key); ref(parent); }
    for (const key of [...Object.keys(value.itemQuantities || {}), ...Object.keys(value.packedItems || {})]) ref(key);
  };
  const seen = new Set();
  const payload = value => {
    if (!plain(value) || seen.has(value)) return; seen.add(value);
    ref(value.activeLayoutId);
    for (const key of Object.keys(value.packedItems || {})) ref(key);
    for (const type of collections) for (const [key, row] of entries(value[type])) {
      ref(key); if (!plain(row)) continue;
      for (const field of ["id", "publicCatalogLayoutId", "sharedSourceId", "adminDemoListId", "adminSharedSourceId"]) ref(row[field]);
      placement(row); ids(row.rootContainerIds); arrangement(row.arrangement);
      for (const image of list(row.photos)) photo(image);
      const source = row.adminCausalSource;
      if (plain(source)) {
        binding(source.binding); ref(source.planId); ref(source.base?.operationId);
        for (const map of [source.photoOwnerMap, source.photoView]) if (plain(map)) {
          binding(map.binding); ref(map.layoutId);
          for (const owner of list(map.owners)) {
            ref(owner?.localId); ref(owner?.serverId);
            for (const image of [...list(owner?.rawPhotos), ...list(owner?.viewPhotos)]) photo(image);
          }
        }
        payload(source.canonicalPayload);
      }
      // Legacy copy choices can retain target aliases before a target row is
      // installed. Their journal authority is checked elsewhere, never here.
      const plan = row.adminCausalCopyPlan;
      if (plain(plan)) {
        ref(plan.id); binding(plan.binding);
        for (const operation of list(plan.operations)) {
          ref(operation?.id); binding(operation); ref(operation?.body?.base?.operationId);
          payload(operation?.body?.payload);
        }
      }
    }
  };
  payload(state);
}

// Detached local namespace proof only. The caller's mandatory synchronous
// guard supplies and expires raw-plan/inventory/lease authority. No SQL absence,
// receipt, POST permission or durable write follows from this helper.
// The target must be wholly absent: an own pending choice lives in journals,
// never in a fabricated target.beforeState or a temporary live target layout.
// cleanState is an INITIAL snapshot; never replace live state with it after an
// await. Later target-only apply must preserve fresh unrelated state separately.
export async function prepareAdminTemplatePhotoWholeCopyNamespaces(input, guard) {
  if (!exact(input, ["plan", "store", "getState", "getContext"]) || typeof guard !== "function"
    || typeof input.getState !== "function" || typeof input.getContext !== "function") paused("dependencies");
  const { store, getState, getContext } = input, plan = clone(input.plan), binding = adminTemplatePhotoActionBinding(plan.binding);
  const guarded = () => { if (sync(guard) === false) paused("guard"); };
  const context = () => {
    const value = sync(getContext);
    if (!plain(value) || value.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation
      || Object.keys(binding).some(key => value[key] !== binding[key])) paused("context");
    return clone(value);
  };
  guarded();
  const initialContext = context(), live = sync(getState), initial = clone(live);
  if (!plain(live) || !collections.every(type => plain(live[type]))) paused("state");
  const collectionRefs = collections.map(type => live[type]), roots = Object.fromEntries(collections.map(type => [type, new Map(Object.entries(live[type]))])),
    objects = new WeakMap();
  const remember = value => {
    if (!value || typeof value !== "object" || objects.has(value)) return;
    const children = Object.entries(value).filter(([, row]) => row && typeof row === "object");
    objects.set(value, children); children.forEach(([, row]) => remember(row));
  };
  collections.forEach(type => remember(live[type]));
  const sameObjects = value => {
    if (!value || typeof value !== "object" || !objects.has(value)) paused("objects-changed");
    for (const [key, before] of objects.get(value)) { if (value[key] !== before) paused("objects-changed"); sameObjects(before); }
  };
  let selectedGuard = null;
  const assertCurrent = () => {
    guarded();
    if (!same(context(), initialContext) || sync(getState) !== live || !same(store?.binding, binding)
      || collections.some((type, index) => live[type] !== collectionRefs[index])) paused("context");
    selectedGuard?.(); guarded();
  };
  assertCurrent();
  const record = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, store, assertCurrent); assertCurrent();
  const source = record.snapshot.source, reserved = allocations(plan, record), sourceNamespace = clone(namespace(initial, source.layoutId));
  if (!same(sourceNamespace, source.beforeState)) paused("source");
  // An initial collision cannot be repaired during the proof and then restored
  // accidentally from cleanState. Check initial bytes as well as current state.
  assertAbsent(initial, reserved);
  selectedGuard = () => {
    if (!same(namespace(live, source.layoutId), sourceNamespace)) paused("source-changed");
    for (const type of collections) for (const id of Object.keys(sourceNamespace[type])) {
      if (live[type][id] !== roots[type].get(id)) paused("objects-changed");
      sameObjects(live[type][id]);
    }
    assertAbsent(live, reserved);
  };
  assertCurrent();
  const current = await assertAdminTemplatePhotoWholeCopyPlanRecord(plan, store, assertCurrent); assertCurrent();
  if (!same(current, record)) paused("record-changed");
  return Object.freeze({ ...freeze({ sourceLayoutId: source.layoutId, targetLayoutId: record.snapshot.target.layoutId,
    recordIntentHash: record.intentHash, sourceNamespace, cleanState: initial }), assertCurrent });
}
