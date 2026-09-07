# Durable local photo action foundation (not connected to UI)

Release gate `PERSONAL_PHOTO_ACTIONS_ENABLED=false`. This additive module does
not enable upload, replace the personal DB-only outbox or close checklist 06.

`createPersonalPhotoActionStore` captures one exact `photos.mutate/attach`
operation plus its separately reserved stage UUID, target owner, insertion/read
manifest and desired local snapshot with full/thumbnail file bytes in **one**
IndexedDB transaction. It freezes JSON before asynchronous hashing and checks
actor/environment/list/scope/editor generation around asynchronous boundaries.

The dedicated database is separate from the evictable offline photo cache. Raw
ArrayBuffers plus MIME and SHA-256 metadata avoid dependence on native Blob
serialization, and reads reconstruct Blobs after verifying the bytes. Write
success waits for transaction completion with strict durability requested.
There is no delete, overwrite, expiry or automatic corruption repair method.
Repeated exact IDs compare the complete intent and bytes; mismatches fail closed.

On a failed capture the error retains the frozen snapshot and both original
Blobs for recovery. A context change after COMMIT may leave a durable action;
it does not grant permission to apply that action to the new editor. Read-only
recovery remains available while the capture gate is off. This protects against
ordinary transaction failure, not user/browser deletion of all site data or a
hardware failure beyond the browser's durability contract.

Evidence: 217 transport tests, 889 critical tests, source check. Native browser
storage suite: **15 passed, 1 skipped**, Chromium + Windows mobile WebKit, 30.6s.
New action-store tests pass on BOTH engines with exact selected file/thumbnail
bytes across reload, caller mutation, simultaneous tabs, reused UUID mismatch,
late transaction abort, context changes, byte corruption and gate-off recovery.
The one explicit skip is OLD cache native-Blob serialization on Windows WebKit;
it is not claimed as real iOS Safari coverage. Existing cache format is unchanged.

## Stage dispatch and historical recovery continuation

IndexedDB schema v2 additively adds `stage-dispatches`, leaving version-one
actions and exact bytes intact. A successful claim transaction gives only its
first caller dispatch authority. Reload, simultaneous tabs or loss of the
localStorage transport journal cannot issue a fresh POST for the same claim.
If the browser stops after the claim but before dispatch, unknown stays blocked;
there is no timeout takeover. Recovery/explicit no-effect cancellation of such
pre-dispatch claims remains open. Rollback must retain a v2-compatible reader:
the old v1-only database opener fails closed instead of silently rewriting data.

`personal-photo-staging.js` has its own false release gate. It loads and verifies
the durable action/file, checks current actor/context and server capability,
persists the claim and transport intent, and uploads exactly the frozen stage UUID.
Every uncertain continuation reads that UUID, never probes by photo hash alone.
Stage receipts bind actor/environment/list/entity/photo/input hashes; historical
confirmation and current byte availability are separate. No owner snapshot or
photo URL is installed. The transport retains stage receipts before releasing
its barrier. A disabled writer can still inspect an already sent stage.

Updated evidence: 221 transport, 889 critical, source check; native storage suite
**19 passed, 1 skipped**, 35.0s. All new claim/concurrency/v1→v2 upgrade cases pass
on both engines; the same unrelated old native-Blob Windows WebKit skip remains.
Real multipart/API/MySQL **53/53**: paired frontend staging client recovers a lost
ACK by exact GET, keeps owner state unchanged, survives transport-journal loss
without a second POST and reads historical proof after list deletion. Its Node
test uses a claimed-record fixture; native IDB is verified separately, not claimed
as one combined mobile-to-MySQL test. No gates/publication/Production changes.

Next: matching owner-publication queue/UI adapters. Uploading a staged
file must not label its owner action confirmed. Source snapshots and pending
files must remain retained through rejection, account change and lost ACK.

## Owner-publication queue protocol

