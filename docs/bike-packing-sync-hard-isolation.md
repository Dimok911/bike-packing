# Bike Packing Hard Isolation Design

This is the backend contract for strict isolation between private lists and public demo/shared layouts.

## Goal

Restoring a private list from history must make the restored version canonical. Old item/container/layout rows must not be able to appear again during later reads, syncs, or background refreshes.

Demo/shared data must never enter a private list except through an explicit copy action that creates new private entities.

## Why Separate Tables Are Not Enough

Separate entity tables prevent everything from living in one blob, but they do not automatically make a restore authoritative.

The leak usually happens during state assembly:

1. The restored payload says "159 items".
2. Old entity rows for the same private list still exist as active rows.
3. A later read assembles `payload + active entity rows`.
4. The response now contains restored items plus old rows, so the UI grows back to 233 items.

The fix is not another frontend filter. The API must know which generation of rows belongs to the current canonical list.

## Core Structure

Add a list-level generation field:

```sql
ALTER TABLE bike_packing_lists
  ADD COLUMN state_revision BIGINT NOT NULL DEFAULT 1;
```

Add the same field to every private entity table:

```sql
ALTER TABLE bike_packing_items
  ADD COLUMN state_revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE bike_packing_containers
  ADD COLUMN state_revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE bike_packing_layouts
  ADD COLUMN state_revision BIGINT NOT NULL DEFAULT 1;
```

Recommended indexes:

```sql
CREATE INDEX idx_bpl_items_revision
  ON bike_packing_items (list_id, state_revision, deleted_at);

CREATE INDEX idx_bpl_containers_revision
  ON bike_packing_containers (list_id, state_revision, deleted_at);

CREATE INDEX idx_bpl_layouts_revision
  ON bike_packing_layouts (list_id, state_revision, deleted_at);
```

## Read Rule

When assembling a private list, use only entity rows from the current list revision.

```sql
SELECT state_revision
FROM bike_packing_lists
WHERE id = ?;
```

Then:

```sql
SELECT *
FROM bike_packing_items
WHERE list_id = ?
  AND state_revision = ?
  AND deleted_at IS NULL;
```

Do the same for containers and layouts.

Never assemble private state from entity rows with an older `state_revision`.

## Entity Sync Rule

Entity sync writes into the current list revision only.

Inside the transaction:

```sql
SELECT state_revision
FROM bike_packing_lists
WHERE id = ?
FOR UPDATE;
```

For each incoming item/container/layout row:

- set `state_revision` to the current list revision;
- upsert by `(list_id, entity_id)`;
- if the existing row has an older revision, the incoming row replaces it in the current revision;
- if the existing row has a newer revision than the client expected, return conflict.

Entity sync must keep rejecting or ignoring generated demo/shared service entities.

## Old Entity Revival Rule

Entity sync must not revive an ID that exists only in an older revision.

Example:

1. Revision `1` has item `tent`.
2. History restore creates revision `2` without item `tent`.
3. Old row `tent` remains in the database as revision `1` and is unreadable.
4. A stale client sends `items/sync` with item `tent`.

The API must return `409` for that item instead of moving it into revision `2`.

Allowed ways to bring it back:

- full restore/full replacement from a current client with the correct `baseStateRevision`;
- explicit user action that creates a new private entity ID.

## Full Restore Rule

History restore and forced full-payload overwrite are replacement operations.

Preferred history restore flow:

```text
POST /bike-packing/lists/:listId/history/:historyId/restore
```

The client sends only the current `baseStateRevision`; the API reads the payload from its own history table. This avoids trusting a possibly stale client payload during restore.

The private client must also load history from this same list-history source. Legacy global history rows can be shown only as legacy data, not restored through this endpoint, because their IDs do not belong to `bike_packing_list_history`.

Inside one transaction:

1. Lock the list row.
2. Increment `state_revision`.
3. Save the restored full payload to `bike_packing_lists.payload`.
4. Upsert every item from the restored payload with the new `state_revision`.
5. Upsert every container from the restored payload with the new `state_revision`.
6. Upsert every layout from the restored payload with the new `state_revision`.
7. Mark all rows from older revisions as deleted, or leave them physically present but unreadable because read queries filter by the new revision.
8. Return assembled state from the new revision only.

