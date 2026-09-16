# Whole-copy acceptance, cold recovery and existing form route

Card 3.3 remains in progress. Whole-copy feature gates remain OFF. Nothing was
pushed or published; no GitHub Actions were used.

## Implemented

- Durable acceptance is bound to the exact saved V10 plan, typed record,
  journal, parent receipt, stage receipts and derived target projection.
  Every read re-proves these facts. A flag or plausible receipt alone cannot
  release an unfinished copy. Later source/target edits do not invalidate
  historical acceptance.
- First application persists and reads back the target mirror, then acceptance,
  before changing live collections. Quota failure preserves original evidence
  and supports retry with the same operation ID.
- Cold recovery handles a target already in the mirror, an accepted target
  edited later, record-only capture and a lost response. GET-only reconciliation
  works with write gates OFF. Accepted targets are never reinstalled over later
  edits. Recovery never allocates replacement operation/target IDs.
- Subsequent ordinary saves can pass both application inventory and registry
  barriers only after full acceptance proof, with a numeric confirmed base.
  Revoked acceptance, stale bases and operation-based continuation still block.
- The existing copy form routes photo-bearing canonical sources to the whole
  adapter only behind the existing gates. Retained choices are resumed before
  allocation; the new target is activated only after acceptance. The existing
  recovery dialog uses explicit whole-copy permissions.

## Focused verification

- Acceptance and pure apply: 14/14.
- Accepted successor plus existing save/V10 plan regressions: 35/35.
- Existing capture preflight: 7/7.
- Final actual application acceptance/recovery/form/successor and capture: 14/14.
- Application recovery plus dialog permission batch: 11/11 (overlaps the final
  application batch; these counts are not additive coverage).
- Source check and git diff check passed.

Tests use modeled IndexedDB, mock HTTP and extracted actual application
functions. The entry-routing case is a routing-only test. These results are
not native-browser, phone or live-server acceptance. Logs remain under
node_modules/.cache, including whole-copy-accepted-capture.txt and
whole-copy-acceptance-app-final.txt.

## Remaining boundary

1. Wire the existing strong cancellation foundation to application recovery;
   the current whole-copy dialog deliberately has canStop=false.
2. Integrate the paired whole-copy API foundation with its prerequisite commits.
   The currently published API does not yet include it.
3. Verify a fresh copy from the real visible form with real photo files in a
   native browser, plus interruption/recovery and a later ordinary edit.
4. Enable and publish Experiment only after these checks, then phone acceptance.

Keep card 3.3 in progress before 3.4. Preserve B2/C/D and remaining migration
cards; B1/v1626 was already accepted.
