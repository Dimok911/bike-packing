# Project routing

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
