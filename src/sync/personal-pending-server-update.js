import { createPersonalPendingImportUpdate } from "./personal-pending-import-update.js";
import { assertPersonalServerImportRecord } from "./personal-server-import-outbox-record.js";
import { personalServerImportManifest } from "./personal-server-import-protocol.js";
import { personalGuestBusinessPayload } from "./personal-guest-import-plan.js";

const imported = createPersonalPendingImportUpdate({ assertRecord: assertPersonalServerImportRecord,
  readManifest: personalServerImportManifest, manifestKey: "serverImport", referenceVersion: 12, projectPayload: personalGuestBusinessPayload });
export const personalServerPhotoResultReference = imported.resultReference;
export const personalServerPhotoBodyResultReference = imported.bodyResultReference;
export const isPersonalPendingServerUpdate = imported.isUpdate;
export const personalPendingServerUpdateSource = imported.sourceFor;
