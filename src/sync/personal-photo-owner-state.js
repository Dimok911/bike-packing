import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const fail = () => { throw Object.assign(new Error("Версии карточки и фотографий не подтверждены. Изменения сохранены, отправка не начата."),
  { code: "photo-owner-state" }); };

// Verify a read against the frozen base; never adopt a newer server selection or
// substitute a list/owner revision for a photo's publication revision.
export async function readPersonalPhotoOwnerState({ binding, entityType, entityId, basePayload, baseStateRevision },
  { getContext, readOwner } = {}) {
  if (binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || binding.scopeKey !== `id:${binding.actorId}` || !id(binding.listId) || !id(entityId)
    || !["item", "container"].includes(entityType) || !revision(baseStateRevision) || typeof readOwner !== "function") fail();
  binding = clone(binding);
  const initial = clone(getContext?.()), collection = entityType === "item" ? "items" : "containers";
  const assertCurrent = () => {
    if (!initial?.generation || initial.scope !== "personal" || Object.keys(binding).some(key => initial[key] !== binding[key])
      || !same(initial, getContext?.())) fail();
  };
  assertCurrent();
  const source = basePayload?.[collection]?.[entityId];
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body: { owner: source } });
  if (!source || source.id !== entityId || !Array.isArray(source.photos) || !source.photos.length) fail();
  const owner = clone(source);
  const response = await readOwner(`/bike-packing/lists/${encodeURIComponent(binding.listId)}/photo-owner-state?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`);
  assertCurrent();
  if (response?.ok !== true || response.version !== 1 || response.readOnly !== true
    || ["environment", "actorId", "listId"].some(key => response[key] !== binding[key])
    || response.stateRevision !== baseStateRevision || response.owner?.entityType !== entityType || response.owner.entityId !== entityId
    || !revision(response.owner.entityRevision) || response.owner.entityRevision > baseStateRevision || !same(response.owner.payload, owner)
    || !Array.isArray(response.photos) || response.photos.length !== owner.photos.length
    || new Set(response.photos.map(photo => photo?.photoId)).size !== response.photos.length) fail();
  for (const [index, photo] of response.photos.entries()) {
    const expected = owner.photos[index];
    if (!id(photo?.photoId) || !uuid(photo.assetId) || expected.id !== photo.photoId || expected.photoId !== photo.photoId
      || expected.assetId !== photo.assetId || expected.status !== "synced" || expected.listId !== binding.listId
      || !revision(photo.photoRevision) || photo.photoRevision > response.owner.entityRevision) fail();
  }
  return { baseEntityRevision: response.owner.entityRevision, photoRevisions: clone(response.photos) };
}
