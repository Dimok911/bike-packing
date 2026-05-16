# Bike Packing Sync Logic

This document describes the sync model at a product-logic level. It avoids endpoint and table details on purpose.

## Core Idea

The app has two different worlds that must never silently mix:

- private user packing lists;
- public demo/shared layouts.

Demo/shared layouts can be viewed, copied, and edited by an admin, but they are not the same thing as a user's private packing list. A copied item becomes private only when the app intentionally creates a private copy.

## Local Layers

The browser keeps several local layers:

- current local working state: what the UI can render and edit;
- last accepted server baseline: the version used for comparison;
- sync metadata: dirty flag, local timestamp, last known server timestamp;
- photo cache: local photo blobs waiting for upload.

The current local state can contain public admin drafts while an admin edits demo/shared layouts. Those drafts are UI/editor state. They must not be uploaded as part of a private user list.

## Server Layers

The server keeps private lists separately from public demo/shared layouts.

Private list sync has two paths:

- entity sync for items, containers, and layouts;
- full payload sync as a compatibility and recovery path.

Entity sync is preferred because it changes only records that actually changed. Full payload sync is still needed for old clients, recovery, and whole-list operations.

## Normal Private Sync

When the user changes a private list:

1. The browser marks local state dirty.
2. The browser compares local state with the last accepted server baseline.
3. Entity sync sends changed items, containers, and layouts.
4. If entity sync covers all changes, the full payload is not rewritten.
5. After a successful sync, the accepted state becomes the new local baseline.

Public demo/shared editor drafts are pruned before private sync.

## Demo And Shared Editing

When an admin opens demo/shared for editing, the app materializes an editable draft in the local state.

That draft has public/admin markers. It is saved through public publishing logic, not through private list autosave.

When the user intentionally copies something from demo/shared into a private list, the app creates a new private item/container and removes public/admin markers. That copied item is then allowed to sync as private data.

## Conflict Handling

A conflict appears when both local and server changed since the last accepted baseline.

The user can:

- keep local choices;
- keep server choices;
- choose per item/container/layout.

Choosing "take everything from server" must replace the local working state and baseline with the server version. Old local deleted/demo/shared leftovers should not participate in later merges.

## History Restore

History restore is a deliberate server-side overwrite. The restored version may be smaller than the current version because items or bags may have been deleted in that historical state.

For that reason, "the server version has fewer items" is not always an error. Once history restore succeeds, older cached clients must not be allowed to overwrite the restored server version with stale local state.

## Old Browser Cache Protection

A phone can keep an old service worker and old JavaScript. That old client may still have a dirty mixed local state.

The protection is layered:

- the app version and asset URLs are bumped so new clients fetch new JavaScript;
- the client refreshes local timestamps before deliberate force overwrite;
- the server rejects stale force overwrites when the incoming local timestamp is older than the current server version;
- the server blocks generated demo/shared service entities in private payloads.

This means a stale phone can still ask to sync, but it should be pushed back to the restored server version instead of silently contaminating the private list.

## API-Side Rule To Add

The API should reject stale forced full-payload overwrites for private lists.

Recommended rule:

- when a request has `force: true` or `forceOverwrite: true`;
- compare request `sourceUpdatedAt` / `clientUpdatedAt` with the current server `updatedAt`;
- if the request timestamp is older than the current server version and the payload hash differs, return `409`;
- include the current server payload and `serverUpdatedAt` in the response, so the client can load the server version;
- allow the request if the hashes are identical.

This protects a restored server version from an old cached phone that still has a dirty local copy.

## Expected Invariants

- Private list payload should not contain demo/shared editor drafts.
- Public demo/shared publishing should not rewrite a private user list.
- Copying from demo/shared into private creates new private records by design.
- Accepting server state rewrites both current local state and baseline.
- A stale force overwrite must not beat a newer server restore.
