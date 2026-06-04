# Critical flows

These flows are treated as app contracts. A change that touches a `CRITICAL:` marker
or one of the files listed here should run `npm.cmd run test:critical` in addition
to `npm.cmd run check`.

## CRITICAL: offline-start

- A cached app shell must open without internet on iOS/PWA.
- `sw.js` must refresh navigation HTML from network while online, then fall
  back to cached `index.html` while offline.
- A service worker update must activate a waiting worker via `SKIP_WAITING`,
  otherwise iOS can keep an old cache active for offline launches.
- Versioned browser assets must stay aligned across:
  - `src/config/constants.js` -> `APP_VERSION`
  - `index.html` -> `styles.css?v=...` and `app.js?v=...`
  - `sw.js` -> `CACHE_NAME` and `ASSETS`

## CRITICAL: offline-auth-scope

- If a user did not explicitly sign out, offline startup should open the same
  local private storage scope that was used while online.
- Remembered scope lookup priority:
  - exact saved auth storage scope
  - direct `id:<user-id>` / `email:<email>` scope
  - legacy scope matched by `syncMeta.accountEmail`
  - the only private scope on the device, if there is exactly one
- Explicit sign-out must disable private offline access.

## CRITICAL: offline-photos

- When offline or forced-offline, photos with local `id/localId` should prefer
  IndexedDB object URLs over remote `thumbUrl/url`.
- Remote-only photos can only appear offline if they were already cached by the
  browser or copied into IndexedDB.

## CRITICAL: touch-click-timing

- Touch/click/drag delays are fragile on iPhone and were tuned by hand.
- Do not change timeout constants or literal delays around tap, double-click,
  hold-to-drag, nested container open/close, drag start, or touch cancel unless
  the exact regression requires it.
- Current sensitive values include:
  - `TOUCH_DRAG_DELAY_MS`
  - `TOUCH_DRAG_CANCEL_DISTANCE`
  - `TOUCH_SCROLL_CANCEL_DISTANCE`
  - `NESTED_GROUP_HOVER_DELAY_MS`
  - the `180ms` single-click delay used for desktop subcontainer title
    double-click editing
- If a mobile tap feels late, prefer input-type branching (`touch/coarse pointer`)
  over changing shared desktop timing.
- After touching this area, check at least: tap nested bag title, tap nested bag
  arrow, double-click/desktop rename, hold-to-drag, scroll cancel on iPhone.

## CRITICAL: sync-save

- Local changes made offline must remain dirty and should not be overwritten by
  remote state until auth and server freshness are checked.
- Suspicious empty local states must not be uploaded over meaningful server data.
- Background freshness polling must not fetch the full list payload. Use a
  lightweight metadata endpoint first, and fetch `/state` only after
  `updatedAt`/`stateRevision` changes or when the lightweight check is
  unavailable.

## CRITICAL: template-copy-delete

- Shared/demo copy and delete flows involve frontend and `bikepacking-api`.
- If API behavior changes, bump backend compatibility and frontend required
  version/capabilities together.
- Layouts and public template drafts must not share container/item entity ids.
  Old payloads may already contain linked roots, nested containers, or items, so
  state normalization must isolate those ids before delete/copy actions run.
