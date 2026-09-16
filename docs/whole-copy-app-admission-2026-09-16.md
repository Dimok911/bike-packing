# Whole-copy application admission — 2026-09-16

Card 3.3 remains in development. The saved branch now has an actual application
runner for an already durable V10 plan. The copy form, target application and
release remain separate outstanding work. All feature gates remain OFF.

## Connected behavior

`runAdminTemplatePhotoWholeCopyPlan({binding, layoutId, operationId})` takes the
selected SOURCE layout ID. A target layout is not fabricated while its command
is pending. The runner uses the existing V10 registry and typed client, with a
real source/target capture lease and application inventory/namespace adapters.

The source namespace must match its complete raw record, including metadata,
owner/photo maps and object identities. All allocated target IDs and schema
references must be absent from live state, including canonical catalogs and
legacy template aliases. Unrelated business text is not interpreted as an ID.

The application reads the ordinary, photo upload, single-copy, tree-copy,
whole-copy, plan, stop/adoption and order inventories with existing typed readers.
Actor-level whole-copy discovery also sees copies whose target layout does not
exist yet. An independent target history is never treated as an empty baseline.
Other retained whole copies cannot reserve overlapping allocations or either
selected namespace. Older source records follow the established numeric-history
and fully validated V1–8 adoption/V9 acceptance rules; unresolved records stop
dispatch. The own plan stays byte-bound, and its mutable journal is independently
validated before every admitted stage/parent write.

The common admission scope is shared with tree copy. The same live scope surrounds
transport registration and each POST, including a recheck after registration
yields. Returning a receipt does not modify the editor, retire claims, cancel an
action or release target allocations. With all write gates OFF, known receipt
recovery is GET-only; unknown or missing evidence stays paused.

## Performance correction

Nested guard composition repeated complete upstream checks before and after
read-only synchronous callbacks. It now performs a cheap context/lease check
before the callback and the complete upstream check after it. Await boundaries,
typed record rereads and pre-POST checks remain intact. Pure own-journal envelope
validation reuses only the result for exactly identical raw bytes; context,
lease, other inventories and live namespaces are still checked afresh.

The same five-photo local actual-runner fixture took about 40.3 seconds before
these changes and 6.3 seconds afterward. This is not a phone or live-API benchmark.
Changed journal bytes after `beginWrite` are covered by the final regression.

## Validation and limits

- Whole/tree admission helpers: 25/25 after shared-guard optimization.
- Local whole namespace helper: 8/8.
- Existing tree runner/inventory/capture dependencies: 43/43 before the shared
  guard optimization; only their missing new fixture imports needed correction.
- Final application run: 8 whole-copy cases plus one existing tree happy case,
  9/9 with no skips. Covers fixed stage/parent IDs, lost ACK and OFF recovery,
  occupied target, changed source, independent queues, missing typed record,
  and source/plan/journal changes after transport registration. Whole source and
  editor state remain untouched. Log: `node_modules/.cache/whole-v10-app-final.txt`.
- Source syntax check and diff check passed. No full transport suite or Actions.

Application tests execute the actual extracted app functions with real typed
store/client/registry helpers, modeled IndexedDB transactions and simulated HTTP.
They do not exercise the user form, a native browser, the real database or phone.

## Next integration boundary

The capture and first target-only application below are now implemented by
`whole-copy-form-capture-2026-09-16.md`. Durable acceptance, already-applied cold
recovery and the visible form route remain outstanding; see that checkpoint
for the current boundary. The following paragraph records the earlier plan.

Capture a fixed whole-copy selection from the existing form while the confirmed
source is selected. Add an explicit capture-phase inventory transition: durable
record and V10 plan may appear, but no target editor placeholder or unrelated
journal may appear. Do not reuse the dispatch-only inventory for initial capture.
Then apply only the new target from its full verified receipt, durably accept it,
and connect cold recovery before enabling the UI and testing against the paired
whole-copy API foundation. Do not recreate the server/transport foundation.
