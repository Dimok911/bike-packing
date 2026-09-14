# Experiment startup recovery and legacy photo route aliases

The real v1612 acceptance check exposed two independent failures. Startup
entered the full loader with retained personal actions, so the replacement
guard correctly stopped it but its generic error was reported as a server
outage. Manual synchronization then reached the API successfully, but its
legacy photo comparison rejected different approved URLs for the same files.

The observed queue contained three original placement actions without merge
bases at revision 1582. The authenticated server still reported revision 1582.
All 180 photo references across 96 owners had identical IDs, order and metadata;
only the established Experiment origin and API path aliases differed. No live
queue was cleared, rewritten or replaced as part of diagnosis. The complete
audit additionally found two existing shared legacy IDs across old copied bags,
five references with an empty listId field but exact own-list URLs, and 68
already unreferenced active SQL photo rows. All physical rows matched the same
account and list. Every referenced file existed under one of its old owners.

Startup now runs the existing personal save recovery within the load's shared
promise before attempting a full read. It verifies the account, list and storage
scope again after awaiting the saver, and proceeds only if no action remains
pending. A handled save refusal is not interpreted as success. Photo recovery
keeps its earlier stop, and the full loader's replacement guards remain intact.

Legacy photo inventories compare the verified list/photo/file-or-thumb route
identity across the existing allowlist. Queries, all other metadata, owners
and order remain exact. This is an in-memory comparison only: immutable command
bodies and receipt digests are never normalized or replaced. Empty legacy list
metadata is retained only when both URLs prove the current list; the field is
not filled. Existing shared references require identical photo metadata and the
exact original owner inventory, preventing any new sharing or copying. The paired backend
must perform the same comparison under its locked transaction while retaining
the exact photo SQL rows and publication heads. Previously unused legacy rows
are retained separately from the reference inventory; they cannot be attached,
changed or removed through this ordinary-save exception.

New browser regressions exercise startup without clicking Sync, including
three queued actions, a lost acknowledgement, an unavailable API and mixed old
photo routes. The old published v1612 bundle reproduced the startup failure:
zero POSTs, all three records still pending, revision remaining 1582.

Release evidence belongs to this candidate's ignored v1613-final directory.
This document does not assert publication or acceptance on the user's device.
Production and the separate whole-template-copy development are outside this
patch.

## Development backport

The selected v1613 fixes from candidate `6e6416ec` were backported onto the
whole-template-copy development checkpoint `bd47ff19`. Publication of that
candidate was still pending when this backport was prepared. The development
version, build profile, whole-copy/tree modules and feature gates are unchanged.

The load observer and the apply step now retain the same raw server business
baseline; the normalized editor view remains in the snapshot patch. An ordinary
confirmed save with only approved legacy URL aliases reuses its existing action.
The comparison checks every other business field exactly, so real field,
placement, packed-state and photo changes cannot disappear as false no-ops.
Neither the generic outbox same-revision guard nor immutable action bytes change.

Permanent focused regressions are registered in `test:transport`:
`personal-pending-startup.test.js`, `personal-confirmed-business-equality.test.js`,
`personal-legacy-photo-preservation.test.js`, `personal-save-outbox.test.js`,
`personal-load-baseline.test.js` and `personal-save-drain.test.js`.

The backport passed 247 focused tests, including the unchanged V10 whole-copy
save-plan tests, and the complete source syntax check. The 810-file runtime and
critical-test graph stayed unchanged during validation. Logs and SHA-256 graphs
are retained in this checkout's ignored `node_modules/.cache/v1613-backport-*`
files. No release build, push or deployment was performed for this development
backport.
