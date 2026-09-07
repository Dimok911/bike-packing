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

Next: durable stage-dispatch claim, authenticated receipt validation, transport
recovery and matching owner-publication queue/UI adapters. Uploading a staged
file must not label its owner action confirmed. Source snapshots and pending
files must remain retained through rejection, account change and lost ACK.
