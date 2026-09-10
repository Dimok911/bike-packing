import { preparePersonalRemoteImport } from "./personal-public-import.js";
import { PERSONAL_SERVER_IMPORT_ENABLED } from "./personal-server-import-source.js";
import { personalServerImportPlan } from "./personal-server-import-protocol.js";

const adapter = Object.freeze({ manifestKey: "serverImport", recoveryKey: "serverImportRecovery", code: "server-import",
  plan: personalServerImportPlan, captureFiles: "captureServer" });
export function preparePersonalServerImport({ enabled = PERSONAL_SERVER_IMPORT_ENABLED, ...options }) {
  return preparePersonalRemoteImport({ ...options, enabled, publicEntityEnabled: enabled }, adapter);
}
