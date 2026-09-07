import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const fail = () => { throw Object.assign(new Error("Исходная версия карточки не подтверждена. Поля и фото сохранены в форме; отправка не начата."),
  { code: "photo-form-base" }); };

// A list revision is NOT necessarily the last revision of this owner. Resolve
// it with a read-only, scoped entity response. Matching fields alone, dates,
// array position, a revision from a newer list, or an empty legacy default are
// not permission to silently rebase the already frozen form.
export async function readPersonalPhotoFormOwnerRevision({ binding, entityType, entityId, basePayload, baseStateRevision },
  { getContext, readEntities } = {}) {
  const initial = clone(getContext?.());
  const assertContext = () => {
    if (!initial?.generation || initial.scope !== "personal" || initial.scopeKey !== `id:${initial.actorId}`
      || Object.keys(binding).some(key => initial[key] !== binding[key]) || !same(initial, getContext?.())) fail();
  };
  if (binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || binding.scopeKey !== `id:${binding.actorId}` || !id(binding.listId) || !id(entityId)
    || !["item", "container"].includes(entityType) || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1
    || typeof readEntities !== "function") fail();
  binding = clone(binding); assertContext();
  const collection = entityType === "item" ? "items" : "containers", expected = basePayload?.[collection]?.[entityId];
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body: { owner: expected } });
  if (!expected || expected.id !== entityId) fail();
  const owner = clone(expected);
  const response = await readEntities(`/bike-packing/lists/${encodeURIComponent(binding.listId)}/${collection}`);
  assertContext();
  if (response?.ok !== true || response.listId !== binding.listId || response.stateRevision !== baseStateRevision
    || !Array.isArray(response[collection])) fail();
  const rows = response[collection].filter(row => row?.id === entityId);
  if (rows.length !== 1) fail();
  const row = rows[0];
  if (row.listId !== binding.listId || row.ownerId !== binding.actorId || row.deleted !== false || row.deletedAt !== null
    || !Number.isSafeInteger(row.stateRevision) || row.stateRevision < 1 || row.stateRevision > baseStateRevision
    || !same(row.payload, owner)) fail();
  return row.stateRevision;
}
