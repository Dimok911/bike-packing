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
