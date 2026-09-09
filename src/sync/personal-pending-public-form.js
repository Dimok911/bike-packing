import { createPersonalPendingImportFormSession } from "./personal-pending-import-form.js";
import { PERSONAL_PENDING_PUBLIC_UPDATE_ENABLED, personalPendingPublicUpdateSource } from "./personal-pending-public-update.js";

export function createPersonalPendingPublicFormSession({ enabled = PERSONAL_PENDING_PUBLIC_UPDATE_ENABLED, ...options }) {
  return createPersonalPendingImportFormSession({ ...options, enabled, findSource: personalPendingPublicUpdateSource, recoveryPhase: "pending-public-fields",
    disabledMessage: "Правки до подтверждения копии публичного шаблона ещё не включены. Поля остались в форме." });
}
