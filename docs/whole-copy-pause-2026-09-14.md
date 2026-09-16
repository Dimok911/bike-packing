# User-requested shutdown checkpoint — 2026-09-14

The user asked to pause so the computer can be shut down. No background task,
deployment or GitHub Actions run should continue. Trello card 3.3 remains **In
Work**: https://trello.com/c/PJU7jawl . Its description was read this turn, not
updated. The whole-copy operation is not ready for user acceptance or release.

## Saved work and evidence

FE branch `codex/admin-photo-tree-after-v1609`: new separate V3 whole-copy
protocol, full stage/parent receipt proof, durable typed record, IndexedDB store
with actor-scoped discovery before a target layout exists, and client with
one-shot staging/parent recovery. Default gate remains OFF. The new client
requires separate transport admission/fencing that is still unimplemented;
`experiment-transport.js` was not changed. No plan V10, application UI or target
acceptance integration was added.

Focused FE checks completed: protocol 17/17, receipts 14/14, record/store 21/21,
client 20/20. Existing projection has 14 prior checks; it is not a new completed
user operation. No new full transport suite/build/browser acceptance was run.
The protocol and receipt runtime modules were copied byte-for-byte to BE;
matching BE tests passed 31/31. The first BE mirror test run failed because an
old fixture had not yet been copied; after adding that fixture, all 31 passed.

Writable BE branch `codex/legacy-photo-compat`, sibling directory
`../legacy-photo-compat-api`: new stage/file/absence helpers and unfinished
three-phase parent implementation (prepare, create via existing writer, attach
at revision 1, reload and finish). Root added explicit V3 parser/store/API gate
and canonical effect branches immediately before pause. **Those latest branches
have not been functionally tested.** Stage HTTP routing/capability advertisement
is not connected. The root parent receives a clean intent without the journal's
extra `payloadDigest`; the stored full digest is separately checked.

Real disposable MySQL target checks: 9 scenarios + suite parent = 10/10 PASS,
log `../legacy-photo-compat-api/node_modules/whole-copy-target-mysql-1.txt`.
This predates the last helper hardenings (history, case aliases, global personal
photo/stage IDs and exact pending-parent digest). The local runner verified its
fresh database directory, and MySQL and its fixture APIs were shut down.

Latest stage/absence focused run: 71/72 PASS, one physical-file proof failed.
Two further stage tests were saved but not run. Twelve new parent tests were
saved; only the first diagnostic ran, and failed in stage setup before parent
preparation. They do not establish parent correctness. Evidence/details:
`../legacy-photo-compat-api/docs/admin-template-photo-whole-copy-staging-checkpoint.md`
and `../legacy-photo-compat-api/node_modules/.cache/whole-copy-parent-paused-diagnostic-1.json`.

## First tasks when resumed

1. Fix exact physical file identity in the existing
   `bike-packing-template-photo-copy-files.js`: distinct Windows inode values
   `15199648743381392n` and `15199648743381393n` both round to Number
   `15199648743381392`. Use consistent BigInt file stats and exact byte/time
   comparisons; do not relax file-isolation checks. The common helper remains
   unchanged. This is a demonstrated cause for the new fixture failure; it does
   not retrospectively prove the cause of every older intermittent failure.
2. Run focused common file/tree/whole regressions, then the saved parent tests.
   Check initial source SQL owners/layout/dictionaries and target dictionary
   postflight; never promote a failed fixture into an accepted parent proof.
3. Complete global allocation history checks for parent UUID and target UUID
   suffix (own pending parent only with exact digest). Consider grant UUIDs in
   invitation/revocation tables within the declared namespace policy. Rerun the
   extended real-MySQL absence checks after these changes.
4. Validate the new canonical/store branches, add stage routes and capability
   advertisement only under the separate OFF-by-default gate, and test real
   authenticated API/SQL/files creation, rollback, replay and cancellation.
5. Implement separate whole-copy transport admission and `fenceWholeCopyParent`,
   then V10 plan, source/target inventory admission, existing create form,
   target-only application and cold recovery/acceptance. Keep old V1–9 isolated.
6. Register the new suites in the appropriate commands after this development
   checkpoint is resolved. Update Trello with verified scope, then run the full
   relevant regression/real browser checks before marking 3.3 complete.

## Release boundary

No publication or push was performed. Experiment remains v1611 (`b9969d9b`);
Production is unchanged. Previous locally verified legacy-photo compatibility
fix remains in FE `ac5abf0f` / BE `f194ae77` and has not been published. Preserve
the isolated v1611 release tooling when selecting a later hotfix. No GitHub
Actions quota is available until the user's stated reset on the 19th.

The older whole-copy contract document describes the earlier pure-projection
checkpoint. Read this newer checkpoint before resuming. All four collaborators
stopped; no automatic continuation was scheduled.
