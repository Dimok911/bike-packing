import { recoverPersonalRemoteImportLink } from "./personal-public-import-link-recovery.js";
import { PERSONAL_SERVER_IMPORT_ENABLED } from "./personal-server-import-source.js";
import { assertPersonalServerImportBody, assertPersonalServerImportHashes } from "./personal-server-import-protocol.js";

const adapter = Object.freeze({ manifestKey: "serverImport", assertBody: assertPersonalServerImportBody, assertHashes: assertPersonalServerImportHashes });
export function recoverPersonalServerImportLink({ enabled = PERSONAL_SERVER_IMPORT_ENABLED, ...options }) {
  return recoverPersonalRemoteImportLink({ ...options, enabled, publicEntityEnabled: enabled }, adapter);
}
