# Experiment v1615: ordinary save recovery and rebase

Backport note: the migration branch retains its existing release profile and
version. This backport does not add the ordinary recovery gate to that profile;
the release activation and acceptance instructions below describe the separate
v1615 release, not activation or publication of the migration branch.

This candidate follows frontend v1614 (`42fae83d`) and its API (`f348040e`).
Production is outside this release. `PERSONAL_ORDINARY_RECOVERY_ENABLED` is
false in source; the Experiment release plugin enables it only on
`https://experiment.vniipo-help.ru`.

## Main path: preserve compatible edits

An ordinary queued save may contain an exact `mergeBase` saved with its original
action. After the original actions have terminal receipts, the client compares
that base, the retained local payload, and a fresh owned server payload. A
compatible result becomes a new immutable action with the current numeric
server revision. The original UUIDs and request bodies are never rewritten.
Server CAS still arbitrates any edit that arrives during the comparison.

The paired API durably rejects an authorized shared-owner root preparation
whose positive numeric base is older than the locked current revision. The
receipt uses the original UUID and digest and has no business effects. Invalid,
future, dependent, foreign or unsupported preparation retains its old refusal.
Losing the response can therefore be resolved through an exact receipt GET.

The ordinary planner preserves confirmed photo owners, order, metadata, and raw
server references. Only the already supported legacy URL aliases compare as
equivalent. It does not upload, remove, reorder or migrate photo files.

Independent field edits and additions can merge automatically. Conflicting
records are presented for an explicit local/server choice; postponing leaves
the original queue intact. Concurrent edits within one layout currently form a
whole-layout conflict. This release does not automatically rebase removal of
entities or placement keys: that needs a separately validated deletion intent.

## Fallback when comparison cannot complete

The sync indicator can offer an explicit server-version choice. Before any
cancellation, the outbox atomically saves a scoped archive containing exact
original queue bytes and the local snapshot. Each original operation is then
settled through the existing exact cancellation protocol. An already committed
operation always wins; its effects remain in the fresh server state.

Only after all original outcomes are terminal does the client publish one new
CAS action containing the fresh server payload. A lost response or application
restart resumes the saved choice. Old archived UUIDs remain fenced after
compaction and even if the feature gate is subsequently disabled. Storage
failure, a changed editor/account, or an unverified receipt stops the process.

The optional JSON download is diagnostic recovery data, not the normal import
format. It includes local state and queue records, not the photo files. The
normal path does not require downloading it; postponing creates no server write
or cancellation.

## Actual phone incident and acceptance

The user's screenshot confirms v1614 and the paused unconfirmed-save warning.
The observed mobile UUID had no API operation row when investigated. Its exact
body and saved base have not been obtained from the phone. Passing synthetic
browser cases must not be reported as recovery of that particular phone queue.
Never infer its missing base from timestamps or substitute today's server
snapshot for the original base.

Acceptance uses the normal release bundle in Chromium and mobile WebKit,
including compatible rebase, both conflict choices, postpone, archive quota,
lost cancellation response, cold restart, and later edits. The API has real
MySQL coverage for exact stale receipts, competing calls, ownership, unchanged
business rows/revision/files, and terminal cancellation. Final publication also
requires the existing source, critical, transport, browser, build, API contract
and Linux deployment checks bound to one clean commit and artifact fingerprint.

After publication, test on two devices with one account: edit a weight on one
device and add a different bag on the other, then synchronize. Both changes
should remain. Edit the same weight differently to check the explicit choice;
postpone once and verify both versions remain. Reload after confirmation and
check the same state with no duplicate operation. The old phone queue requires
its own verified outcome before closing the incident.
