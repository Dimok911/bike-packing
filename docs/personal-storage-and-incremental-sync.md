# Personal storage and incremental synchronization

Status: implementation in progress; not a published migration. The current
application still uses the legacy localStorage outbox. Do not enable partial
payloads in that writer or claim the phone recovery problem is resolved.

## Observed problem

The phone has approximately 3.01 MiB of other localStorage records and an
801.43 KiB pending personal queue. Evicting the 657.84 KiB public cache reduced
total usage from 4.43 MiB to 3.79 MiB, but preparing recovery still failed.
Recovery creates additional complete snapshots. Further cache eviction does
not address growth. Reported startup delay is about 30 seconds; its actual
network timing on the phone has not yet been measured.

## Target data flow

1. Read the authenticated account's lightweight layout inventory and remembered
   active layout. Show a verified cached active layout while checking freshness.
2. Fetch the selected layout's placement graph and the transitive closure of
   referenced bag/item records, including nested placements. The server builds
   this response from the shared catalogue; it does not store separate catalogue
   copies per layout. Include lightweight photo references, with image bytes
   loaded only when needed for display. Load small dictionaries as a whole.
3. Reuse cached entities across layouts and fetch changes by revision. Load other
   layouts and history only on opening them. On opening Things or Bags, fetch
   stable catalogue pages; server-side search covers the full catalogue, not
   merely the records already cached. Partial loading is the target after
   the incremental writer is safe.
4. Persist a typed action and its required preconditions in an IndexedDB
   transaction. Normal actions do not duplicate every layout and catalogue.
5. Send the action's stable operation ID, affected resource IDs, expected
   revisions and changed values. The server authorizes and validates it,
   commits it once, and returns its receipt plus changed resource revisions.
6. Fetch changes since the device's confirmed cursor. Apply changes and advance
   that cursor in one local transaction. Repeat delivery must be idempotent.
   An expired cursor triggers a scoped refetch rather than invented deletions.

Example: linking an existing bag to one layout carries the layout ID, bag ID,
placement information, operation ID and preconditions. It does not upload the
bag's photo files or every other layout. The exact payload size will be measured
after the endpoint and client integration are implemented.

## Partial data is not an empty collection

Every resource/query cache needs explicit loading state and revision/cursor:
`not-loaded`, `loading`, `loaded`, or `failed`. A page can be complete while the
whole catalogue is not. A missing entity in a partially loaded page is unknown,
not deleted. Only an explicit versioned deletion from the server or a validated
delete command removes it. No partially loaded snapshot may enter legacy
`list.update` full-replacement or snapshot-comparison paths.

Opening an uncached layout offline must explain that it is unavailable offline;
it must not render an empty layout as if it were complete. Cached layouts and
their pending local actions remain usable. Counts/search results requiring the
whole catalogue must come from the server or declare their limited scope.

## Compatibility and recovery

### Explicit offline availability

Preserve the current Settings / Available offline feature. Currently all layout
data is local; selecting layouts controls full photo downloads. The separate
global manufacturer bag catalogue option stores model cards and main previews,
not all gallery photos. That catalogue is not the user's personal catalogue.

When lazy data loading is enabled, add **Whole personal catalogue offline**:
all personal items, bags, categories and storage locations. Selected offline
layouts additionally pin their full placement graphs and referenced entities.
Keep photo downloading separately controlled; do not unexpectedly download
every gallery because the user selected all text records. This allows a user
offline to find any personal item and place it into an available layout.

Treat offline selection as a durable pin/request, not proof of completion.
Download all required pages at a consistent server revision, stage them in IDB,
and mark the manifest complete only after every required record has committed.
Display progress, failed/interrupted downloads and last verified revision;
retain a previous complete copy during refresh or a failed new download.
Checkpoint downloads so closing the app does not discard completed work.

Partial catalogue search offline must clearly identify cached-only coverage
unless the full-catalogue manifest is complete. Small dictionaries are included
in that manifest and available with downloaded layouts. An offline full-text
query cannot silently be replaced with a failing server search.

Do not evict pinned records, pending operations, recovery originals or entities
shared by another pinned layout. Removing an offline selection releases only
unneeded confirmed cache data; it never deletes server records or local edits.
Account/list ownership must be rechecked across every download/write boundary.
The settings must list unloaded layouts from the inventory, not only state.layouts.

Tests before enabling lazy reads: initial full catalogue download; partial page
failure; restart mid-download; refresh failing while old copy remains usable;
offline search/addition of a previously unopened item; settings/dictionaries
offline; shared entity retention on unpin; simultaneous account switch;
storage refusal; photo-selection independence; and existing manufacturer
catalogue offline behavior.

### Old clients

Deploy server support for both the old full-snapshot contract and new commands
before switching clients. Advertise capabilities, keep old writer validation,
and do not fall back from a failed command to a destructive full replacement.
Existing unconfirmed operations retain their original IDs and exact bytes.

Import current/base/recovery mirrors and personal journal bytes into IndexedDB
under the exact account/list binding. Keep legacy data until cutover has a
verified ownership and concurrent-tab policy. Old tabs do not honor new locks.
Copying data alone is not permission to delete it from localStorage.

Normal reconciliation uses server-side command preconditions and stored
revisions. An old operation without a baseline cannot acquire a fictional
history from a comparison of two final snapshots. Full snapshot analysis is
an exceptional recovery path, not a per-click network operation. Server-side
analysis cannot infer whether a missing bag was deleted or never received.

## Implemented foundation in this candidate

- Atomic IndexedDB repository with revision CAS, immutable journal entries,
  exact legacy import manifest and completion only on transaction completion.
- Legacy import preparation/readback with account and source-change guards;
  it neither activates the new store nor removes legacy data.
- Async outbox facade for capture and ordinary recovery, with durable barriers
  before cancellation and remote reads. No drain/compaction API yet.
- Prepared mutation UI boundary accepts asynchronous persistence; consumers
  wait for completion before closing dialogs/rendering successful changes.
- Pending startup can reveal an authenticated validated local view before a
  held server response, without marking pending changes synchronized.

## Remaining integration gates

1. Make all personal snapshot/base/recovery readers and writers use the new
   repository; retain guest/admin draft ownership and offline account discovery.
2. Integrate drain/receipt adoption and certified journal retirement atomically.
   Photo queues and transport journals need their own coordinated boundaries.
3. Ordinary forms currently mutate live state before save; stage candidates
   before durable capture. Do not hide asynchronous writes behind Storage.setItem.
4. Define cutover/reopen behavior, old-tab write detection and bounded retention.
   First-list creation must fix its target binding before asynchronous capture.
5. Add server resource commands, change cursors and scoped reads;
   enable lazy loading only when partial data cannot reach the legacy writer.

Acceptance includes filled localStorage migration, aborted IDB transactions,
two tabs, account switching during writes, restart before/after receipt,
lost replies, duplicate commands, two devices editing different layouts,
deletion delivery, pagination under concurrent changes, offline uncached
views, expired cursors and the user's actual baseless recovery export.
Measure cold/warm startup and bytes transferred for one action as separate
checks. Local tests alone are not phone acceptance or a production release.
