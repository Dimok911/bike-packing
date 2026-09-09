import { createPersonalPendingImportUpdate } from "./personal-pending-import-update.js";
import { assertPersonalGuestImportRecord } from "./personal-guest-import-outbox-record.js";
import { personalGuestImportManifest } from "./personal-guest-import-protocol.js";
import { personalGuestBusinessPayload } from "./personal-guest-import-plan.js";

export const PERSONAL_PENDING_GUEST_UPDATE_ENABLED = false;
export const PERSONAL_PENDING_GUEST_UPDATE_CAPABILITY = "personalCausalGuestDescendantsV1";
const guest = createPersonalPendingImportUpdate({ assertRecord: assertPersonalGuestImportRecord,
  readManifest: personalGuestImportManifest, manifestKey: "guestImport", referenceVersion: 4, projectPayload: personalGuestBusinessPayload });
export const personalGuestPhotoResultReference = guest.resultReference;
export const personalGuestPhotoBodyResultReference = guest.bodyResultReference;
export const isPersonalPendingGuestUpdate = guest.isUpdate;
export const personalPendingGuestUpdateSource = guest.sourceFor;
