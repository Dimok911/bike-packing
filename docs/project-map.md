# Bike Packing Project Map

Last updated: 2026-05-28, app cache v917.

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
- `src/state/regression-repair.js`: destructive sync/save regression repair from reference state.
- `src/public/admin-demo-layout.js`: importing and repairing published demo state as editable admin layouts.
- `src/public/published-state-export.js`: published/demo state export, generated/public id cleanup, and canonical published ids.
- `src/public/published-layout-save-flow.js`: admin demo/shared published layout save and photo publish orchestration.
- `src/public/shared-catalog-refresh-flow.js`: public shared/demo catalog refresh, runtime template reconciliation, and unconfirmed draft pruning.
- `src/public/shared-admin-merge.js`: admin-side merge of published/shared state and built-in shared entries.
- `src/public/shared-admin-materialize.js`: materializing shared templates into editable admin layouts.
- `src/public/guest-login-import.js`: guest local layout import planning, validation, and state mutation.
- `src/public/guest-login-handoff.js`: per-open guest session baseline/fingerprints, session-bound guest-work manifest, and short-lived magic-link receipt validation.
- `src/public/guest-login-import-flow.js`: one-shot post-auth guest import orchestration and persist-before-cleanup contract.
- `src/public/template-copy.js`: public/template copy source scoring and record builders.
- `src/public/template-copy-flow.js`: admin template-copy creation flow from local or published template sources.
- `src/public/copy-published-container.js`: published/shared container tree copy into editable state.
- `src/sync/save-body.js`: save payload preparation and admin/demo/template draft pruning for sync.
- `src/sync/list-freshness.js`: lightweight sync freshness metadata normalization/comparison.
- `src/sync/auth-load-flow.js`: auth check, offline fallback, and private remote load orchestration.
- `src/sync/load-remote-state-flow.js`: remote state load/merge orchestration flow with app runtime dependencies injected.
- `src/sync/run-sync-now-flow.js`: manual/queued sync orchestration and admin/public save routing.
- `src/sync/save-remote-state-flow.js`: remote save and save-conflict orchestration flow with app runtime dependencies injected.
- `src/sync/state-merge.js` and `src/sync/conflict-merge.js`: sync conflict and merge rules.
- `src/data/default-user-state.js`: built-in first-run/demo private user state.
- `src/ui/history-diff.js`: history comparison diff building and history diff HTML sections.
- `src/ui/photo-gallery.js`: item/container photo gallery HTML, preview slides, dots, lightbox behavior, hydration, and photo status labels.
- `src/ui/settings-render.js`: settings/root-container/dictionary HTML render helpers.
- `src/ui/settings-editor-bindings.js`: layout/root-container settings editor event binding.
- `src/ui/dictionary-bindings.js`: dictionary editor event binding and rename orchestration helpers.
- `src/ui/shared-layout-render.js`: shared layout presentation HTML and shared layout weight helpers.
- `src/ui/shared-virtual-events.js`: readonly/shared/template virtual layout event binding.
- `src/ui/static-translations.js`: static top-level UI translation application.
- `src/ui/sync-ui.js`: auth/sync/menu status DOM updates and sync visual-state application.
- `src/ui/filter-controls.js`: main filter/select/scoped-control DOM updates.
- `src/ui/item-dialog-save.js`: item/root-container dialog save state mutations and placement orchestration.
- `src/ui/items-view-render.js`: items tab list and catalog card HTML render helpers.
- `src/ui/packing-board-render.js`: packing board container/subcontainer/item card HTML render helpers.
- `src/ui/packing-drag.js` and `src/ui/packing-events.js`: packing board drag, drop, edge-scroll, and card event binding.
- `src/ui/packing-scroll.js`: packing board scroll sync and fixed horizontal scrollbar binding.
- `src/ui/settings-pointer-drag.js` and `src/ui/horizontal-touch-scroll.js`: settings drag reordering and horizontal touch scroll behavior.
- `src/ui/help-limits-dialog.js`: help/limits dialog content.
- `src/backup/restore-flow.js`: backup file import and restore orchestration helpers.

## Before Editing

- If the change is frontend runtime/UI/service-worker/cache visible, bump all three: `APP_VERSION`, `index.html` query strings, `sw.js` cache/assets.
- If touching `CRITICAL:` logic or flows in `docs/critical-flows.md`, run `npm.cmd run test:critical`.
- For normal frontend/runtime refactor slices, run `npm.cmd run check` and `npm.cmd run build`.
- In-app browser is unavailable in this environment; use checks/build/curl/dev server only, then ask for device/manual smoke when gestures or viewport behavior matter.

## Good Next Extractions

- Continue shrinking wrappers around layout placement and catalog operations once call sites are stable.
- Move UI render islands by screen/dialog only after state/sync operations are already modular.
- Keep drag/touch timing changes separate and guarded by critical tests/manual mobile smoke.
