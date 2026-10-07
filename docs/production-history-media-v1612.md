# Production v1612: layout media and history — published

Published on 2026-09-26 UTC (2026-09-27 Moscow). Main site: https://vniipo-help.ru/bike-packing/.

## Published sources and recovery

- Frontend application source: e7b7cedb on codex/production-history-media; PR https://github.com/Dimok911/bike-packing/pull/34. This report is a subsequent documentation-only commit.
- API exact deployed SHA: d42beebe9c65d5b71c7f21b5ba36da47322746ac; PR https://github.com/Dimok911/bikepacking-api/pull/8.
- API artifact SHA-256: c3623319273ca3e38f3199b229e45fc5150b959b507a35ead84baa3018aabb4e.
- Previous API release retained: /opt/bikepacking-api/releases/1a9a742280c7b83f3a9575dcaf11935b81bef36f.
- Verified database backup and restore drill: /root/backups/bikepacking/bikepacking-20260926T222138Z.sql.gz.
- Frontend file backup: /www/vniipo-help.ru/bike-packing-backup-before-v1612-20260926T224055Z/.

GitHub Actions was explicitly waived by the owner. Checks ran locally and on the target Linux runtime; no Actions publication was used.

## Changes

The existing layout editor retains notes and adds file, clipboard, URL and drag-and-drop photo import; thumbnails, fullscreen preview, captions, ordering and a video link. Item and bag photo drop zones capture transfers correctly and show hover feedback. Existing v1611 notes and stock-location behavior remain covered by regression checks.

The history API reads metadata first and compares adjacent snapshots sequentially. Entity comparisons avoid unnecessary deep copies; settings comparison excludes catalogs/layouts before traversal. The frontend reports failed history requests instead of presenting an empty history. Layout photo ownership, copying and missing-photo history restoration are supported by an additive entity_type enum migration.

## Verification

- Frontend: source checks, 888 critical tests and 10 Chromium scenarios passed.
- API: 69 checks passed locally and under Linux/Node 24.
- Read-only real-history comparison: all 109 summaries across five pages match byte-for-byte (SHA-256 4b2939260bbd890afb4e891d174f77f90565fe2eeaf9c8718f9738113ab11a38). Measured time 2771 -> 1774 ms, peak RSS 96968 -> 89896 KiB, unchanged 32 MiB JavaScript heap.
- Standard exact-SHA pre/post/runtime resource gates, Auth/DB/public smoke and confirmation passed. PM2 state saved; automatic rollback timer disarmed by confirm-core-smoke.
- Production disposable layout-photo smoke passed upload, caption/video persistence, exact image retrieval and history. URL import from a public image on api.vniipo-help.ru returned HTTP 200 in 154 ms (56088 bytes).
- Browser verified v1612, the new editor controls and real private-history pagination: 24 visible versions, then 48 after loading more. No historical state was restored or modified.
- Only app.js, index.html, styles.css, sw.js and release-contract.json transferred. Preflight comparison, staging FTPS/HTTPS and production FTPS/HTTPS hashes passed. Zero photographs transferred or moved.
- All disposable test lists, PNG files and Auth sessions/accounts were cleaned.

## Memory and service coordination

Shared Services coordinated MySQL and sequential API maintenance with Experiment; existing configurations and security services were preserved. The Russian BP2 pilot remains disabled; ordinary Experiment is online. The maintenance window was returned after publication and cleanup.

Three earlier attempts rolled back automatically and were verified on the old release. The measured full-process budget is now 80 MiB PSS / 60 MiB private for both checks while the candidate serves traffic, since normal browser polling starts before smoke. The API uses MALLOC_ARENA_MAX=1; the JavaScript old-space limit stays 32 MiB. Global RAM, swap, working-set, pressure and OOM gates remain enabled.

Final rollout runtime sample: PSS 67200 / private 46060 KiB, available RAM 471664 KiB, free swap 148364 KiB, PSI 0. After real browser-history pagination: PSS 70307 / private 49232 KiB, available RAM 449476 KiB, free swap 163212 KiB, PSI 0. All five API health endpoints returned 200; no additional service changes are pending.

## Evidence

Local ignored evidence: test-results/production-comparison.json, v1612-ftps-publication.log, release-critical.log, release-browser.log. Browser screenshots are in the primary project test-results/v1612-live-layout-editor.png and v1612-live-history.png.

Server evidence: /root/bike-history-v1612-activation-optimized.log, /root/bike-v1612-production-layout-smoke.log, /root/bike-v1612-production-url-smoke.log, /root/bike-history-equivalence-{before,after}.json. Shared maintenance evidence: /root/staging/shared-memory-20260926/.
