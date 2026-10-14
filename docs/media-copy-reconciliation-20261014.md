# Unpublished media-copy changes reconciled — 2026-10-14

Baseline: `99673c1fb1ca1ff62e0f9dbaef435234901f7354`, live v1657.
This is workspace reconciliation only; no frontend/API publication or version bump.
Experiment was not modified. No GitHub Actions, push, or mail operation was run.

## Origin and decision

Three files contained seven unpublished added lines:

- `app.js`, `copyPublishedDemoStateToLocalLayout`: copied layout photos/video.
- `src/state/layout-manage.js`, `createManagedLayoutCopyRecord`: same fields.
- `src/public/shared-layout-copy-flow.js`: imported/spread `layoutMediaSnapshot`.

These additions match the old workspace preserved in stash
`75733783612390db4860b87588ef264965a8d8c4`
(`workspace before production alignment 2026-10-13 copy undo`). The complete
shared-copy file had blob `0808348b34f657977e7d7819fc3e40f20cb1fc1a`, identical
to that stash and to the file before v1628.

Commit `6c2367fdde50f168ca01c6afbf51fb81b7a2c09c` deliberately removed story
copying in v1628. The leftover additions partially reversed that accepted rule
and failed the existing tests. Removed only those additions, restoring all
three files to their committed v1657 contents. No tests were weakened or changed.

Copying a gear layout preserves its arrangement and item/bag photographs and
notes. It starts without trips, layout photos/video, or legacy story fields.
The source layout's trips/media remain intact.

## Recovery

Before editing, saved an exact patch, all three original files and their
SHA-256 manifest outside managed worktrees under the primary checkout:
`ftp-upload/media-copy-reconciliation-20261014/`.

Patch: `unpublished-media-copy.patch`, SHA-256
`67ed5939a17fd1f94759d26da7b4064f7743a1db32920b5a026215e3ac6fd51c`.
`git apply --reverse --check` succeeded before removal and `git apply --check`
succeeded afterwards. Original bytes are also preserved in `before/` and
verified against `backup-manifest.json`. Do not reapply this obsolete behavior
without a new product decision. The original stash remains intact.

## Validation and deployment decision

- Reproduced 183 passing / 2 failing profile tests before correction.
- Afterwards: all 185 tests in `layout-media.test.js` and
  `template-copy-source-chain.test.js` passed.
- All 970 critical tests and `npm run check` passed.
- Existing browser copy scenario passed in both Chromium and mobile WebKit:
  arrangement, item/bag photos and notes retained; copied layout has no trips
  or story photos; original layout remains intact.
- Rebuilt application from the corrected main checkout. All eight artifact
  files match live v1657 through pinned FTPS; static responses also match HTTPS.
  Comparison result: `changed: []`, so there is nothing to publish.
- Browser tests used isolated temporary contexts and closed them on completion.

Logs and comparison manifest are in the same ignored evidence directory.

## Experiment handoff

There is no new application diff or release to cherry-pick. Keep the accepted
v1628 behavior already present in the committed Production v1657 source.
Do not transfer the seven unpublished additions or the recovery patch. If
Experiment has already aligned with v1657, no runtime integration is needed.
Only this report and the updated workspace guidance are new committed content.
