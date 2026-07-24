# Guest login handoff flow

This document fixes the contract for a visitor who does real work without an
account and later signs in, while preventing an old guest `localStorage`
snapshot from being copied into an account accidentally.

## Safety boundary

A raw guest snapshot is data, not permission to import it. Its presence alone
must never:

- modify authenticated account state;
- create layout, item, or container ids;
- set the account dirty flag;
- start a save or synchronization;
- clear guest storage.

Recovery snapshots and other backup/history payloads are never guest-login
sources.

## Explicit handoff

There is no extra confirmation dialog. The explicit user action is requesting a
magic link from the editable guest workspace.

1. Guest edits are saved in the unscoped `guest` storage as before.
2. Every time a guest workspace is opened, the app creates a new in-memory
   `sessionId` and captures a content fingerprint baseline for each existing
   layout. The session id is deliberately not recovered from an old manifest.
3. On a normal editable guest save, the app recomputes every layout against its
   session baseline. A layout is eligible only when its record, referenced
   items/bags, arrangement, or layout dictionaries differ. This also covers a
   non-active target layout changed through a picker. Pure timestamps, device
   metadata, and global display preferences do not authorize a stale layout.
   Reverting to the baseline removes eligibility.
4. Manifest v2 stores the current `sessionId` and only those changed layout ids.
   A manifest from another session is treated as empty, even when it contains
   ids from an old snapshot.
5. The app requests the magic link from the API.
6. Only after that request succeeds, the app writes a short-lived handoff
   receipt. A failed or offline request does not arm an import.
7. The receipt contains the current guest `sessionId`, normalized requested
   email, eligible layout ids, creation/expiry timestamps, and a fingerprint of
   the guest candidate.
8. Following the link may reload the page. The receipt and guest snapshot remain
   in `localStorage`, so the intentional handoff survives that reload.
9. The app activates the private `id:<user>` storage scope only after
   `/auth/me` confirms the real session and then loads the server account state.
10. Import proceeds only if the confirmed account email matches the receipt, the
   receipt is unexpired, all recorded layouts still exist, and the source
   fingerprint still matches.
11. The eligible guest layouts are copied as new private layouts. Name conflicts
   receive unique names; items and containers receive private ids.
12. The receipt is consumed after the local account copy is materialized, so
    repeated load/save/conflict paths cannot duplicate the same handoff.
13. Guest storage is cleared only after the server save succeeds and a fresh
    server read confirms the imported layout ids and their content.

An invalid, expired, account-mismatched, or source-mismatched receipt is removed,
but the guest snapshot and guest-work manifest are retained. An old guest
snapshot with no receipt is simply ignored. A stale manifest cannot be upgraded
into a receipt because its session id cannot match the new in-memory session.

The contract is identical for regular and administrator accounts.

## Save failure and retry

If remote confirmation fails after the account copy has been created:

- the copied account state stays locally saved and dirty;
- normal sync retry continues when the server is available;
- the guest snapshot stays intact as a safety copy;
- the consumed receipt prevents a second import and another set of ids.

The frontend validates imported layout ids and their item/container counts both
before save and in the state returned by the server. Clearing a dirty flag after
an aborted empty save is not confirmation.

## Offline behavior

Authenticated offline work is unrelated to guest handoff. It remains in the
user's `id:<user>` scope, becomes dirty, and follows the existing synchronization
flow after connectivity returns.

A signed-out guest can continue editing offline. Because the magic-link request
cannot succeed offline, no new receipt is created and no account import begins.
The guest data remain available. If a valid handoff was already created and the
link reload occurs while offline, import waits until `/auth/me` and the private
server state can be confirmed.

## Private copy contract

The server must never receive public/demo/shared identities as private records.
A valid import copies template content into the private namespace:

- private item/container ids do not keep public id prefixes;
- private layouts do not keep public catalog, visibility, or admin-source
  markers;
- layout arrangements reference only the copied private item/container ids.

Guest display preferences (`itemDisplayMode`, `showItemMeta`, and
`showFilterContext`) follow an otherwise valid layout handoff; changing those
preferences alone never authorizes an old guest layout.
