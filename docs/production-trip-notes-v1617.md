# Production v1617: trip descriptions, private notes and multiple videos

Release source: c1f88aa2ec676d331b0e92674539596e7a6d2dd7 (PR #34).
API source: 0dc79b017f8d56bb21eef4b19b4b3dfab93335d8 (API PR #8).

## Behavior

Each trip has separate rich Description and Notes editors. Existing text remains the description. Notes are excluded from sharing by default; an explicit checkbox includes them in the publication. Owners and authorized editors retain the original notes. Anonymous readers and viewers only receive explicitly published notes. The API applies the rule to assembled reads, entity rows, incremental changes, public templates, snapshots, entity links and imports; viewers cannot retrieve private history. Turning sharing off again affects live publications; existing immutable snapshots retain their published contents.

Trips support multiple ordered video URLs, with per-link removal and protocol validation. The first URL remains mirrored in the legacy field. The delete confirmation reads “Удалить поездку”. Expanded trip cards have a stable height (360 px desktop, 400 px mobile bounded by viewport), with internal scrolling. Changing trips resets the internal scroll; existing collapse preferences and photo display options remain intact.

## Validation

- 897 frontend critical tests, JavaScript source checks and production build passed.
- 28 applicable browser scenarios passed across desktop Chromium and mobile WebKit, including captions/order/fullscreen, per-trip assets, public view, multiple videos, private notes, stable geometry, persistence, rich formatting and editing links in both text fields. Two existing Windows WebKit Blob/draft tests remain skipped; Chromium covers those paths.
- 72 API checks passed locally and on Node 24 Linux. Nine isolated HTTP/MySQL tests passed, including anonymous/foreign-owner privacy, feeds, snapshots, entity links, import, publication and revocation. Disposable database and database user removed.
- GitHub Actions not used, as explicitly requested. Commits pushed with skip CI.

## Publication

Published on 2026-09-27 UTC at https://vniipo-help.ru/bike-packing/.

- API artifact SHA-256: a557603677f5078c3742ba7bd39804206318c7dfccc59a2be16a2760aa8e3088. Built on Node 24 from a clean exact-SHA checkout; verified and prestaged before activation.
- API rollback release: /opt/bikepacking-api/releases/d42beebe9c65d5b71c7f21b5ba36da47322746ac.
- Database backup: /root/backups/bikepacking/bikepacking-20260927T102845Z.sql.gz; restore drill and isolated runtime grants passed.
- Pre/post/runtime resource gates, Auth/DB/public smoke and final confirmation passed. PM2 saved; rollback timer disarmed. Runtime sample: available RAM 408712 KiB, free swap 144648 KiB, candidate PSS 68574 KiB / private 47576 KiB, PSI 0. Heap and resource thresholds unchanged.
- Production HTTPS privacy smoke passed: anonymous full state, entity rows and change feed exclude hidden text and HTML, owners retain it, snapshots exclude it, opt-in includes it and revocation hides it again. Disposable lists, Bike principal and Auth session/account cleaned.
- Frontend transfer: only app.js, index.html, styles.css, sw.js, release-contract.json. Exact preflight comparison recorded in ftp-upload/v1617/production-comparison.json; staging and production FTPS/HTTPS hashes verified. Zero photographs transferred, moved or deleted.
- Frontend rollback: /www/vniipo-help.ru/bike-packing-backup-before-v1617-20260927T103353Z/.

Shared Services performed the user-authorized MySQL maintenance with Experiment coordination: seven seconds, unchanged configuration, all five API processes retained. API publication followed the completed maintenance window. No shared implementation changed and no Experiment transfer was performed.

Ignored evidence: frontend ftp-upload/v1617/{critical-final,source-final,complete,regression-final,photo-final,publication}.log; test-results/v1617-* screenshots. Server logs: /root/bike-trip-notes-v1617-{check,integration,artifact,preactivation,activation,public-privacy}.log; maintenance /root/staging/shared-memory-20260927/maintenance.log.

Live browser verification confirmed v1617, all three existing images loaded, two rich editors, notes publication unchecked, unchanged editor save disabled, and a 360 px desktop card. User-owned editing tab was preserved; verification used a separate tab without saving personal changes. Screenshot: primary project test-results/v1617-live-trip-notes-visibility.png.

## Frontend SHA-256

| File | Published hash |
| --- | --- |

| app.js | 124BB9709925BB4E0B61104CF585B9B205A3B80CEFAB2F2F62271A5E09B71F11 |
| index.html | ECF9B3E6F20360E815B1D175863C1A30E520743620EB8A6DB8FFF1A0DEDFBCB0 |
| styles.css | F2F4E135220DC167413D062EA740179F9520413950A69BF293054EE2AFF9ACA5 |
| sw.js | 68222842AA650BDE40B17D56625FB37CEF2A73A33C863118C1CA2964AFA82542 |
| release-contract.json | 2DB078C297AFA04F671F1492811B0976D7EF752014D85C929ABD15F28297600D |
