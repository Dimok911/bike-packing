import { validateGuestLoginHandoff } from "../public/guest-login-handoff.js";
import { planGuestTemplateEntityReuse } from "../public/guest-login-entity-reuse.js";
import { getLayoutContainerIdSet, getLayoutItemIdSet } from "../state/layout-ops.js";
import { guestSharedLinkDetachedItemIds } from "../public/guest-shared-link-target.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { personalGuestSourceLayout } from "./personal-guest-import-source.js";
import { personalGuestImportOwner } from "./personal-guest-import-owner.js";
import { personalGuestImportLayout } from "./personal-guest-import-layout.js";
import { PERSONAL_GUEST_IMPORT_ENABLED } from "./personal-guest-import-protocol.js";
export { PERSONAL_GUEST_IMPORT_ENABLED } from "./personal-guest-import-protocol.js";

// Preparation only. No runtime caller, server protocol or writer is enabled by
// this selection. The guest workspace must remain until an exact paired import
// and current account/list state have been durably confirmed.
const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const fail = () => { throw Error("Не удалось зафиксировать гостевую работу для этого аккаунта. Исходные данные сохранены."); };

// Freeze the complete guest source, selected layouts, destination base and all
// identities before hashing, file reads or confirmation. Identity allocation
// never uses clocks, labels, storage enumeration or a previous attempt's ACK.
export function preparePersonalGuestImportSelection({ binding, user, handoff, candidate, basePayload, baseStateRevision,
  layoutNames, editMeta = {}, nowMs = Date.now() }, { enabled = PERSONAL_GUEST_IMPORT_ENABLED, createUuid = () => crypto.randomUUID() } = {}) {
  if (!enabled || binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || binding.scopeKey !== `id:${binding.actorId}` || !id(binding.listId) || String(user?.id || "") !== binding.actorId
    || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1) fail();
  assertListOperationPayload({ ...binding, kind: "list.import", body: { handoff, candidate, basePayload, baseStateRevision, layoutNames, editMeta } });
  const validation = validateGuestLoginHandoff(handoff, { user, candidate, nowMs });
  if (!validation.ok) fail();
  const chosen = clone(validation.candidate), source = chosen.sourceState, base = clone(basePayload);
  if (![source, base].every(value => value && ["items", "containers", "layouts"].every(key => value[key]
    && typeof value[key] === "object" && !Array.isArray(value[key])))) fail();
  if (!Array.isArray(layoutNames) || layoutNames.length !== chosen.layouts.length || !layoutNames.length || layoutNames.length > 50
    || layoutNames.some(value => typeof value !== "string" || !value.trim() || value.length > 1000)
    || new Set(layoutNames.map(value => value.trim().toLowerCase())).size !== layoutNames.length
    || layoutNames.some(value => Object.values(base.layouts).some(layout => String(layout.name || "").trim().toLowerCase() === value.trim().toLowerCase()))) fail();
  const projectedSource = { ...source, layouts: { ...source.layouts } }, projectedTarget = clone(base);
  for (const entry of chosen.layouts) projectedSource.layouts[entry.layoutId] = personalGuestSourceLayout(source, entry.layoutId);
  const allocated = new Set(), sourcePhotoIds = new Set([source, base].flatMap(state => ["items", "containers"].flatMap(field =>
    Object.values(state[field]).flatMap(owner => (owner.photos || []).flatMap(photo => [photo.id, photo.photoId, photo.assetId, photo.localId]).filter(Boolean)))));
  const allocate = prefix => {
    const value = createUuid(); if (!uuid(value) || allocated.has(value)) fail(); allocated.add(value);
    const target = prefix ? `${prefix}-${value}` : value;
    if (sourcePhotoIds.has(value) || [source, base].some(state => ["items", "containers", "layouts"].some(field => Object.hasOwn(state[field], target)))) fail();
    return target;
  };
  const operationId = allocate(""), layoutTargets = [], ownerTargets = [], photoTargets = [], maps = { containers: new Map(), items: new Map() };
  for (const [index, entry] of chosen.layouts.entries()) {
    const layout = projectedSource.layouts[entry.layoutId];
    if (!id(entry.layoutId) || !layout || layout.id !== entry.layoutId) fail();
    const selected = { containers: [...getLayoutContainerIdSet(projectedSource, layout)],
      items: [...new Set([...getLayoutItemIdSet(projectedSource, layout), ...guestSharedLinkDetachedItemIds(layout)])] };
    const reuse = planGuestTemplateEntityReuse(projectedTarget, projectedSource, layout);
    for (const [collection, entityType] of [["containers", "container"], ["items", "item"]]) for (const sourceId of selected[collection]) {
      if (!id(sourceId) || !source[collection][sourceId] || source[collection][sourceId].id !== sourceId) fail();
      if (maps[collection].has(sourceId)) continue;
      const existing = reuse[collection].get(sourceId), targetId = existing || allocate(entityType);
      if (!id(targetId) || existing && (!projectedTarget[collection][targetId] || projectedTarget[collection][targetId].id !== targetId)) fail();
      maps[collection].set(sourceId, targetId);
      const placed = entityType === "container" || Object.values(layout.arrangement?.containers || {}).some(placement => placement.itemIds?.includes(sourceId));
      const sourceLayoutId = !placed
        ? source.activeLayoutId || Object.keys(source.layouts)[0] || "" : layout.id;
      const descriptor = { entityType, sourceId, targetId, reuse: Boolean(existing), ...(existing ? {} : { sourceLayoutId }) };
      ownerTargets.push(descriptor);
      projectedTarget[collection][targetId] = personalGuestImportOwner({ source: source[collection][sourceId], descriptor,
        target: existing ? projectedTarget[collection][targetId] : null, editMeta });
      if (!existing) {
        const photos = source[collection][sourceId].photos ?? [], seen = new Set();
        if (!Array.isArray(photos)) fail();
        for (const photo of photos) {
          const sourcePhotoId = photo?.id || photo?.localId;
          if (!id(sourcePhotoId) || seen.has(sourcePhotoId) || photoTargets.length >= 50) fail(); seen.add(sourcePhotoId);
          photoTargets.push({ entityType, sourceEntityId: sourceId, entityId: targetId, sourcePhotoId, photoId: allocate(""), assetId: allocate("") });
        }
      }
    }
    const layoutTarget = { sourceId: layout.id, targetId: allocate("layout"), name: layoutNames[index] };
    layoutTargets.push(layoutTarget);
    projectedTarget.layouts[layoutTarget.targetId] = personalGuestImportLayout({ sourcePayload: projectedSource, targetPayload: projectedTarget,
      ...layoutTarget, ownerTargets, editMeta }).layout;
  }
  return { version: 1, binding: clone(binding), operationId, validatedAt: nowMs, handoff: clone(handoff), candidate: chosen,
    basePayload: base, baseStateRevision, editMeta: clone(editMeta), layoutTargets, ownerTargets, photoTargets };
}
