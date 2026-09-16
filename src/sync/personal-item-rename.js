export const PERSONAL_ITEM_RENAME_ENABLED = false;
export const PERSONAL_ITEM_RENAME_CAPABILITY = "personalItemRenameV1";
const fields = new Set(["version", "itemId", "expectedName", "name", "baseStateRevision", "causal",
  "clientDeviceId", "clientDeviceName", "clientUpdatedAt", "changeGroupId", "affectedLayoutIds", "changeScope", "itemMeta"]);
export const validPersonalRenameMeta = meta => Boolean(meta && Object.getPrototypeOf(meta) === Object.prototype
  && Object.keys(meta).length === 3 && ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"].every(key =>
    typeof meta[key] === "string" && meta[key].length <= 255)
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(meta.updatedAt)
  && Number.isFinite(Date.parse(meta.updatedAt)));
export function validPersonalItemRename(body) {
  try { if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 4096) return false; } catch { return false; }
  return Boolean(body && Object.getPrototypeOf(body) === Object.prototype && body.version === 1
    && Object.keys(body).every(key => fields.has(key)) && typeof body.itemId === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(body.itemId) && !["__proto__", "prototype", "constructor"].includes(body.itemId)
    && typeof body.expectedName === "string" && body.expectedName.length <= 255
    && typeof body.name === "string" && body.name.length > 0 && body.name.length <= 255 && body.name.trim() === body.name
    && Number.isSafeInteger(body.baseStateRevision) && body.baseStateRevision > 0
    && (!Object.hasOwn(body, "itemMeta") || validPersonalRenameMeta(body.itemMeta)));
}
export function personalItemRenameRequest({ listId, operationId, itemId, expectedName, name, baseStateRevision, causal, itemMeta }) {
  const body = { version: 1, itemId, expectedName, name, baseStateRevision, ...(causal ? { causal } : {}), ...(itemMeta ? { itemMeta } : {}) };
  if (typeof listId !== "string" || !listId || listId.trim() !== listId || listId.length > 191 || !validPersonalItemRename(body)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId || "")) throw Error("Invalid compact item rename");
  return { path: `/bike-packing/lists/${encodeURIComponent(listId)}/items/rename`, method: "POST", operationId, body: JSON.stringify(body) };
}
export function validPersonalItemRenameResult(result, expected) {
  const proof = result?.payload?.rename, body = expected.body;
  return validPersonalItemRename(body) && proof?.version === 1 && proof.itemId === body.itemId
    && proof.previousName === body.expectedName && proof.name === body.name
    && (body.itemMeta ? validPersonalRenameMeta(proof.itemMeta) && Object.keys(body.itemMeta).every(key => proof.itemMeta[key] === body.itemMeta[key]) : proof.itemMeta === undefined)
    && Number.isSafeInteger(result.payload.stateRevision) && result.payload.stateRevision > body.baseStateRevision
    && result.payload.upserted?.length === 1 && result.payload.upserted[0] === body.itemId
    && !result.payload.conflicts?.length && !result.payload.skipped?.length && !result.payload.deleted?.length;
}
