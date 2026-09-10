import { personalLegacyServerImportSource } from "./personal-legacy-server-import-source.js";
import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { assertPersonalShareLinkDescriptor } from "./personal-share-link.js";
import { personalArchiveHash } from "./personal-archive-import-protocol.js";

export const PERSONAL_SERVER_IMPORT_ENABLED = false;
export const PERSONAL_SERVER_IMPORT_CAPABILITY = "personalCausalServerImportV1";
const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Object.assign(Error("Не подтверждена выбранная версия списка по ссылке."), { code: "server-import-source" }); };
const linkPattern = /^shared-entity-(link|snapshot)-([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/;

// This is an explicit read precondition, not an authorization token. The
// importer must recheck the link and all actual source aggregates under locks.
export function personalServerImportSource(value) {
  if (value?.kind === "legacy-link") return personalLegacyServerImportSource(value);
  assertListOperationJsonValue(value);
  const match = typeof value?.listId === "string" && value.listId.match(linkPattern);
  const keys = ["kind", "listId", "mode", "stateRevision", "selectionHash"];
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key)) || value.kind !== "shared-link" || !match
    || value.mode !== (match[1] === "link" ? "live" : "snapshot")
    || !Number.isSafeInteger(value.stateRevision) || value.stateRevision < 1
    || typeof value.selectionHash !== "string" || !/^[a-f0-9]{64}$/.test(value.selectionHash)) fail();
  return clone(value);
}

// The caller obtains the descriptor and effective source revision from the
// same locked read as the payload. Snapshot revision belongs to the snapshot;
// live revision belongs to the private source, never the static link row.
export async function preparePersonalServerImportSource({ descriptor, stateRevision }) {
  assertListOperationJsonValue({ descriptor, stateRevision });
  const frozen = clone(descriptor), match = typeof frozen?.id === "string" && frozen.id.match(linkPattern);
  if (!match) fail();
  assertPersonalShareLinkDescriptor(frozen, match[2]);
  const source = { kind: "shared-link", listId: frozen.id, mode: frozen.mode, stateRevision,
    selectionHash: await personalArchiveHash(frozen) };
  return personalServerImportSource(source);
}
