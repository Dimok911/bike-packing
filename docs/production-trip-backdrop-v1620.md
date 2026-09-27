# Production v1620: soft trip photo backdrop

Application source: 50bef868eeef7c271b23b3532b21df8757d76e72, PR #34.

Trip cards use their first loaded thumbnail as a decorative background. A subdued image and a panel-colour gradient preserve text contrast; mobile uses a vertical fade. The backdrop follows the selected trip and clears when images are absent, unavailable, or hidden by the administrator. It is outside the gallery, ignored by accessibility tools and pointer events, and does not change the card geometry or scrolling. Existing thumbnail/object URLs are reused; no separate full-resolution background fetch is introduced. Reduced-transparency and forced-colour modes hide the artwork.

Validation: 897 critical checks, syntax check and production build passed. Existing trip/media browser suite: 10 passed, one existing WebKit Blob exclusion, one Chromium editor-fullscreen paging failure at layout-media.spec.js:119. The same failure reproduced with the previous HEAD module and stylesheet restored (v1619 source), establishing it is unrelated to this change; no gallery implementation changed. Final admin-variant scenario passed after the render synchronization adjustment. Browser logs retained under ftp-upload/v1620.

Exactly five changed application files; no photographs uploaded or moved. GitHub Actions not used per owner instruction. API unchanged; no shared-runtime change, server maintenance, or Experiment transfer.

| File | SHA-256 |
| --- | --- |
| app.js | A9AF02FEFB99ADD8C4990E69BBE9EB7DBD2E4264E281E91192F23B412531F86A |
| index.html | 9B95B20873A1C3F133A7CAE8BA3822F4A6A1883A9FCF0BF778CE40D5ADFA04DB |
| styles.css | 63CEF98688C777E15BB24747A235F23D89310951B6C1CD8F6BB4FBB19F4471C2 |
| sw.js | 74653AAA6FB6D4082C4455009005B74BE0A2E46B78A138BBA21A9FD99A93B191 |
| release-contract.json | E2E5BFFB42C94229F05B486B39F41B4F06C78B43404CA314569215DEEF1ACFAC |

## Publication and live verification

Published 2026-09-27 UTC. FTPS staging and public HTTPS hashes verified. Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1620-20260927T111825Z/.

Live v1620 shows the trip's loaded 520px thumbnail as its backdrop. Desktop card remains 360px tall; at 390px viewport it is 400px tall with no horizontal document overflow. Screenshots confirm readable links, headings and captions. Main-card fullscreen gallery successfully advances to photo 2. The previous editor-gallery arrow issue also persists in live Chrome: the second-image marker remained unset after the automation click timed out. It is not a backdrop regression and is retained here as an unresolved existing limitation. No trip data was edited or saved, and the original user tab was preserved. Temporary viewport override was reset and verification tab closed.

Screenshots in primary project: test-results/v1620-trip-backdrop.png and test-results/v1620-trip-backdrop-mobile.png. Evidence: ftp-upload/v1620/{critical,source,browser,final-browser,baseline,build,publication}.log and production-comparison.json.
