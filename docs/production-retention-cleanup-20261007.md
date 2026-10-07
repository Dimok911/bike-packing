# Production hosting cleanup — 2026-10-07

Completed and verified at 22:11 Europe/Moscow. Removed **1,604 obsolete application files, 540,592,541 bytes (540.6 MB)** from Bike Packing Production on the static hosting vniipo-help.ru. This is hosting disk cleanup, not a change to the app, API or server RAM.

| Production storage in the measured roots | Bytes |
| --- | ---: |
| Before | 827,898,648 |
| Removed | 540,592,541 |
| After | 287,306,107 |

The current **v1643** and four preceding successful releases **v1642, v1641, v1640, v1639** remain recoverable. After cleanup, all **27 distinct source files** needed for five complete eight-file snapshots passed SHA-256 checks. Live hashes match the published release. The final FTPS inventory confirms zero selected files remain and no missing/size-changed protected Production files.

## Recovery archive

Archive outside the managed worktree and outside hosting:

C:/Users/user/Documents/GitHub/Dimok911/bike-packing/ftp-upload/retention-20261007/bike-packing-historical-code-20261007.zip

- Compressed size: **143,077,150 bytes**.
- SHA-256: 2A4B5696BF6B82D9A7C6EDE92863E78AEF47BCADB900A55C544A02F6FC407F7B.
- **Every one of the 1,604 files was extracted and its size/SHA-256 verified before deletion.**
- Adjacent .manifest.json and .verification.json preserve exact paths, hashes and recovery proof.
- This operation used the independently verified local archive; it does not assert restic coverage. The ZIP is ignored by Git and was not published to GitHub.

The [exact removal manifest](production-retention-removed-20261007.json) records each file and hash. To roll back cleanup, verify the ZIP hash, extract the selected entries, upload them using the approved pinned FTPS flow to /www/vniipo-help.ru/ plus their recorded relative paths, then verify remote hashes. Do not overwrite a path that has since acquired different content. Restoring historical backups does not require activating an old application release.

## Preserved material

- Live files: 2,420,736 bytes.
- Required incremental backup dependencies: 9,446,489 bytes.
- Two mixed/unknown-content directories: 234,657,381 bytes. The old v1594 staging directory includes about 224 MB of photographs and is fully preserved; the mixed v1399 backup is also preserved.
- Twenty staging/failed-publication directories: 40,781,501 bytes. Their ownership/activity was not established sufficiently for removal.
- Photographs, GPX/user data, databases, shared services, Experiment and VDOC were not modified. Only explicitly manifested application files were deleted. No recursive directory deletion occurred; empty historical directories remain.

Reference checks covered 833 current/protected static files and an additional audit of 172 kept Production files and hosting routing rules (these sets overlap). No references to selected backup roots were found. This checks deployment/runtime/routing dependencies, not arbitrary external bookmarks or runtime user-authored API content. Static files were read through HTTPS with cache bypass. PHP/routing source, inventories and all deletes used pinned explicit FTPS. An FTPS app bundle was verified byte-for-byte against HTTPS before switching bulk static reads to HTTPS.

Connection timeouts interrupted prechecks and one deletion pass. Cleanup stopped on errors. Continuation compared a fresh inventory with the unchanged original manifest and verified archive, recovered any completed portion of the interrupted batch, and rechecked remaining files. FTP commands subsequently used a metadata-only transfer to avoid an unnecessary directory listing after deletion. Final verification completed successfully.

## Policy and validation

The five-successful-release policy is saved in AGENTS.md in the Production checkout and working worktree. It includes live and protects incremental dependencies. The normal publisher now refuses to start while the local cleanup lock beside configured SFTP settings exists. Live content checks also guard cleanup. This is not an unattended global retention job; other publishers/hosts must coordinate separately.

13 targeted checks passed: 10 retention guard/recovery-chain/resume cases and 3 deployment checks. A real PowerShell invocation verified that publication stops at the cleanup lock before credential/network handling. An archive self-check covered successful recovery and rejection of changed source. The actual 1,604-file recovery drill and post-cleanup hosting verification passed. No application rebuild/publication was needed. GitHub Actions were not used under the quota cooldown.

Operational evidence remains in ftp-upload/retention-20261007/: before/after inventories, reference audits, prepared manifest, archive proof, progress/continuation journal and retained-release hash verification. The original [dry run](production-retention-dry-run-20261007.json) remains unchanged as historical evidence.

Use a unique operation directory and archive name for every future run. The plan/verify scripts are read-only. The cleanup script's prepare and audit-kept modes only read hosting; apply requires a verified archive and exact manifest; resume additionally validates previous progress against a fresh inventory. Never reuse an old deletion manifest for a later release.