`personal-photo-publication-protocol.js` adds a separate false queue gate. The
virtual `/lists/:id/photos/mutate` adapter sends ONLY through the existing causal
list-operation gateway, with both server capabilities required. It validates the
exact attach/copy/delete/order manifest and sequential batch photo order before
dispatch; metadata-only recovery never starts another photo upload.

Committed responses must contain every indexed child outcome and the final photo
order on every owner, with exact new photo/asset bindings. A partial/mismatched
receipt does not release the write barrier. After confirmation the transport
still drops its large body; recovery restores only the caller's hash-bound body
for validation and uses GET. Historical inspection is not permission to apply a
snapshot after the server advances. Account/list/environment guards remain.

The generic DAG primitive accepts both `list.restore` and `photos.mutate`, so an
explicit cross-list read also delays subsequent source modification/deletion.
This does NOT yet connect the separate file journal to the real personal outbox
or UI. That bridge and startup orphan recovery remain the next prerequisite.

Local verification: 226 transport, 889 critical, source check; queue browsers
**26/26**, Chromium + mobile WebKit (46.9s), including cold lost ACK, direct/EU
route change, partial receipt, reload and stale historical response. Real paired
API/MySQL **59/59** checks actual batch attachment, order, deletion and tombstones
through the frontend queue. Native file persistence is still a separate suite.
No push/deploy/live migration, Production change or release-gate activation.

## Bridge into the existing personal outbox (not yet UI)

`PERSONAL_PHOTO_OUTBOX_ENABLED=false`. `preparePhoto` freezes an exact confirmed
base, full candidate, owner manifest and the SAME personal predecessor/generation
as ordinary DB saves. Photo-only changes cannot drop/smuggle another business edit.
It supports a single file attachment and metadata-only order/delete/same-list copy;
multi-file registration and cross-list UI read sets deliberately remain blocked.

After the file/action transaction commits, `capturePhoto` rechecks the editor and
observed outbox head, reads/verifies that exact stored action/bytes and publishes
one immutable v3 personal record referencing its intent hash. Snapshot differences
are still encoded once. A crash or quota BETWEEN the two stores leaves the original
file/action as an unlinked recovery draft, NEVER authority to dispatch. Startup
orphan inventory/explicit recovery and actual UI adapters are still required.
Old DB-only records are unchanged; the new reader also reads photos with gate off.

The dispatcher verifies the file binding, obtains the exact stage receipt and only
then dispatches the frozen owner action. While it is unresolved, later ordinary
saves cannot overtake it or send pending local photo URLs. Merely writing an
`applied` marker for a photo is forbidden: historical receipts and the current
server snapshot are adopted through the existing ONE-record baseline certificate.
Then the next DB save continues from that exact baseline. Rejected photo actions
are not automatically rebased/reissued; explicit photo-conflict recovery is open.

Local evidence: 232 transport, 889 critical and source check; native storage
**25 passed, 1 skipped** (31.2s), including real IDB → personal outbox → reload,
quota between stores and another tab's DB change. The skip remains only the old
native-Blob Windows WebKit cache test. Real paired API/MySQL **60/60** verifies
DB edit → stage → photo publication → atomic current-state adoption → next DB edit,
lost ACK, reload, exactly one upload and one photo row. Its byte-record fixture
is explicit; this is not yet a combined real mobile UI-to-MySQL test.

## Read-only recovery inventory

`inspectPersonalPhotoRecovery` compares a stable IDB inventory with the exact
personal outbox binding/head and verifies pending action/file hashes. It labels
linked, unlinked, missing, corrupt and mismatched files separately. A compacted
UUID is `retired-needs-proof`, not an invented server confirmation. Every result
has `dispatchAllowed=false`: no automatic POST, re-registration, deletion or
snapshot installation. Account/generation or file/head changes abort the scan.

An actual integration defect was reproduced and fixed in the existing recovery
wrapper: detached method calls lost the outbox receiver used by `capturePhoto`.
The wrapper now preserves it; a regression test calls the real wrapper, not only
the bare outbox. Native IDB tests verify unlinked → linked → reload with exact
bytes; this helper is NOT yet wired into full app startup or a recovery dialog.

