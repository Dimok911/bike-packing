import { createPersonalPendingImportFormSession } from "./personal-pending-import-form.js";
import { PERSONAL_PENDING_FORM_UPDATE_ENABLED, personalPendingFormUpdateSource } from "./personal-pending-form-update.js";

export function createPersonalPendingFormSession({ enabled = PERSONAL_PENDING_FORM_UPDATE_ENABLED, ...options }) {
  return createPersonalPendingImportFormSession({ ...options, enabled, findSource: personalPendingFormUpdateSource,
    readPayload: record => record.photoState?.payload || record.action.body.payload, recoveryPhase: "pending-photo-form-fields" });
}
