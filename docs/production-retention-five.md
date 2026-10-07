# Bike Packing Production: five-release retention

Status (2026-10-07): applicable; dry-run and retained-release recovery drill complete. **No hosting files deleted, no automatic cleanup enabled.** This is a separate operational plan, not an application release. Scope: disk space on the static hosting `vniipo-help.ru`, below `/www/vniipo-help.ru/`; not VPS RAM.

## Policy

Keep the five latest *successfully published and verified* application releases, **including live** (currently v1643, v1642, v1641, v1640, v1639). A backup directory is not necessarily a complete release: current incremental deployments preserve changed files only. Retain every dependency needed to reconstruct each release, or first replace that chain with verified complete application snapshots. Publication success is evidenced by the deployment log, file-comparison manifest and matching hashes, not by a directory's name/date.

Photos, user uploads, GPX/user data, databases, shared resources, Experiment and `_releases/vdoc` are outside this retention rule. Mixed-content directories remain protected in their entirety. GitHub source is not proof of recovery of user data or historical deployed bytes. Restic coverage of these hosting paths has **not** been established.

## Verified dry run

The immutable pre-retention hosting inventory is the input. The exact candidates (every file path and size), protected directories, evidence digest and blocking conditions are saved in [production-retention-dry-run-20261007.json](production-retention-dry-run-20261007.json). This manifest is a review artifact, not an executable delete list.

| Category | Directories | Files | Bytes |
| --- | ---: | ---: | ---: |
| Live v1643 — keep | 1 | 8 | 2,420,736 |
| Dependencies for four earlier retained releases — keep | 4 | 19 | 9,446,489 |
| Mixed/unknown contents — protect | 2 | 2,709 | 234,657,381 |
| Code-only historical candidates — blocked pending checks | 238 | 1,707 | 581,374,042 |
| Total | 245 | 4,443 | 827,898,648 |

Mixed directories:

- `/www/vniipo-help.ru/bike-packing-stage-v1594-20260902T164105Z/`: 228,693,555 bytes; includes about 224 MB of photographs. Do not remove this directory under code retention.
- `/www/vniipo-help.ru/bike-packing-backup-v1399-20260725233801/`: 5,963,826 bytes; files outside the reviewed application-file allowlist. Keep pending a separate content/reference review.

At 2026-10-07 18:14 UTC, 27 distinct required source files were downloaded from the pinned FTPS endpoint and SHA-256 verified. The five full eight-file releases were assembled into isolated local recovery folders, and **all 40 resulting files** were verified against their recorded release hashes. HTML versions and release contracts match. Live source files were read again to detect a concurrent publication; public HTTPS hashes match for static files (PHP source checked via FTPS because HTTPS executes it). This tests file recovery, not an old-version production activation or API/shared-service compatibility.

Evidence and restored files are retained locally under `ftp-upload/retention-20261007/` (ignored, not uploaded): `plan.json`, `release-evidence.json`, `recovery-verification.json`, `download/`, `restore-drill/v1639` through `v1643`. Do not remove these evidence files until the cleanup and backup policy are settled.

## Remaining work before actual hosting cleanup

- [x] Isolate Production and protect current files, photos and release dependencies.
- [x] Identify five successful publications; verify complete file recovery.
- [x] Save an exact, reproducible dry run; test scope and integrity guards.
- [ ] Coordinate a publication lock and refresh inventory immediately before execution; preserve active/unknown staging and all empty directories not covered by the file inventory.
- [ ] Review references to candidate roots from current/retained/public/shared resources. A name containing backup/stage/previous/failed is not evidence of disuse.
- [ ] Archive **every candidate file** outside this hosting with path, size and SHA-256; verify restoration of that archive. Alternatively prove matching restic snapshot coverage by restoring and verifying the concrete files. This has not yet been done for the 1,707 candidates.
- [ ] Produce the final hash-bound deletion manifest after those checks. Recheck live version and each candidate immediately before a narrowly scoped deletion; abort on changes. Never recursively delete by wildcard, age or root-name prefix.
- [ ] Remove only the validated files, verify reclaimed bytes and live HTTPS hashes, record the removal manifest and rollback/archive location.
- [ ] Integrate future cleanup after successful publication only, with complete manifests/dependency protection and the same gates. Do not add an unconditional “keep five directories” step to the publisher.

Rollback of cleanup: restore each removed file to its exact former remote path from the verified off-host archive and recheck SHA-256. Do not deploy an old release to the live directory merely to undo archive cleanup. Normal application rollback remains the existing incremental deployment procedure with compatibility checks.

## Reproduction and checks

From the Production worktree:

```powershell
node scripts/production-retention-plan.mjs 'C:/Users/user/Documents/GitHub/Dimok911/letters-STU-Base-Edit/.tmp-search-sync/hosting-files-inventory-before-retention.json' ftp-upload/retention-20261007
node scripts/production-retention-verify.mjs ftp-upload/retention-20261007 'C:/Users/user/Documents/GitHub/Dimok911/bike-packing/.vscode/sftp.json'
node --test tests/critical/production-retention-plan.test.js
```

Both scripts have **no remote mutation or deletion mode**. Verification reads credentials only from the ignored config, sends them to Windows curl through UTF-8 stdin, and uses approved explicit TLS, passive mode and the pinned server key. The planner fails closed on missing recovery sources, manifest-chain mismatches, changed live file sets and unsafe paths. Seven meaningful checks cover delta dependencies, photo/mixed-directory protection, Experiment/VDOC/shared isolation, path/size/duplicate guards, missing/hash-mismatched backups, successful-release requirements and corrupted recovery data.

GitHub Actions remain paused until 2026-11-07 under the owner's quota cooldown. This task requires no application/API/shared-service deployment.