Pseudo-code:

```js
await tx.begin();

const list = await tx.selectListForUpdate(listId);
const nextRevision = Number(list.state_revision || 1) + 1;

await tx.updateList(listId, {
  payload: restoredPayload,
  state_revision: nextRevision,
});

await upsertItemsFromPayload(listId, restoredPayload.items, nextRevision);
await upsertContainersFromPayload(listId, restoredPayload.containers, nextRevision);
await upsertLayoutsFromPayload(listId, restoredPayload.layouts, nextRevision);

await markOldRevisionRowsDeleted(listId, nextRevision);

const state = await assembleState(listId, nextRevision);
await tx.commit();
return state;
```

The important part is that old active rows cannot be read after the revision changes.

## Stale Force Overwrite Rule

Reject stale forced overwrites from old cached clients.

When request has `force: true` or `forceOverwrite: true`:

- compare request `sourceUpdatedAt` or `clientUpdatedAt` with current server `updatedAt`;
- if the request timestamp is older than the current server version and payload hash differs, return `409`;
- include `serverPayload`, `serverUpdatedAt`, and current `stateRevision`;
- allow if hashes are identical.

Response example:

```json
{
  "ok": false,
  "code": "stale_force_overwrite_blocked",
  "serverUpdatedAt": "2026-05-16T08:20:00.000Z",
  "stateRevision": 42,
  "serverPayload": {}
}
```

## Client Contract

Responses for private list load/save should include:

```json
{
  "serverUpdatedAt": "...",
  "stateRevision": 42,
  "payload": {}
}
```

The client should store `stateRevision` in sync meta. If the server returns a newer revision, the client must treat the server state as canonical unless the user explicitly creates new changes after that load.

Requests from the client can include:

```json
{
  "baseStateRevision": 41,
  "stateRevision": 41,
  "forceOverwrite": true,
  "fullReplace": true,
  "payload": {}
}
```

Interpretation:

- `baseStateRevision` is the revision the client last accepted from the server;
- `stateRevision` is the same last-known revision, kept for compatibility with simple handlers;
- `fullReplace: true` means "this is not a merge, make this payload the complete canonical state";
- if `forceOverwrite/fullReplace` is true, the server should create a new revision instead of patching the current one in place;
- a forced replacement without `baseStateRevision`, or with an older `baseStateRevision`, must be rejected unless the payload hash is identical to the current server payload.
- after the list moves past revision `1`, any private write without `baseStateRevision` must be rejected, including item/container/layout entity sync.

## Public Isolation

Public demo/shared records should have separate IDs, endpoints, and storage semantics.

Do not write public demo/shared entities into private list entity tables. If this is unavoidable for an admin editor draft, those rows must have a separate scope marker and must be excluded from private reads:

```sql
WHERE scope = 'private'
```

or they must live in separate public tables.

The cleanest structure is:

- private lists: `bike_packing_lists`, `bike_packing_items`, `bike_packing_containers`, `bike_packing_layouts`;
- public templates: separate public list records or separate public tables;
- copies from public to private: new private IDs, current private `state_revision`.

## Migration Plan

1. Add `state_revision = 1` columns.
2. Backfill existing entity rows from their list's current revision.
3. Change read assembly to filter by current revision.
4. Change full restore/full overwrite to increment revision and upsert payload entities into the new revision.
5. Change entity sync to write current revision.
6. Add stale force overwrite rejection.
7. Verify by restoring an old history version with fewer items and reloading several times.

## Acceptance Test

Scenario:

1. Current private list has 233 items.
2. Restore history version with 159 items.
3. API increments `state_revision`.
4. API returns 159 items.
5. Reload app.
6. Background sync runs.
7. API still returns 159 items.
8. No item from older revisions appears unless the user explicitly copies or recreates it.

This is the invariant that prevents old demo/shared or stale private entities from leaking back into the restored list.
