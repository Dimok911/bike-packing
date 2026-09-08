import { preparePersonalCopyBatch } from "./personal-copy-intent.js";
import { preparePersonalPhotoCopyBatch, createPersonalPhotoCopySetSession } from "./personal-photo-copy-batch.js";
import { PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED, assertPersonalPhotoCopyBatchCandidate } from "./personal-photo-copy-batch-protocol.js";
import { personalPhotoCopyPlacementLayout } from "./personal-photo-copy-placement-layout.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";
import { assertListOperationPayload } from "./list-operation-payload.js";

const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Object.assign(Error("Не подтверждены вещь и место отдельной копии. Исходные данные сохранены."), { code: "item-copy-placement" }); };
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
export function personalItemCopyPlacementIntent(value) {
  if (value?.type !== "item-copy-placement" || value.version !== 1
    || ![value.sourceId, value.targetId, value.targetLayoutId, value.targetContainerId].every(id) || value.sourceId === value.targetId
    || Object.keys(value).some(key => !["type", "version", "sourceId", "targetId", "targetLayoutId", "targetContainerId"].includes(key))) fail();
  return clone(value);
}
const placementInput = (snapshot, request, editMeta) => ({ version: 1, targetLayout: clone(snapshot.layouts[request.targetLayoutId]),
  targetContainerId: request.targetContainerId, targetIndex: null, layoutFields: clone(editMeta) });

export function preparePersonalItemCopyPlacement(state, value, { listId, changedAt = "", currentEditMeta = () => ({}), snapshotToPayload = value => value } = {}) {
  const intent = personalItemCopyPlacementIntent(value), editMeta = currentEditMeta(changedAt), base = snapshotToPayload(clone(state));
  if (!preservesConfirmedPersonalPhotos(base, base, listId)) fail();
  const prepared = preparePersonalCopyBatch(state, { type: "copy", version: 1, keepPlacement: false, layoutId: "",
    entries: [{ type: "item", sourceId: intent.sourceId, targetId: intent.targetId }] }, { changedAt, currentEditMeta: () => editMeta });
  const body = { owners: [{ entityType: "item", entityId: intent.targetId,
    copySource: { entityType: "item", entityId: intent.sourceId, payload: base.items[intent.sourceId] } }], copyPlacement: placementInput(base, intent, editMeta) };
  const placement = personalPhotoCopyPlacementLayout(body, base);
  prepared.snapshot.layouts[placement.targetLayoutId] = placement.layout;
  return { snapshot: prepared.snapshot, intent, itemId: intent.targetId };
}

export function preparePersonalPhotoItemCopyPlacement(input, { enabled = PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED, snapshotToPayload = value => value } = {}) {
  if (!enabled || !input.request?.sourceId) fail();
  const request = clone(input.request);
  const prepared = preparePersonalPhotoCopyBatch({ ...input, entityType: "item", sourceIds: [request.sourceId] }, { enabled, snapshotToPayload });
  prepared.body.copyPlacement = placementInput(input.basePayload, request, input.editMeta);
  const placement = personalPhotoCopyPlacementLayout(prepared.body, input.basePayload);
  prepared.snapshot.layouts[placement.targetLayoutId] = placement.layout;
  prepared.payload = snapshotToPayload(clone(prepared.snapshot));
  assertPersonalPhotoCopyBatchCandidate({ body: prepared.body, basePayload: input.basePayload, payload: prepared.payload, listId: input.binding.listId });
  for (const value of [prepared.body, prepared.snapshot, prepared.payload]) assertListOperationPayload({ ...input.binding, kind: "photos.mutate", body: value });
  return { ...prepared, itemId: placement.itemId };
}
export function createPersonalPhotoItemCopyPlacementSession(options = {}) {
  return createPersonalPhotoCopySetSession({ ...options, enabled: options.enabled ?? PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED,
    prepareCopy: preparePersonalPhotoItemCopyPlacement, sourcesForRequest: input => [{ entityType: "item", entityId: input.request?.sourceId }] });
}
