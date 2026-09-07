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
