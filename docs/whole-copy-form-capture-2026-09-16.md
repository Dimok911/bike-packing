# Whole-copy form capture and first target application

Card 3.3 remains unfinished and unpublished. All whole-copy gates remain OFF.
This step builds on `05a59cd5`; it does not replace the server or transport.

## Implemented

- Synchronous `allocateAdminTemplatePhotoWholeCopySelection` validates the complete
  confirmed private source and allocates every operation, target, owner, photo
  and asset ID once. Detached/unplaced owners and owners without photos remain
  included. The async form helper derives the existing typed record without
  further allocation or changes to live state.
- `prepareAndCaptureAdminTemplatePhotoWholeCopyForm` freezes the form input,
  coalesces rapid clicks and keeps the selection after a write failure. It uses
  the hydrated canonical source; it does not fetch a different version midway.
- `captureAdminTemplatePhotoWholeCopyForm` holds the genuine two-binding lease,
  proves source and absent target, then persists typed record, V10 plan and
  unsent journal. A separate capture inventory permits only these exact own
  pointers to appear; dispatch still requires all durable evidence. No HTTP
  request or target placeholder is created by capture.
- Actor-level discovery and `resumeAdminTemplatePhotoWholeCopyCapture` recover a
  record-only interruption without a form WeakMap, plan, journal or target
  editor. Resume uses the explicit original operation ID and cannot recapture
  a dispatched journal. A new UI must offer this recovery before new allocation.
- `applyAdminTemplatePhotoWholeCopyResult` verifies the full receipt and stages,
  genuine lease, source and absent target. It derives the selected local IDs,
  rereads the current mirror, persists only the new namespace, checks readback,
  then merges it into current live collections. Source references, unrelated
  edits, active selection and settings are preserved. An exact mirror-only
  interrupted apply may be retried while the live target is still absent.
- The application apply adapter requires matching durable plan/record/journal
  and settled transport writes. It cannot treat a detached plausible receipt
  as permission to apply a different result.

## Validation

Selection: 6 cases. Capture/application: 10 cases, including real extracted
application functions, rapid clicks, IDB/plan/journal quota, original-ID cold
capture, changed source/choice/foreign history and capture → dispatch → first
target application with quota retry. Pure apply: 6 cases covering preservation,
receipt/lease/context/namespace failures and mirror readback retry.

Existing retained runner + namespace checks also passed 16/16 after the capture
inventory refactor. Source check and diff check passed. Logs are in
`node_modules/.cache/whole-copy-form-final.txt`, `whole-copy-capture-regression.txt`
and `whole-copy-form-source.txt`.

These checks model IndexedDB and HTTP; they are not native-browser, phone or
live API acceptance. No Actions, push or publication occurred.

## Exact next boundary

1. Durable acceptance of the newly applied target, including explicit original
   record/plan/journal proof. Only that acceptance may release source/target
   barriers for later edits; no deletion or generic exclusion shortcut.
2. Cold recovery when the target is already in the persisted/live mirror, and
   lost-ACK reconciliation before apply. The current first-apply helper rejects
   an already-present live target rather than silently adopting it.
3. Connect the existing visible copy form to these adapters plus explicit
   recovery selection. The original `createCausalAdminTemplateCopy` UI route
   remains unchanged until acceptance/recovery are complete. Internal adapter
   tests do NOT mean the user form is fully connected.
4. Integrate the paired whole-copy API foundation, then bounded native browser
   and real-file verification before enabling and publishing Experiment.

Do not rerun the complete protocol suite merely to advance this card. Preserve
the remaining old migration cards and B2/C/D; B1/v1626 is already accepted.