Evidence: 236 transport, 889 critical, source check; native storage **27 passed,
1 skipped** (38.9s). The full **161 passed/1 skipped** browser run belongs to
`e190dde`, before this inventory/wrapper continuation. The same old Windows WebKit
native-Blob cache skip remains. New modes/gates have not been activated.

## Explicit stage cancellation client (not an owner-action cancellation)

`PERSONAL_PHOTO_CANCELLATION_ENABLED=false`. The explicit `cancel(actionId)`
checks the original scoped stage GET, both server capabilities, immutable local
file hashes and current editor. Only exact `unknown` permits the narrow JSON
no-publication fence. It preserves the original stage UUID/claim/transport
identity; no photo bytes or fresh upload are sent. Lost cancellation ACK uses
the same GET; it never automatically retries the POST. An explicit subsequent
attempt may repeat only that same fence, not the original upload.

A committed uploader wins unchanged. A cancelled stage has no invented asset:
its exact proof stops ordinary `stage()` before owner publication and survives
reload. Stage/cancellation share one list lock across tabs. Neither outcome
settles or discards the owner action, installs a snapshot or deletes local files.
Startup/dialog wiring and explicit owner-action resolution remain open.

Evidence: 242 transport; 889 critical and source check from the same runtime
slice; native storage **29 passed, 1 skipped** (48.7s). The new actual-IDB case
retains bytes through claim → reload → cancellation ACK loss → reload → stage
refusal. Paired real API/MySQL **65/65** uses a valid PNG claimed-record fixture,
not native IDB; shutdown completed (`data-aa627443d0184f5fbc38da1a686ee184`).
No publication, live migration, Production change or gate activation.

## Startup fence and local recovery ZIP

The full app now checks the known current personal list before remote load/save,
and checks a remembered personal account on offline startup. The temporary top-
layer dialog prevents editing during the asynchronous scan. Any retained file,
missing file reference or unreadable journal stays blocked: rollback with all
photo writers disabled still reads the records, never chooses upload/cleanup.
This is a conservative startup fence, NOT finished resume/cancel UI. Discovering
photo journals belonging to other/no-longer-selected lists remains open.

The recovery dialog can download the personal queue plus available original and
thumbnail bytes for the current list. One read-only IDB transaction copies raw
records and dispatch claims, including damaged intent/hash fields, without
decoding them into executable actions. The archive retains explicit missing/
unverified-file information; it is not the ordinary backup format and has no
automatic importer. It does not certify server acceptance or authorize deletion.
Account/editor/queue/file-set guards cover asynchronous export. Archive assembly
is bounded at 1000 records/256 MiB; larger recovery sets need a future paged export,
not a truncated archive. Neither tokens nor unrelated storage keys are included.

Local evidence: 246 transport, 889 critical, source check. A single combined
browser run: **41 passed, 1 skipped**, 1.6 minutes. Includes real built-app startup,
online unlinked draft and offline damaged record, actual download/read-back of
original/thumbnail bytes and dispatch ID, no POST/deletion, plus the native IDB
suite. The sole old native-Blob Windows WebKit cache skip is unchanged. This is
Windows Chromium/mobile WebKit, not real-device Safari or full UI acceptance.
No new API changes, push, publication, live migration or gate activation.

## Owner settlement and explicit keep-current decision (UI wiring still open)

`cancelPhotoUpload` first checks the frozen owner action. A committed owner is
never called cancelled. Otherwise explicit stage cancellation can be followed by
`settleCancelledPhotoStage`: the queue itself re-reads the exact permanent stage
fence, original owner UUID/body, account, capabilities and file hashes. Only then
may that original single attach obtain its no-effect rejection. There is at most
one POST per explicit invocation, no automatic retry, replacement UUID or upload.
Waiting/unknown outcomes remain unresolved; a contradictory committed owner is
not accepted as a rejection. No outbox-applied marker or file deletion occurs.

