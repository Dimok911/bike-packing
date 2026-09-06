# Experiment operation recovery — design only, NO DEPLOY / NO EU ACTIVATION

This is a proposal for coordination approval, not implemented backend behavior.
No database/schema/proxy/Production change is authorized by this document.

Update 2026-09-06: this original proposal is retained as design history.
Only owner/private **photo upload** has since been implemented behind disabled
gates; copy/delete and the proposed general operations route below are NOT
implemented. Exact tested commits are in `production-release-batches.md` and
the backend's `docs/photo-upload-operation-recovery.md`. The newer backend
`docs/operation-effects-inventory.md` records remaining handlers and side-effect
GET/Auth boundaries. The general direct-write blocker and NO DEPLOY still apply.

## Immediate release blocker: direct mode is affected too

The v1605 preparation candidate intentionally journals **all Experiment writes**,
including direct mode and the fixed RU shared-session bootstrap. The EU source
gate disables EU network activation; it does **not** disable direct journaling.

- With Web Locks + usable localStorage: normal acknowledged direct writes work.
- Without either: writes and bootstrap fail before dispatch; existing read-only
  session checks/downloads and local data are not deleted.
- A lost direct write response persists a barrier across reload/account/transport
  changes; subsequent direct autosave and bootstrap also stop.
- There is no safely implemented recovery for that barrier. Therefore shipping
  the current candidate could indefinitely stop a current user's direct sync.

**Do not deploy this candidate, even with EU disabled.** Keep v1604 live until
the recovery contract below is approved and tested, or separately scope a purely
read-only diagnostic release that does not wire new behavior into direct writes.
Do not remove the barrier to make the tests pass. The explicit direct-mode test
`release blocker: disabling EU does not disable direct journaling...` documents
this actual behavior, rather than claiming that a green CI means release-ready.

## Evidence from current backend

Inspected the Experiment backend checkout, without modifying it:

- `bike-packing-server.mjs` uses the shared router in `server.mjs`.
- `server.mjs` dispatches photo upload, copy, resolve, file/thumb and delete.
- `src/lib/bike-packing-photos-api.js` currently writes new randomly named files,
  then upserts `bike_packing_photos` by list/photo ID and removes previous files.
  A duplicate photo ID can overwrite an existing row; this is not transactional
  operation deduplication and does not prevent repeated file-side effects.
- `handleBikePackingPhotoResolve` searches active rows and hashes their files.
  It returns a matching photo, not a receipt for an individual upload.
- No operation-ID/idempotency status contract was found in the inspected `src`
  handlers. Existing history, photo ID, content hash and timestamp are not enough.

## Minimal first implementation boundary

Start with authenticated personal-list photo operations only:

| Proposed covered operation | Current route after `/letters-vniipo/api` |
| --- | --- |
| Upload/replace photo | `POST /bike-packing/lists/:listId/photos` |
| Copy a photo | `POST /bike-packing/lists/:listId/photos/copy` |
| Delete a photo | `DELETE /bike-packing/lists/:listId/photos/:photoId` |
| New read-only operation status | `GET /bike-packing/operations/:operationId` |

Explicitly NOT covered by that first slice: admin/demo/template photo wrappers,
list creation/deletion, entity/bulk/full-state sync, history-producing changes,
catalog moderation, shared-auth bootstrap, login/link consumption/logout and
external image import. These need their own side-effect/transaction audit. A
photo-only implementation is **not enough to enable the whole EU transport**.
For database-only list/entity writes, reuse the operation ledger inside their
existing transaction only after checking revisions/history side effects. Auth
crosses a service boundary and needs separate coordinator approval; no automatic
token-consuming retries or raw auth tokens in the ledger.

Likely backend touch points: `server.mjs` routing, a new
`src/lib/bike-packing-operations.js`, an additive SQL migration under
`docs/migrations/`, `src/lib/bike-packing-photos-api.js`, DB initialization in
`src/lib/bike-packing-db.js` / `personal-tags-db.js`, and integration tests under
`test/integration/`. Exact migration wiring is a prerequisite implementation audit.
Frontend changes also need a stable operation ID in the persisted logical photo
queue, not merely a new UUID every time an HTTP function is invoked.

## Proposed ledger and identity

New table `bike_packing_operations` (name provisional): unique
`(environment, actor_id, operation_id)`, plus method, canonical route, target
list/photo/entity IDs, payload digest, phase, generation/fencing token, minimal
terminal result + result revision, created/updated/finished timestamps and staged
file references. Environment and actor come from trusted server config/session,
never a client-supplied owner field. Keep auth tokens and image bytes out of it.

Bind one random operation ID to one persisted logical action. Identical bytes
sent for two different photo records get two operation IDs. A resumed action
keeps its ID even if the selected network route changes. The digest covers target,
file AND thumbnail bytes and relevant metadata; it detects a mismatched reused
ID, not uniqueness of all photos. Same ID + different digest/target => conflict
without executing. Same ID + committed result => return stored result without
another upsert/file write. Authorization is rechecked on read/replay; a former
collaborator must not obtain data after access revocation.

