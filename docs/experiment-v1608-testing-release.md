# Experiment v1608 — candidate for gradual testing

Status: **not published**. The user authorized prioritizing manual Frankfurt
access and publishing the completed part to Experiment on 2026-09-12.
Production is outside this release.

The candidate starts at FE `59061ae662bd038a82ab536d15fd26d8eee15f9a`
and BE `92b17f4e4fbb75dd352b8d3096d73768534be390`. It preserves the
already published canonical-session changes from FE `f6bfcdaa` / BE `8ec12ca`.
The uncommitted photo-replacement work and six retained gallery/document/test
working files are excluded. Dedicated release worktrees preserve those edits.

The paired backend release is committed locally as
`fbc03422e961dc9c0e9ed3681db4ee03b48c32bf`; it is not pushed to GitHub.
Its selected canonical/cohort MySQL run passed 71/71. A separate 5/5 MySQL
probe verified the required table-scoped TRIGGER privilege and its limits.
Frontend source checks, 912 critical checks and 1535 transport checks passed.
The normal artifact passed 32 browser cases across Chromium/mobile WebKit.
After hiding the RU transfer button in EU mode, the rebuilt artifact passed
16 affected auth/route cases, plus four separate source transport cases.
The photo cases preceded that visibility-only change. Default CI explicitly
includes the new normal-artifact suites in both browser projects.
Frankfurt's isolated Nginx candidate passed 12 real anonymous-upstream checks
and 25 synthetic cookie/Origin/redirect checks; public activation is separate.

## First cohort

The ordinary build uses `scripts/experiment-release-profile.mjs` to activate
an explicit list of 21 causal gates plus manual EU, **only** when served from
`https://experiment.vniipo-help.ru`. Source defaults and separate test-build
configurations remain disabled unless their existing fixture explicitly enables
them. Production and local preview origins cannot activate the release cohort.
The build fails if a listed declaration is missing or ambiguous. The artifact's
`release-contract.json` records the profile, flags and required server capabilities;
the deployment script checks those additional capabilities before upload.

Included: personal list save/create/migration, staged photo forms and cancellation,
item/container form context, existing administrative DB operations and private
existing-owner photo append/delete/order. Automatic route choice is disabled.
Replacement in one save, administrative new photo owners, pending file imports,
photo copies, sharing, ZIP and other separately gated features stay disabled.
Those entry points may pause with a retained local draft; this is not completion
of the migration list or a promise of all previous actions in the causal mode.

## Manual Frankfurt and authentication

Both routes address the same Experiment API/database. Frankfurt must preserve
the complete `/experiment/letters-vniipo/api` prefix and use canonical upstream
Host/TLS SNI `api.vniipo-help.ru`; the retired Experiment-origin API is not a
valid writer. Proxy Origin/redirect/internal-route guards remain in force.

The RU host-only session cookie does not travel to EU. First use of EU requires
an explicit new login using the code from the email, through POST verification.
This creates a separate host-only EU session, without changing Shared Auth or
expanding cookie Domain. An email link may sign in on RU instead. Signing out
of EU revokes its session, not an independent RU session.

Switch the route only after ordinary saves are confirmed. The preference takes
effect after reload. An unresolved RU action does not authorize another POST or
an automatic login request on EU; its journal remains available, and selecting
RU again allows reconciliation with the original operation ID. No clear/retry
shortcut or automatic route failover is introduced.

## Checks before activation

- Exact candidate source, critical and transport checks, plus the real release
  bundle in Chromium/mobile WebKit with enabled Experiment-origin gates.
- Paired canonical-session API/client tests in disposable MySQL with exactly
  the selected server flags; source hashes recorded before and after.
- Fresh Experiment database backup, reviewed additive schema, isolated API
  staging, complete capability check, and pinned published baselines.
- Frankfurt loopback guards and synthetic upstream cookie/redirect checks.
- Successful `Frontend quality` for the exact published FE commit; checked
  source archive and frontend SHA-256 manifests.
- Application-only frontend publication, preserving the existing assets
  directory and user photo files, then public HTTPS/browser verification.

A schema backup is not permission to overwrite user changes. After causal
writes are accepted, reverting to an old API that ignores heads is unsafe.
On such a failure retain the new receipt-aware API and stop Experiment writes
while inspecting the failure; do not restore the database over new actions.

## User checks after publication

1. On RU, open a test layout, change a name and weight, wait for confirmation,
   and reload. Both values should remain.
2. Choose the European API route, reload, and sign in with the emailed code.
   The same test layout should be available.
3. Add two photos to an existing item or bag, change their order and main photo,
   delete one, and reload. Check both previews and the opened photos.
4. In a private administrative test template, check adding photos and separately
   deleting/reordering existing photos. Combined replacement is not included.
5. Disable the network, edit the test item, reload, then restore connectivity.
   Check that the pending change is retained and appears once after confirmation.
6. Repeat basic login, save and photo navigation on the physical iPhone/Safari.
   Automated mobile WebKit is not evidence that this physical-device check passed.

Record any failure with the selected route, action, displayed message and whether
the save was confirmed. Preserve local data and the pending journal.
