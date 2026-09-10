import { createPersonalPendingImportFormSession } from "./personal-pending-import-form.js";
import { personalPendingServerUpdateSource } from "./personal-pending-server-update.js";
import { PERSONAL_SERVER_IMPORT_ENABLED } from "./personal-server-import-source.js";

export function createPersonalPendingServerFormSession({ enabled = PERSONAL_SERVER_IMPORT_ENABLED, ...options }) {
  return createPersonalPendingImportFormSession({ ...options, enabled, findSource: personalPendingServerUpdateSource, recoveryPhase: "pending-server-fields",
    disabledMessage: "Правки до подтверждения копии списка по ссылке ещё не включены. Поля остались в форме." });
}
