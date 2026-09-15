# Personal queue durability — v1625

The physical iPhone passed v1624 online confirmation, then failed an ordinary
offline rename before capture: `reasonCode=quota`, with a memory draft available.
The supplied private recovery export is 1,978,044 bytes. Its three journal rows
(generation-4 action, applied proof, baseline anchor) occupy about 2.26 MiB as
UTF-16 keys/values. This is not the site's total storage or a measured quota.
The unsaved draft also differs from the recorded payload beyond one rename;
it must not be imported wholesale or silently sent to the real server.

## Change

Large personal-save and ordinary-recovery records now use
`bike-packing-personal-journal-v1` IndexedDB. Existing localStorage keys remain
as compact SHA-256 references, preserving cross-tab observation. The hash binds
the original key and exact raw bytes. Startup verifies migration before replacing
each inline source. Synchronous reads of missing/unprepared references fail closed.

New capture, baseline, photo linkage, reconciliation and recovery writes await
the IDB transaction, exact readback, context/queue checks and reference readback.
There is no delayed synchronous Storage write. Small confirmation marks remain
synchronous. Queue/parser/server operation identities and receipt semantics stay
unchanged; the portable protocol core and server API are not modified.

UI forms await capture before closing, block duplicate submission, and keep the
original-account draft on error. Offline status waits for pending capture. Restore,
import, migration, server-baseline and checkpoint callers also await durability.
Recovery exports resolve references into the original full journal records.

## Size and cleanup

This fixes localStorage capacity, not the full-snapshot payload format or export
size. Full records still contain action/base/snapshot information. Partial data
loading and smaller domain operations remain separate roadmap work.

Migration originals are retained once as immutable journal rows. New values use
deletable snapshot rows. Only explicit native retirement authorizes cleanup;
`flush`/`prepare` verify all active references under the same binding lock before
deleting retired new bodies. Repeated confirmed edits retain the current action
and checkpoint rather than another full payload per edit. A crash between
reference retirement and cleanup can leave an orphan; no blind startup sweep is
performed because unpublished bodies may belong to failed writes.

## Verification and phone acceptance

Focused storage/native tests cover an equivalent generation-4 2.26 MiB queue,
quota/readback/reference failures, stale competing writers, cold reopening,
confirmation/checkpoint persistence and bounded retirement. Domain/UI tests cover
deferred success, failed capture, duplicate clicks and account changes.

Browser checks use real IndexedDB in Chromium and mobile WebKit. The normal
bundle exercises offline rename, cold local reload, reconnect and one server
effect against an isolated synthetic API. Offline API requests are aborted and
`navigator.onLine` stays false; the fixture serves application resources as a
cache would. This does not certify actual Safari service-worker cache eviction.
An additional private-file check migrates the supplied export and captures only
the named item's rename in isolated browser storage; it never calls a live API.
Private contents, screenshots and traces are not committed.

After publication, physical iPhone acceptance remains necessary: verify v1625,
perform one ordinary rename offline, wait for the dialog to close, reload while
offline if the application is available offline, then reconnect and verify the
same name on the computer. Preserve the downloaded recovery file; the previous
unsaved draft is not automatically replayed by this release.

Do not roll the client back to v1624 once its queue uses references: that client
does not understand this storage format. The exact original records remain in
IndexedDB and in recovery exports. Production is unchanged.
