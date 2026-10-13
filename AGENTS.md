# Project routing

## Production working baseline

The main workspace was aligned to Production on 2026-10-13. Continue from
the current `codex/production-copy-undo-v1644` branch (live release v1655),
not the old local `main` baseline v1595. Before each new change and publication,
compare the working version/contract with the actual deployed version.
The earlier uncommitted workspace is preserved in the named Git stash
`workspace before production alignment 2026-10-13 copy undo` and in
`ftp-upload/copy-undo-v1644/workspace-before/`. Remaining unrelated local
media-copy changes are intentionally left uncommitted and are not part of v1645.
Do not reapply that whole stash over the current Production tree.

## Acceptance before Experiment transfer

Do not send or integrate the fullscreen gallery swipe/zoom fixes into Experiment
until the user explicitly confirms that the result is satisfactory and approves
the transfer. Production publication and passing automated checks do not imply
user acceptance. The user reported no visible improvement with v1602 on iPhone
and its earlier Experiment handoff was withdrawn. On 2026-09-09 the user accepted
v1603 / gallery 2.4.1 in the Shared Services task ("норм, принимается"). The user
then explicitly approved its Experiment transfer ("согласую"). Transfer of this
accepted version is authorized through the existing Experiment task, which owns
the integration sequence alongside its ongoing work. On 2026-09-11 the user also
accepted Production v1604 (desktop touchscreen fullscreen paging) and explicitly
approved its Experiment transfer: "ага, норм, закинь это в эксперимент для
выравнивания". The v1604 handoff was sent to the existing Experiment task;
integration and publication remain owned by that task. The user subsequently
accepted Production v1605 (desktop touchscreen/trackpad zoom) and approved its
Experiment transfer: "норм, отправь для выравнивания в эксперимент". The v1605
handoff was sent to the same existing Experiment task, which owns its sequence
and retains its separate publication constraints. Future fixes still require
acceptance and transfer approval.

## Incremental publication and photographs

For application code, style, and gallery behavior updates, publish application
files without photographs. Do not upload already published photographs again, include
them in a full-artifact deployment, or move/delete their existing directories.
Reuse the photographs already present on each destination. Transfer only new
or changed images when the user's task actually requires those image changes.

Before publication, compare the release with the deployed version and record
the exact files to transfer. Preserve recoverable backups of replaced files
and verify the changed files after upload. A deployment script's default full
upload is not a reason to republish unchanged photographs.

## Shared Services boundary

Work that changes a service or browser module shared by more than one VNIIPO
application must be split out of the Bike Packing task immediately and run as a
separate Codex task in the saved project named `Shared Services`.

This rule is pre-authorized by the project owner and applies in particular to:

- VNIIPO Auth and cross-application session/authentication contracts;
- Personal Tags API and its shared client contracts;
- `vniipo-photo-gallery` and anything published below `/shared-ui/`;
- any new backend, frontend runtime, or public contract intended for two or more
  VNIIPO applications.

Bike Packing-specific UI, its own API, and its app adapters stay in the relevant
Bike Packing Production or Experiment project. When one request touches both
an application adapter and a shared service, create two tasks: Shared Services
owns the shared implementation and publishes it first; the Bike Packing task
owns only the adapter and application release.

Every Shared Services change must be committed and pushed to its own repository,
reviewed through a GitHub pull request, and pass the repository's required
GitHub Actions checks before publication. Record the exact commit, pull request,
CI run, published version/hash, and rollback location in the completion report.
Never treat a server-only upload as the source of truth.

## Production static release retention

After a verified successful Production publication, retain five latest successful application releases including the live release. Count complete recoverable releases, not backup folder names: incremental backups have dependencies that must be retained or materialized into verified full snapshots.

Cleanup is for static hosting disk space below `/www/vniipo-help.ru/`, scoped to Bike Packing Production only. Before deletion, save an exact path/size/SHA-256 manifest, refresh the hosting inventory, check references from live/retained/shared resources, and create an off-host archive whose every file has been restored and hash-verified. Recheck the live version and candidate contents before deletion; stop on concurrent changes. Use the Production publication lock when running cleanup. Do not trigger GitHub Actions during the existing quota cooldown.

Photographs, user uploads, GPX/user data, databases, Experiment, shared resources and VDOC are excluded. Preserve mixed-content directories completely. Preserve active or unconfirmed staging/failed publications until separately established safe. Delete only reviewed application files; no recursive wildcard cleanup, no age/name-only decisions, and no assumption that GitHub or restic contains the actual deployed bytes. Preserve the cleanup archive and recovery manifest outside the managed worktree.

The initial cleanup and recovery tools are documented in `docs/production-retention-five.md` and the dated cleanup report. This policy is applied during publication work; it does not authorize an unattended scheduled cleanup.
