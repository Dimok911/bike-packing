import { createPersonalPendingImportFormSession } from "./personal-pending-import-form.js";
import { PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED, personalPendingArchiveUpdateSource } from "./personal-pending-archive-update.js";

export function createPersonalPendingArchiveFormSession({ enabled = PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED, ...options }) {
  return createPersonalPendingImportFormSession({ ...options, enabled, findSource: personalPendingArchiveUpdateSource, recoveryPhase: "pending-archive-fields" });
}
