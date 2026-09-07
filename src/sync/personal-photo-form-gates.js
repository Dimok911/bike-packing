import { PERSONAL_SAVE_OUTBOX_ENABLED } from "./personal-save-outbox.js";
import { LIST_OPERATION_QUEUE_ENABLED } from "./list-operation-queue.js";
import { PERSONAL_PHOTO_ACTIONS_ENABLED, PERSONAL_PHOTO_BATCH_STORAGE_ENABLED } from "./personal-photo-action-store.js";
import { PERSONAL_PHOTO_OUTBOX_ENABLED, PERSONAL_PHOTO_BATCH_OUTBOX_ENABLED } from "./personal-photo-outbox-record.js";
import { PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED } from "./personal-photo-publication-protocol.js";
import { PERSONAL_PHOTO_STAGING_ENABLED, PERSONAL_PHOTO_BATCH_STAGING_ENABLED } from "./personal-photo-staging.js";
import { PERSONAL_PHOTO_FORM_ENABLED } from "./personal-photo-form-protocol.js";

// Independent approval for the ordinary form buttons, not implicit in enabling
// a storage reader, recovery tool or server capability.
export const PERSONAL_PHOTO_FORM_UI_ENABLED = false;
export function personalPhotoFormGatesEnabled() {
  return PERSONAL_PHOTO_FORM_UI_ENABLED && PERSONAL_SAVE_OUTBOX_ENABLED && LIST_OPERATION_QUEUE_ENABLED
    && PERSONAL_PHOTO_ACTIONS_ENABLED && PERSONAL_PHOTO_BATCH_STORAGE_ENABLED && PERSONAL_PHOTO_OUTBOX_ENABLED
    && PERSONAL_PHOTO_BATCH_OUTBOX_ENABLED && PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED
    && PERSONAL_PHOTO_STAGING_ENABLED && PERSONAL_PHOTO_BATCH_STAGING_ENABLED && PERSONAL_PHOTO_FORM_ENABLED;
}
