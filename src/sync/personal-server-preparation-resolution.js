import { PERSONAL_SERVER_IMPORT_ENABLED } from "./personal-server-import-source.js";
import { resolvePersonalRemotePreparation, personalPublicRecoverablePreparations } from "./personal-public-preparation-resolution.js";
import { assertServerPreparationReceipt, assertServerPreparationNativeSettlement } from "./personal-server-preparation-resolution-protocol.js";

export const personalServerRecoverablePreparations = personalPublicRecoverablePreparations;
export function resolvePersonalServerPreparation({ enabled = PERSONAL_SERVER_IMPORT_ENABLED, ...options }) {
  return resolvePersonalRemotePreparation({ ...options, enabled, publicEnabled: enabled, publicEntityEnabled: enabled },
    { manifestKey: "serverImport", assertReceipt: assertServerPreparationReceipt, assertNativeSettlement: assertServerPreparationNativeSettlement });
}