Once all exact original receipts are terminal, `resolveRejectedPhoto` may ask to
keep the currently read server version. Consent registers a NEW CAS action with
that exact baseline and an explicit local decision certificate. The photo
manifest is not copied into it; neither file nor pending photo is reattached.
Cancel, unknown receipts, changed account/editor, invalid owner and quota retain
the original draft. A competing server change rejects the decision; another
keep-current choice must refer to the newly read revision. A previously committed
decision does not make later ordinary edits re-cancel that old photo.

Unit/source evidence: 256 transport, 889 critical, source check. Real paired
API/MySQL **66/66** covers stage and owner ACK loss, reload, original delayed
delivery, a competing edit while the question is open, two distinct explicit
CAS decisions and atomic current-state adoption without one photo upload. The
first extended test exposed a test assertion that assumed absent `photos` was
an empty array; it now checks preservation of the original absent field instead.
Final diagnostics `data-eee89f50cafb4c19ae52b487e3f85ebc`; server shut down.
The explicit cancel/keep-current buttons are NOT yet connected to the blocking
startup dialog. Its read-only export continues to work. No gates were activated.

Combined queue/native-storage browsers after this continuation: **61 passed,
1 skipped**, 1.3 minutes. A new native-IDB scenario reloads the explicit new CAS
decision with its writer disabled while retaining the original photo action,
full bytes and thumbnail. The skip is only the same old Windows WebKit Blob cache.

## Retaining exact photo outcomes through journal compaction

The atomic current-state checkpoint now retains compact `photoReceipts`, not
only retired UUIDs. Baseline refresh, ordinary DB saves and compaction carry
them forward. Related late certificates merge identical proofs; contradictory
proofs, foreign bindings, unrelated IDs, impossible revisions and malformed
terminal status stop recovery without erasing the journal. A quota failure
cannot publish only half of the baseline/receipt certificate. Old checkpoints
without this optional field still read, but their UUIDs do not imply receipts.

`photoRecoveryReferences()` exposes these exact cached outcomes for the upcoming
startup resolution adapter. The inventory/startup dialog does NOT yet use them
to release its conservative photo fence. Original IDB files remain retained;
physical deletion/GC is not implemented. Rollback should keep this reader/writer
pair so old compaction does not drop the new optional proof cache.

The queue also has an explicit `readOnly` mode: historical GET inspection works
with every writer gate disabled, while normal dispatch and both no-effect
settlement methods are unavailable. This does not enable any release gate.

Evidence: 260 transport, 889 critical, source check; queue/native-IDB browsers
**63 passed, 1 skipped** (1.2 minutes); paired API/MySQL **66/66**. Actual original
owner proof survives compaction in the paired test; native file bytes and proof
survive reload after a later ordinary DB save in both browser engines. The sole
skip remains the old Windows WebKit native-Blob cache. Final API diagnostics
`data-cabed31327314c41a1f32deaf8d842f6`; disposable server shut down. No push,
publication, live migration, Production change, byte deletion or gate activation.

## Startup recognition of already settled retained files

The inventory now validates a cached terminal OWNER receipt against the original
file action's actor/environment/list/kind/UUID and recomputed canonical request
digest. Only this full binding becomes `settled-retained`; photo equality or a
retired UUID without its proof does not qualify. An absent old proof, changed
action/digest, corrupt bytes or missing link stays unresolved. Every entry still
has `dispatchAllowed=false`; files are retained and no old snapshot is installed.

The app's startup fence permits these already-settled records in both online and
remembered-offline sessions. The receipt was durably received earlier, so this
check adds no network request. Pending/unlinked/damaged records still open the
blocking recovery dialog and remain exportable. Explicit cancel/keep-current
buttons and the actual file-upload UI adapter are still open work.

Evidence: 261 transport, 889 critical, source check; real built-app UI **8/8**
(1.0 minute), Chromium/mobile WebKit: both blocked drafts and already-settled
retained bytes, online and offline. Paired real API/MySQL **66/66** verifies the
actual cached rejection digest after compaction (`data-8b2e341083a84db1a07a4ca61706b027`,
server shut down). No publication/Production/live migration or gate activation.
