# Production v1612 candidate: layout media and history

Status: prepared, not published. Production remains v1611 and API 1a9a742280c7b83f3a9575dcaf11935b81bef36f.

History failure was reproduced in the authenticated production browser on 2026-09-26. The main list history request returned Nginx 502 after Node exhausted its 32 MB old-space heap. An unrelated empty test list succeeded, and the frontend suppressed the failed request and displayed an empty history. Read-only database diagnostics confirmed 109 stored snapshots (about 47.7 MB combined, largest about 494 KB).

The API candidate loads metadata first and processes adjacent snapshots individually. The frontend reports a failed history load if any list request fails. Layout editing includes file/paste/URL/drop imports, highlight feedback, captions, ordering, fullscreen previews and a video link. Item and bag photo fields also accept drops. Existing v1611 rich notes and stock-location UI are preserved.

Validation: frontend source checks and all 888 critical checks passed. All 10 Chromium browser scenarios passed (layout media, all input methods, item/bag drops and rich-note regressions). API local checks: 68 passed, including history pagination and 25 large snapshots in a subprocess limited to 32 MB. Expired layout-photo references are handled during history restoration.

GitHub Actions was attempted but did not start because of account billing. The owner explicitly authorized proceeding without Actions. API PR: https://github.com/Dimok911/bikepacking-api/pull/8. No API activation, database migration, frontend upload, or history restore has been performed.

Release is held on server resources. Observed total RAM: 1024 MB; available RAM: 86–142 MB; swap used: 255/256 MB. The existing release protocol requires pre-start available RAM >=384 MB and free swap >=128 MB. Experiment API measured roughly 60 MB private RAM and <1 MB swap. Removing that process alone is unlikely to meet the gate. The candidate check started in a separate server directory was stopped to release its temporary load; production services were not stopped or changed. Local checks completed successfully.

Resume: re-measure resources after Experiment cleanup; build/prestage the exact API commit, take and verify a backup and restore drill, apply docs/migrations/2026-09-26-layout-photos.sql, pass release gates and activate API with rollback. Verify authenticated history and layout-photo uploads. Then transfer only changed frontend application files, with recoverable file backups and FTPS/HTTPS hash verification. Do not transfer photographs or move their directories. Keep the 32 MB API heap limit unchanged.