# Ordinary saves with existing legacy photos

The compatibility path permits an ordinary personal `list.update` to retain
old synced own-list photo references without `assetId`. An existing bag can be
placed into or removed from a layout without falsely treating its unchanged
photos as a new file operation. Both client and server must support
`personalLegacyPhotoPreservationV1`; the source client gate defaults to off and
the normal release profile enables it only at the Experiment origin.

The client compares the complete ordered inventory by owner, including all
metadata and any mixed causal references. The server independently verifies
the locked old/new owner inventories, full photo SQL rows and publication heads
inside the revision-checked receipt transaction. This is preservation, not
photo migration: it creates no asset identities or files. Existing strict
causal photo checks remain active.

## Loading and already pending actions

A cold cached page cannot use a freshness-only response to invent an initial
confirmed payload. Before an initial save, a guarded full server read establishes
the outbox's baseline even when local and server state compare equal. The app
binds this read to the account, storage scope and list; a pending outbox is never
rewritten to insert or replace a merge base.

For a previously captured action without a merge base, read the authenticated
server payload at exactly its recorded base revision and keep that proof only
in memory. If the server has advanced, only an exact committed historical
receipt with matching UUID, actor, list, kind and payload digest can establish
a historical boundary. A newer unrelated server snapshot is not an old base.
Unavailable evidence leaves the original action and local edits paused.

Every asynchronous preparation is followed by a synchronous check of the
editor context and immutable records. Reconciliation prepares each new
successor again. The transport checks the capability before a first write and
before resuming a waiting operation; terminal receipt reads remain available
when the writing capability is off.

## Scope and verification

Ordinary placement and field edits are included. Changes to legacy photo
contents, references, owners, order or metadata, owner deletion, dictionary
adapters, import/copy/history/share adapters and force overwrite remain outside
this compatibility slice. Missing or orphan active SQL photo rows require a
separate explicit recovery; the client cannot assume that a readable URL proves
server consistency.

Permanent coverage lives in `personal-load-baseline.test.js`,
`personal-legacy-photo-preservation.test.js`, `personal-save-drain.test.js` and
`list-operation-queue.test.js`. The normal release browser regression is
`tests/e2e/personal-legacy-photo-save.spec.js` in Chromium and mobile WebKit;
its intercepted API uses a synthetic account, not real user data. The paired
backend has real API/MySQL/file scenarios, registered in its full smoke suite
and the local `legacy-photos` scope. Synthetic browser acceptance and real
database integration are separate checks; neither claims that a particular
live user's pending action has finished.

Production upgrade and rollback rehearsals remain tracked separately in
`production-release-batches.md`.

## Local validation, 2026-09-14

Source check, normal Experiment release build, 931 critical tests and 2243
transport tests passed. The final ordinary-build browser run passed 8/8
(4 Chromium, 4 mobile WebKit), with no retries or skips and 5405 source/build
files unchanged during the run. It includes initial cold/equal-state loading,
actual placement and removal, the immutable old action without a merge base,
and lost-ACK/reload recovery both with and without that base. The latter reads
the exact historical receipt and never makes a second POST.

The paired backend is `f194ae771228881edf7beb398ad8bfbeb4bab04b`.
Its focused canonical-session real API/MySQL run passed 10 scenarios plus the
parent. Backend checks passed; the first full operations run was 323/325,
followed by an instrumented unchanged 325/325 run. Two intermittent tree-copy
physical-file failures remain unexplained, as recorded in the backend document;
they were not hidden by changing guards or assertions.

Evidence is retained in the local `legacy-photo-compat-validation` directory
and this checkout's `node_modules/.cache/personal-legacy-photo-browser-4.*`.
Earlier browser fixture failures are retained too: noncanonical seed URLs,
a readiness helper that changed selection, and a Node serializer using the
Production origin were corrected to match the real Experiment wire format.
The application source did not change during these browser corrections.

This is an unpublished local development checkpoint, not Production readiness
or confirmation of a real user's pending save. A physical phone, a rehearsal
on copied existing data and the final selected release pair still need their
own acceptance before wider activation.
