import { createPersonalPendingImportUpdate } from "./personal-pending-import-update.js";
import { assertPersonalArchivePhotoRecord } from "./personal-archive-photo-outbox-record.js";
import { personalArchivePhotoManifest } from "./personal-archive-photo-protocol.js";
import { personalArchivePayloadWithPhotos } from "./personal-archive-photo-plan.js";

export const PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED = false;
export const PERSONAL_PENDING_ARCHIVE_UPDATE_CAPABILITY = "personalCausalArchiveDescendantsV1";
const archive = createPersonalPendingImportUpdate({ assertRecord: assertPersonalArchivePhotoRecord,
  readManifest: personalArchivePhotoManifest, manifestKey: "archiveImport", referenceVersion: 3, projectPayload: personalArchivePayloadWithPhotos });
export const personalArchivePhotoResultReference = archive.resultReference;
export const personalArchivePhotoBodyResultReference = archive.bodyResultReference;
export const isPersonalPendingArchiveUpdate = archive.isUpdate;
export const personalPendingArchiveUpdateSource = archive.sourceFor;