Proposed wire field: multipart `operationId`, JSON `operationId`, and a separately
reviewed DELETE header/body convention. No new CORS header is silently added;
coordinator approval is required if DELETE uses an idempotency header. Server
calculates/verifies the digest; it must not trust a client-only hash as proof.

## Crash-consistent files and terminal status

Claim and bind the ledger entry atomically before performing side effects.
Concurrent same-ID requests either observe the terminal receipt or pending;
they must not both become executors. A timeout alone never grants execution to
a replacement worker: use ownership/fencing and a crash-recovery protocol.

Stage validated file/thumb bytes in operation-specific immutable locations.
Publish durable immutable files before a DB transaction atomically binds the
photo row and committed receipt. A crash before DB commit can leave unreferenced
staging files; it must not expose a committed photo without its receipt. Cleanup
of old/unreferenced files is post-commit, journaled and retriable, with reference
checks; it must not delete a new committed file after an unrelated cleanup error.
Copy/delete require the same ledger discipline, not just upload.

Status read returns `pending`, `committed` (exact target/result/revision), or a
definitive terminal rejection proving no side effect. Unknown ID, expired result,
transient 404 and elapsed time are **not** permission for a fresh blind send.
For a definitively absent/rejected ID, a safe retry is still subject to the
server's atomic same-ID claim, including a late original arriving concurrently.

Keep dedupe tombstones for at least the maximum accepted operation age. An
arbitrary finite deletion period is unsafe with unbounded offline queues. First
rollout: no automatic tombstone pruning; establish size limits and an explicit
server-enforced operation-age/retention contract before adding cleanup. Large
response detail may be compacted, but the ID/digest/terminal identity must remain
or the server must reject old operations without executing them.

## Existing unknown intents

The frontend's current UUID was **not sent to the backend**. A new ledger cannot
retroactively attach it to an old commit. Do not clear old intents on upgrade or
assume that a matching photo/time proves success. Export/retain local state and
collect authorized server evidence about exact target/version/files and whether
an old request can still complete. If that cannot establish a terminal outcome,
leave the barrier and require a separately reviewed manual recovery plan. There
is no generally safe automated migration for these intents in the proposal.

## Rollout, rollback and compatibility

1. Approve operation scope, schema/file transaction design, auth ownership and
   retention. Keep Experiment v1604 and EU write/source gates unchanged.
2. Add ledger/status capability on isolated backend tests first. No production
   deployment until separate approval and full database/file fault tests pass.
3. Legacy requests without an operation ID retain explicitly documented legacy
   semantics initially; do not claim dedupe across old clients. Restrict the
   protected pilot to approved test accounts/clients, with proxy/client gates.
4. Persist client operation ID/intent before dispatch; persist terminal result
   into the local queue before releasing its barrier. Test direct first, then
   real EU/Safari auth/write status on disposable authorized data.
5. If rolling back, close pilot/EU writes first. Preserve ledger/tombstones and
   unknown client intents. Do not roll back to a writer that ignores pending
   protected operations, drop schema, or replay queues blindly. Retain compatible
   read/status/recovery service until outstanding operations are resolved.

## Required test matrix

| Fault/scenario | Required evidence |
| --- | --- |
| Same ID concurrently through direct/EU, tabs and devices | One ledger owner/business effect; both callers see same result/pending |
| Different lawful IDs with identical image bytes | Independent targets/actions, no false duplicate classification |
| Same ID changed target/file/thumb/metadata | Conflict before business side effects |
| Commit succeeds, response lost; client reload/offline reconnect | Read terminal receipt, bind exact queue item, no re-execution |
| Old matching hash; new operation pending/unknown | No false acknowledgement or barrier release |
| Process dies before/after staging, publish, DB commit and cleanup | Consistent photo/receipt; no duplicate execution or committed-file deletion |
| Timed-out worker resumes after recovery worker | Fencing prevents stale worker commit |
| Unknown/expired/404 status; old request arrives late | No unprotected new send; same-ID claim remains exclusive |
| Account switch/access revoked/foreign operation ID | No data leak, actor binding and authorization preserved |
| Direct unavailable locks/storage or lost bootstrap | No send on missing client durability; no release without usable recovery |
| Legacy client + protected client; rollback with pending operations | Explicitly limited guarantee, no drop/replay of protected intent |
| Real Safari/iPhone and proxy redirect 502 | Valid credentials, no redirected/repeated mutation; status read works |

## Planning estimate and next decision

This is a multi-layer change, not a small hash check. Planning estimate for the
personal-photo slice: 4–6 engineering days, with substantial uncertainty until
the DB/file recovery design and deployment isolation are reviewed. This is not
a delivery promise. Full list/entity/admin/auth coverage is a separate estimate
after endpoint inventory; do not extrapolate the photo estimate to all sync.

Next decision: approve design work for the restricted backend photo ledger first,
or choose a separate diagnostics-only frontend release with existing direct
behavior untouched. Neither choice authorizes deploying this candidate now.
No exactly-once claim is made.
