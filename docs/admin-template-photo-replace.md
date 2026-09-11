# Administrative photo replacement — continuation after v1608

Status: local work, not published. The v1608 release remains a separate frozen
checkpoint. This continuation starts from FE `8a1095e2` and preserves its
canonical sign-in and manual Frankfurt routing. The original working copy and
six retained gallery/document/test files are untouched.

An existing private template item or bag can select new files, remove old
photos, reorder the survivors and additions, choose a new main photo, and edit
its ordinary fields in one Save. For example, `[old-a, old-b, old-c]` becomes
`[new-d, old-c]` with a changed item name. The server must confirm the new file,
the removal of both old photos, the exact order and the name as one action.

The original raw photo references remain in the immutable request. The v2
`photoAppend` envelope adds only the final ordered photo IDs; its staged assets
retain the existing v1 file descriptors and receipt proofs. The client derives
and validates the complete confirmed payload from retained raw references and
the server's authoritative new references. The editor's temporary Blob URLs
cannot become confirmed references.

The form saves the original binary handles and exact selection in durable
storage before staging or dispatch. A storage failure retains the same form
selection; a cancelled/reopened form cannot claim the previous selection.
After an uncertain response or reload, the journal resumes the original
operation and file identities. It does not silently replace the action with a
new mixed save. Unchanged old photos followed by new photos use ordinary v1
append; an edit containing only old photos uses the existing photo-edit path.

Replacement requires its additional frontend form/client gates and the server
capability `adminTemplatePhotoReplaceV1`. These defaults stay OFF and are not
added to the v1608 build profile. A mixed form remains local if the feature is
unavailable; ordinary append and fileless edit keep their existing paths.
New owners, public templates, copies, pending source changes and overwriting
file contents under an existing photo ID are outside this contract.

Backend continuation `4d1b70310a6b95a8b0b0449caefe3da04f28fca3` keeps canonical
Auth and uses the existing staging, append, operation-head and permanent
tombstone tables. New attachments and old-photo deletion commit in the same
transaction; no new table or endpoint is needed. A rollback between either
step leaves both unapplied. A lost acknowledgement reads the durable result.

Verified local continuation:

- 147 focused frontend protocol, client, controller, binary-record, staging
  and action-store checks passed without skips. Five added controller cases
  cover both owner types, exact order/main photo, retry after storage quota,
  cancelled selections, disabled gates and survivor/deletion tampering.
- Backend: 193 operation checks, 77 source/canonical checks, four fixture
  routing checks, and 41 canonical-auth MySQL cases passed. The latter includes
  eight replacement cases plus existing append/edit and actor checks.
- All 720 selected FE/BE source hashes stayed stable during the MySQL run.
  Afterward, only the backend protocol mirror's line endings were normalized
  to the identical frontend bytes. Later test registration/documentation does
  not change that tested runtime.

- 20 distinct browser cases passed: ten each in Chromium and mobile WebKit,
  without retries or skips. They exercise mixed replacement for both owner
  types, retaining/interleaving old photos with a new main photo, lost stage
  and save acknowledgements, cold recovery with unchanged IDs, cancellation,
  and the disabled replacement gate with ordinary append/edit still available.
  These use isolated test builds and the real application dialogs, IDB and
  queue, with a simulated browser API; the separate MySQL run covers the server.
- Four additional quota cases (two per engine) abort a real IDB action commit
  before dispatch, then retry the identical intent/files/IDs; and fail the
  editor mirror after the durable v2 plan, reload, restore the exact selection,
  fields and order, and complete unique stages plus one final save. Earlier
  cases and unit suites were not repeated; only browser tests changed.
- Final broader frontend checks passed: 912 critical, 1564 transport across
  five suites, and source syntax checks. No runtime changed after the paired
  MySQL run or during browser acceptance; the first browser assertion correction
  used a Russian-only fixture name to avoid the application's keyboard-layout
  correction of an English test suffix.

Evidence is retained in the original frontend's
`node_modules/.cache/causal-evidence/2026-09-08/continuation-after-v1608-*`
files and the backend continuation's private evidence directory. Browser logs
are `continuation-replacement-ui-4.txt` (one Chromium case), `-5.txt` (seven
Chromium cases), and `-6.txt` (eight WebKit cases); quota evidence is
`continuation-replacement-quota-ui-1.txt` and `continuation-replacement-quota-final.json`.
Broader check logs are
`continuation-final-{critical,transport,source}-1.txt`. The unit contracts are
registered in `test:transport`; the browser suite is included in both ordinary
CI projects. No physical iPhone/Safari, public activation or new full Linux CI
result is claimed for this unpublished continuation.
