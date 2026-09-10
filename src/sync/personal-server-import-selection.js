import { preparePersonalRemoteLayoutSelection, preparePersonalRemoteEntitySelection } from "./personal-public-import-selection.js";
import { PERSONAL_SERVER_IMPORT_ENABLED, personalServerImportSource } from "./personal-server-import-source.js";

// Share only the deterministic allocator. Source grammar and enabling remain
// specific to serverImport; no public-template identity is manufactured.
export function preparePersonalServerImportSelection(input, { enabled = PERSONAL_SERVER_IMPORT_ENABLED, createUuid = () => crypto.randomUUID() } = {}) {
  return preparePersonalRemoteLayoutSelection(input, { enabled, createUuid, parseSource: personalServerImportSource });
}

export function preparePersonalServerEntitySelection(input, { enabled = PERSONAL_SERVER_IMPORT_ENABLED, createUuid = () => crypto.randomUUID() } = {}) {
  return preparePersonalRemoteEntitySelection(input, { enabled, createUuid, parseSource: personalServerImportSource });
}
