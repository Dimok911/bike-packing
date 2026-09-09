import { createPersonalPendingImportFormSession } from "./personal-pending-import-form.js";
import { PERSONAL_PENDING_GUEST_UPDATE_ENABLED, personalPendingGuestUpdateSource } from "./personal-pending-guest-update.js";

export function createPersonalPendingGuestFormSession({ enabled = PERSONAL_PENDING_GUEST_UPDATE_ENABLED, ...options }) {
  return createPersonalPendingImportFormSession({ ...options, enabled, findSource: personalPendingGuestUpdateSource, recoveryPhase: "pending-guest-fields" });
}
