# Bike Packing Mode State Logic

This document describes how app mode and layout selection must work.

## Core Idea

The app has three session modes and several view scopes. These are not the same thing as `state.activeLayoutId`.

`state.activeLayoutId` belongs to the editable working state. It must not be used as the only source of truth for demo/shared/admin screens.

## Session Modes

### `guest`

The user is not authenticated.

Allowed views:

- read-only demo;
- read-only shared;
- local guest copy created by an explicit copy/new action.

Guest mode must not upload private sync payloads.

### `user`

The user is authenticated as a normal user, or force-offline mode intentionally unlocks local private state.

Allowed views:

- private user layouts;
- read-only demo/shared;
- local editable state while offline.

Normal user mode must not edit public demo/shared templates directly.

### `admin`

The user is authenticated and matches the admin allowlist.

Allowed views:

- private user layouts;
- admin edit draft for public demo;
- admin edit draft for public shared layouts;
- read-only demo/shared when explicitly viewing without editing.

Admin public edits must publish through public demo/shared logic, not through private user-list sync.

## View Scopes

### `private`

The app is showing a normal user layout.

Rules:

- `state.activeLayoutId` may change.
- local state may be persisted.
- private sync may run.
- last private layout may be remembered.

### `guest-local`

The app is showing a guest-created local layout.

Rules:

- `state.activeLayoutId` may change.
- local state may be persisted on the device.
- private server sync must not run.
- this layout must not become the saved last private layout.

### `demo`

The app is showing the public demo layout.

Rules:

- automatic startup fallback may enter this scope.
- automatic fallback must not change `state.activeLayoutId`.
- normal users and guests see it read-only.
- admins may explicitly open an admin edit draft for it.

### `shared`

The app is showing a public/shared layout.

Rules:

- read-only viewing must not change `state.activeLayoutId`.
- copying creates private or guest-local records intentionally.
- admins may explicitly open an admin edit draft for it.

### `admin-public-edit`

The app is editing a public demo/shared draft.

Rules:

- this is editable UI state, but not private user data.
- the draft may be materialized in local state for editing.
- autosave/publish goes to public demo/shared storage.
- private list sync must prune these drafts.

## Saved Layout Choice

There are two related preferences:

- last explicit layout choice;
- last private user layout choice.

Rules:

- selecting a private user layout updates both when applicable;
- selecting demo/shared explicitly updates the explicit choice;
- automatic guest/demo fallback must not overwrite the last private choice;
- stale guest/admin draft IDs must not be restored as private layouts;
- in admin mode, a saved demo/shared choice means "open public edit", not "fall back to private".

## Startup Flow

### Online authenticated user/admin

1. Check auth.
2. Load remote/private state.
3. Apply accepted server state.
4. Restore saved layout choice.
5. Render.

Important: admin public edit must not be opened before step 4. Otherwise the current read-only scope can hijack startup and skip the saved choice.

### Guest or unauthenticated

1. Load demo/shared public payload as needed.
2. Enter read-only `demo` or `shared` scope.
3. Do not write `state.activeLayoutId` just because fallback happened.

### Force offline

1. Treat session as user-like local mode.
2. Render local editable state.
3. Keep changes local until real sync is available.

## Sync Pruning Rules

Private sync payloads must remove:

- admin demo draft layouts;
- admin shared draft layouts;
- guest demo copy layouts;
- generated demo/shared service items and containers;
- items inside containers that were pruned.

Only explicitly copied private records may sync as private user data.

## Debug Checklist

When "last opened layout" breaks, check in this order:

1. What is `currentSessionMode()`?
2. What is `currentViewScope()`?
3. What is `state.activeLayoutId`?
4. What is saved under `bike-packing-active-layout-choice-v1`?
5. What is saved under `bike-packing-active-private-layout-choice-v1`?
6. Did startup call `restoreSavedLayoutChoice()` after loading state?
7. Did any early public/admin branch return before restore?
8. Did a guest/admin draft leak into private sync or into saved private choice?

## Invariants

- Read-only public fallback never changes `state.activeLayoutId`.
- Guest-local layouts never become saved private choices.
- Admin public edit drafts never sync as private data.
- Startup restores saved choice after loading remote state.
- All mode transitions go through the mode controller.
