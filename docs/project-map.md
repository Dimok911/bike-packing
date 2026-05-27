# Bike Packing Project Map

Last updated: 2026-05-27, app cache v903.

Use this as the quick orientation layer before editing. `AGENTS.md` remains the source of rules; this file is the map of where code should live during the ongoing `app.js` split.

## Entry Points

- `app.js`: app boot, current screen/mode, event binding, orchestration, `saveState`, `render`, toasts, compatibility wrappers. Do not add new business logic here.
- `index.html`: root app shell and runtime asset query strings. Bump with `APP_VERSION` and `sw.js`.
- `sw.js`: PWA cache shell. Online navigation refreshes HTML; offline navigation serves cached shell.
- `src/config/constants.js`: app version, storage keys, API constants, timing constants.

## Main Domains

- `src/state`: pure state work. Layout arrangement, delete/copy state operations, selectors, normalization, metrics, dictionaries, usage limits.
- `src/sync`: API calls, save payloads, photo sync, conflict merge, remote list records, service-worker helpers.
- `src/public`: public/demo/shared/template-copy contracts, identity, catalog availability, admin shared operations.
- `src/ui`: standalone UI formatting, dialogs, refs, visual state, print, search, touch helpers, 3D packing view.
- `src/storage`: localStorage/session/storage-scope helpers.
- `src/backup`: archive and restore analysis/import helpers.
- `src/utils`: small generic helpers with no domain ownership.
- `bikepacking-api`: backend repo nested at `bikepacking-api/`; commit and push separately when touched.

## Current Refactor Landmarks

- `src/state/item-ops.js`: item duplicate/delete record-level operations.
- `src/state/container-ops.js`: container duplicate/delete/cleanup/deep traversal operations.
- `src/state/catalog-lists.js`: item/root-container catalog list assembly before rendering.
- `src/state/layout-ops.js`: layout arrangement operations, active placement/removal state mutations, grouping, root column moves.
- `src/state/layout-arrangement.js`: layout arrangement snapshots and state application helpers.
- `src/state/layout-normalize.js`: arrangement repair/normalization and layout snapshot extraction.
- `src/public/admin-demo-layout.js`: importing and repairing published demo state as editable admin layouts.
- `src/public/published-state-export.js`: published/demo state export, generated/public id cleanup, and canonical published ids.
- `src/public/shared-admin-merge.js`: admin-side merge of published/shared state and built-in shared entries.
- `src/public/template-copy.js`: public/template copy source scoring and record builders.
- `src/public/copy-published-container.js`: published/shared container tree copy into editable state.
- `src/sync/save-body.js`: save payload preparation and admin/demo/template draft pruning for sync.
- `src/sync/state-merge.js` and `src/sync/conflict-merge.js`: sync conflict and merge rules.
- `src/data/default-user-state.js`: built-in first-run/demo private user state.
- `src/ui/history-diff.js`: history comparison diff building and history diff HTML sections.
- `src/ui/photo-gallery.js`: item/container photo gallery HTML, preview slides, dots, lightbox behavior, hydration, and photo status labels.
- `src/ui/settings-render.js`: settings/root-container/dictionary HTML render helpers.
- `src/ui/settings-editor-bindings.js`: layout/root-container settings editor event binding.
- `src/ui/dictionary-bindings.js`: dictionary editor event binding and rename orchestration helpers.
- `src/ui/shared-layout-render.js`: shared layout presentation HTML and shared layout weight helpers.
- `src/ui/items-view-render.js`: items tab list and catalog card HTML render helpers.
- `src/ui/packing-board-render.js`: packing board container/subcontainer/item card HTML render helpers.
- `src/ui/packing-drag.js` and `src/ui/packing-events.js`: packing board drag, drop, edge-scroll, and card event binding.
- `src/ui/packing-scroll.js`: packing board scroll sync and fixed horizontal scrollbar binding.
- `src/ui/settings-pointer-drag.js` and `src/ui/horizontal-touch-scroll.js`: settings drag reordering and horizontal touch scroll behavior.
- `src/ui/help-limits-dialog.js`: help/limits dialog content.

## Before Editing

- If the change is frontend runtime/UI/service-worker/cache visible, bump all three: `APP_VERSION`, `index.html` query strings, `sw.js` cache/assets.
- If touching `CRITICAL:` logic or flows in `docs/critical-flows.md`, run `npm.cmd run test:critical`.
- For normal frontend/runtime refactor slices, run `npm.cmd run check` and `npm.cmd run build`.
- In-app browser is unavailable in this environment; use checks/build/curl/dev server only, then ask for device/manual smoke when gestures or viewport behavior matter.

## Good Next Extractions

- Continue shrinking wrappers around layout placement and catalog operations once call sites are stable.
- Move UI render islands by screen/dialog only after state/sync operations are already modular.
- Keep drag/touch timing changes separate and guarded by critical tests/manual mobile smoke.
