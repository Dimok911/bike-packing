import { recoverPersonalRemoteImportPreparation, choosePersonalPublicPreparation } from "./personal-public-import-preparation-recovery.js";
import { PERSONAL_SERVER_IMPORT_ENABLED } from "./personal-server-import-source.js";
import { recoverPersonalServerImportLink } from "./personal-server-import-link-recovery.js";
import { preparePersonalServerImport } from "./personal-server-import.js";
export { personalPublicPendingPreparations as personalServerPendingPreparations } from "./personal-public-import-preparation-recovery.js";

const adapter = Object.freeze({ manifestKey: "serverImport", recoverLink: recoverPersonalServerImportLink, prepare: preparePersonalServerImport });
export function recoverPersonalServerImportPreparation({ enabled = PERSONAL_SERVER_IMPORT_ENABLED, ...options }) {
  return recoverPersonalRemoteImportPreparation({ ...options, enabled, publicEntityEnabled: enabled }, adapter);
}
export function choosePersonalServerPreparation({ enabled = PERSONAL_SERVER_IMPORT_ENABLED, ...options }) {
  return choosePersonalPublicPreparation({ ...options, enabled });
}
