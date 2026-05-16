# Bike Packing Sync Local Layers

This app keeps several local layers because one local JSON blob is not enough for safe offline work, conflict detection, and photo uploads.

## Layers

### `bike-packing-prototype-state-v1`

Current local working state.

This is what the UI can render when the app is offline or when server loading fails. It contains layouts, containers, items, settings, collapsed state, current active layout, and local photo references.

When a server state is accepted, this layer should be overwritten with the normalized server state. If this does not happen, old deleted items can reappear on the next reload.

### `bike-packing-prototype-base-state-v1`

Last known server baseline.

This is not the current UI state. It is the comparison point used to understand what changed locally and what changed on the server since the previous sync.

Typical use:

- local state differs from base: user changed something on this device;
- remote state differs from base: another device changed something;
- both differ from base: conflict or merge is needed.

### `bike-packing-prototype-sync-meta-v1`

Sync metadata.

This stores flags and timestamps, for example:

- `dirty`: local state has unsynced changes;
- `localUpdatedAt`: when local state was last changed;
- `serverUpdatedAt`: last server timestamp known by this device;
- `lastSyncedLocalUpdatedAt`: local timestamp that was last successfully synced.

This layer decides whether local changes should be uploaded, server changes should be downloaded, or conflict resolution should be shown.

Important rule: on the first online load, stale `dirty` alone must not make local state win over the server. Local should win only if its timestamp is really newer than the server timestamp.

### IndexedDB photo cache

Photos are stored separately from `localStorage`.

The JSON state stores photo metadata and IDs. The actual image blobs can live in IndexedDB until they are uploaded. This avoids putting large image data directly into `localStorage`.

Typical photo lifecycle:

- user selects a photo;
- blob/thumb are saved to IndexedDB;
- item/container gets a photo record in state;
- sync uploads pending photo blobs;
- server returns public `url` / `thumbUrl`;
- state is updated with server URLs.

## Startup Flow

Online startup:

1. Read local state into memory, but do not render it as the first board.
2. Check auth and load server state.
3. If server state is valid, apply it to memory.
4. Save accepted server state into `bike-packing-prototype-state-v1`.
5. Save the same state as `bike-packing-prototype-base-state-v1`.
6. Clear `dirty` and update sync timestamps.
7. Render the board.

Offline startup:

1. Read `bike-packing-prototype-state-v1`.
2. Render local state immediately.
3. Keep changes local and mark them dirty when edited.

## Conflict Logic

The app compares three states:

- base: `bike-packing-prototype-base-state-v1`;
- local: `bike-packing-prototype-state-v1`;
- remote: server response.

If local equals remote, sync is clean.

If local differs from remote and local is not dirty, remote wins.

If local is dirty and remote changed since base, the app tries to merge by item/container/layout. If both sides changed the same entity, it opens conflict resolution.

If local is dirty but remote did not change, local can be uploaded.

## Public Demo And Shared

Demo/shared templates are separate public records and must not be saved through normal user autosave.

Normal user lists use private sync endpoints. Demo/shared editing uses admin publish endpoints. This keeps these scopes isolated:

- private user lists;
- public demo templates;
- default shared templates;
- shared lists opened by link.

## Common Failure Modes

### Deleted item appears before server load

Cause: UI rendered stale `bike-packing-prototype-state-v1` before server state arrived.

Expected behavior now: online startup waits for server before rendering the board. Local state is shown only offline or as fallback.

### Deleted item returns after reload

Cause: accepted server state was not saved back into `bike-packing-prototype-state-v1`, or stale `dirty` made local state win.

Expected behavior: after server state is accepted, both current state and base state are rewritten from server data.

### Photo exists on server but disappears in UI

Cause: state has stale photo metadata, server URLs were not written into item/container state, or an older entity row overwrote the published payload.

Expected behavior: published payload and entity rows must contain the same photo metadata, and frontend should render from canonical `url` / `thumbUrl`.
