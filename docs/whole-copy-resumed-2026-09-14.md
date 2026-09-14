# Whole-copy development resumed — 2026-09-14

The user resumed work after the shutdown checkpoint. This document supersedes
the open technical items in `whole-copy-pause-2026-09-14.md`; that earlier file
remains a historical record. Trello 3.3, https://trello.com/c/PJU7jawl, remains
in progress. The new whole-copy gate remains OFF. No whole-copy UI is released.

## Verified since resumption

- Exact physical identity now uses BigInt filesystem stats. Adjacent Windows
  inode values previously rounded to the same Number; checks now compare exact
  device/inode, size, nanosecond timestamps and link counts. Five new tests cover
  the demonstrated precision loss and concurrent identity/time/link changes.
  The common file/tree/whole focused group passed 83/83, without skips.
- Global allocation reservations now cover parent and target UUIDs, all new
  owners/photos/stages, historical journals, shares and invitation grants.
  Only exact own virgin/pending/ready records are exempt. Hardened target unit
  tests passed 46/46; real disposable MySQL passed 56 scenarios plus their suite
  parent (57/57), without skips.
- The parent validates complete source rows and canonical payload before and
  after creation. Target dictionary proof uses the actual canonical dictionary
  writer's projection; it is not supplied by a request or trusted from a saved
  plan. Twelve focused parent tests passed with actual canonical helpers.
- Authenticated stage POST/GET routes and capability advertisement are connected
  under the separate default-OFF whole-copy gate. Seven real API/MySQL scenarios
  plus their suite parent passed (8/8): full shared/demo source copies, complete
  target/source/file proofs, restart, lost acknowledgement, exact replay,
  cancellation, changed body, foreign actor, missing stage, stale source and a
  forced failure on the final photo insertion. The latter rolled back list,
  owners, prior photo inserts and parent journal together, retaining ready stages
  for the same immutable operation. No production data was used.
- Separate whole-copy transport admission and parent fencing now enforce typed
  stage/parent journal relationships, exact cancellation and context checks.
  The new fence suite passed 19/19. Before its last two test-only additions, the
  combined old transport/tree fence, whole client and whole fence passed 77/77.

Evidence is retained in the sibling `legacy-photo-compat-api/node_modules/`:
`whole-copy-bigint-before.txt`, `whole-copy-bigint-after.txt`,
`whole-copy-target-mysql-2.txt`, `whole-copy-api-mysql-2.txt`, and
`.cache/whole-copy-parent-focused-2.txt`. Disposable MySQL and fixture APIs were
shut down after the checks. Registration/full regression results are recorded
separately once complete; focused passes are not whole-application acceptance.

Registration is now complete. The full BE operations command passed 455/455;
the full FE transport command passed 2334/2334, both once without failures or
skips. FE source checks also passed. Entry-file hashes remained unchanged during
the commands; this claim is narrower than a complete dependency-graph snapshot.
The seven API scenarios are additionally registered in the default MySQL suite
with restoration of changed gates/actor configuration. That default full suite
was not rerun; its unchanged focused whole-copy execution is the 8/8 proof above.

## Still required for card 3.3

V10 plan/registry integration; complete source and absent-target admission,
namespace inventory and capture leases; connection to the existing copy form;
target-only apply/mirror/acceptance and cold recovery in the application; real
browser acceptance of that complete user flow. The protocol/server/client
foundation does not complete these remaining tasks.

## Current user incident and release boundary

The user reported Experiment v1611 with European API, orange sync status and a
photo-change warning after changing only bags/items/placement. This matches the
legacy-photo save guard defect; successful loading of five lists is not evidence
that the latest edits were saved. Do not clear the user's local queue.

An isolated v1612 hotfix is being prepared from published FE `b9969d9b` and
published BE `fbc03422`. It selects only legacy-photo preservation from FE
`ac5abf0f` and BE `f194ae77`, retaining v1611 deployment validation tools. The live
BE baseline was independently confirmed by read-only SSH. Whole-copy changes
are excluded. Candidate checks and any subsequent publication require their own
exact-source evidence. At this checkpoint, no v1612 publication has occurred.
