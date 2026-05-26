# Guest login import flow

This document fixes the contract for a new user who starts without an account, edits a local demo-based packing layout, and then signs in or creates an account.

## Expected flow

1. A signed-out visitor opens the app in the selected UI language.
2. The app loads the first server-confirmed demo template for that language.
3. In the normal editable app mode, the app creates one local guest layout from that demo template.
4. The guest layout is a private local copy, not a public template. Its items, containers, layout id, and layout arrangement must be private ids before sync.
5. Automatic guest copies should prefer the server-confirmed template catalog title over the payload layout title. For EN, the first demo title is `Demo-packing`; a mojibake payload/local title must not become the private guest layout name.
6. Reopening the app signed out must reuse the same guest demo copy instead of creating another copy.
7. The guest can edit the layout locally. Those edits stay in the guest storage scope until auth is confirmed.
8. When `/auth/me` confirms a real user session, the app switches to that user's private storage scope and compares the guest candidate with the account's existing layouts.
9. If the account already has a layout with the same normalized name, the guest layout is imported automatically under a unique name.
10. Imported guest layouts are saved as normal private user layouts and then pushed to the server.
11. After import, the active layout should be the imported private layout, not the public demo template.
12. If an older build loaded the account and lost the in-memory pending guest candidate, the app must still recover the candidate from the saved `guest` storage scope after the private account state is loaded. After the guest layouts are successfully saved to the account, the imported guest scope snapshot can be cleared to prevent duplicate imports.
13. The guest storage scope may be cleared only after the app verifies the imported layout ids in the remote state returned by the list API. A local empty-save abort is not success, even if it clears the dirty flag.

## UI preferences

The guest's display preferences are part of this handoff. When a guest signs in, the account view must keep the guest settings for item photos, item labels, and filter context:

- `itemDisplayMode`
- `showItemMeta`
- `showFilterContext`

Changing only these display settings is enough to make the automatic guest demo copy worth importing. Otherwise a user could turn photos/labels on or off before login and lose that visible state immediately after login.

## Server contract

The server should never persist public/demo/shared entities into a private list. A valid guest import must copy public template content into private records before save:

- no private `item.id` or `container.id` may start with `demo-`, `admin-demo-`, `shared-`, or `admin-shared-`;
- no private layout should keep public markers such as `adminDemo`, `adminSharedSourceId`, `publicCatalogLayoutId`, `sharedSourceId`, public `listId`, or public `visibility`;
- the private layout arrangement must point only to private copied item/container ids.

If this contract is broken, the API can reject or filter those records during list assembly, which looks in the UI like a layout that appears after login and then disappears or becomes empty after the next server refresh.

## Empty import guard

The exact failure mode seen in v839 was: guest layouts appeared locally after login, `saveRemoteState()` detected a suspicious empty packing state (`0 items`, `0 containers`) and did not send it to the server, then `saveGuestImportToRemote()` treated the cleared dirty flag as a successful save. That allowed the app to clear the guest storage scope even though the remote account never returned the imported layouts.

The frontend contract is now:

- before saving, validate the imported layout ids against local counts;
- after saving, fetch the remote state and validate that the same imported layout ids are present with copied content;
- keep the account state dirty and keep the guest storage scope if either check fails.

## Production diagnostic notes, 2026-05-26

The production public catalog at `https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/public-templates` returns UTF-8 JSON with correct Cyrillic template titles. The current deployed API capability version is `2026-05-26.public-template-photo-reference-copy-v1`.

If the UI shows mojibake such as `РЎРµ...`, first check whether the broken text is already in a private user's saved payload or localStorage. The public demo row `public-demo-state` currently returns the correct title `Демо-укладка`.
