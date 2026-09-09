import { createPersonalPendingImportUpdate } from "./personal-pending-import-update.js";
import { assertPersonalPublicImportRecord } from "./personal-public-import-outbox-record.js";
import { personalPublicImportManifest } from "./personal-public-import-protocol.js";
import { personalGuestBusinessPayload } from "./personal-guest-import-plan.js";

export const PERSONAL_PENDING_PUBLIC_UPDATE_ENABLED = false;
export const PERSONAL_PENDING_PUBLIC_UPDATE_CAPABILITY = "personalCausalPublicDescendantsV1";
const imported = createPersonalPendingImportUpdate({ assertRecord: assertPersonalPublicImportRecord,
  readManifest: personalPublicImportManifest, manifestKey: "publicImport", referenceVersion: 7, projectPayload: personalGuestBusinessPayload });
export const personalPublicPhotoResultReference = imported.resultReference;
export const personalPublicPhotoBodyResultReference = imported.bodyResultReference;
export const isPersonalPendingPublicUpdate = imported.isUpdate;
export const personalPendingPublicUpdateSource = imported.sourceFor;
