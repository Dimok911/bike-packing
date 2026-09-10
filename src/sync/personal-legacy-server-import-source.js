import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalArchiveHash } from "./personal-archive-import-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && value.length > 0 && value.length <= 191 && value === value.trim()
  && !/[\\/\x00-\x1f]/.test(value) && ![".", "..", "__proto__", "prototype", "constructor"].includes(value);
const fail = () => { throw Object.assign(Error("Не подтверждён исходный список старой ссылки."), { code: "server-import-source" }); };
const pattern = /^shared-(entity-link|entity-snapshot|snapshot)-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function personalLegacyServerImportSource(value) {
  assertListOperationJsonValue(value);
  const match = typeof value?.listId === "string" && value.listId.match(pattern);
  if (!exact(value, ["kind", "listId", "mode", "stateRevision", "selectionHash"]) || value.kind !== "legacy-link" || !match
    || value.mode !== (match[1] === "entity-link" ? "live" : "snapshot")
    || !Number.isSafeInteger(value.stateRevision) || value.stateRevision < 1
    || typeof value.selectionHash !== "string" || !/^[a-f0-9]{64}$/.test(value.selectionHash)) fail();
  return clone(value);
}

// Explicit compatibility for the three historical link formats. The hash
// identifies the stored disclosure selection, never an authority to read a
// private list. The server discovers and locks the actual source itself.
export async function preparePersonalLegacyServerImportSource({ listId, descriptor, stateRevision }) {
  assertListOperationJsonValue({ listId, descriptor, stateRevision });
  const frozen = clone({ listId, descriptor, stateRevision });
  const match = typeof listId === "string" && listId.match(pattern); if (!match) fail();
  const mode = match[1] === "entity-link" ? "live" : "snapshot";
  if (mode === "live" ? !exact(descriptor, ["mode", "scope", "entityType", "entityId", "layoutId", "sourceListId"])
    || descriptor.mode !== "live" || !["entity", "layout"].includes(descriptor.scope)
    || !["item", "container"].includes(descriptor.entityType) || !id(descriptor.entityId)
    || !id(descriptor.sourceListId) || descriptor.sourceListId === listId
    || descriptor.layoutId !== "" && !id(descriptor.layoutId) || descriptor.scope === "layout" && !descriptor.layoutId
    : descriptor !== null) fail();
  return personalLegacyServerImportSource({ kind: "legacy-link", listId: frozen.listId, mode, stateRevision: frozen.stateRevision,
    selectionHash: await personalArchiveHash({ kind: "legacy-link", listId: frozen.listId, descriptor: frozen.descriptor }) });
}
