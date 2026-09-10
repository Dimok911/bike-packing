import { assertServerPreparationNativeSettlement } from "./personal-server-preparation-resolution-protocol.js";
import { createPersonalRemoteImportSelectionStore } from "./personal-public-import-selection-store.js";
import { PERSONAL_SERVER_IMPORT_ENABLED, personalServerImportSource } from "./personal-server-import-source.js";
import { assertPersonalServerImportBody, assertPersonalServerImportHashes } from "./personal-server-import-protocol.js";

const adapter = Object.freeze({ prefix: "bike-packing-server-selections-v1", code: "server-selection-storage", manifestKey: "serverImport",
  parseSource: personalServerImportSource, assertBody: assertPersonalServerImportBody, assertHashes: assertPersonalServerImportHashes,
  assertNativeSettlement: assertServerPreparationNativeSettlement });

// Separate immutable namespace; rollback readers and forensic export work OFF.
// Selection-only choices never authorize removing files or cancelling actions.
export function createPersonalServerImportSelectionStore({ enabled = PERSONAL_SERVER_IMPORT_ENABLED, ...options } = {}) {
  return createPersonalRemoteImportSelectionStore({ ...options, enabled, publicEntityEnabled: enabled,
    choiceEnabled: enabled, resolutionEnabled: enabled }, adapter);
}
