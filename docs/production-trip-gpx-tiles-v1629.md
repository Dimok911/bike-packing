# Production trip GPX and media tiles v1629

Source: 4ec065b846f13ce621bd412b21e693f2d338ce30. PR: https://github.com/Dimok911/bike-packing/pull/34.

Published on 2026-10-02. Trips have separate square photo/video tile groups, overflow counters and full photo/video navigation. A trip accepts a GPX track, retains its geometry through edit/save/sync, shows a preview and opens a larger map dialog. Track edits enter history; copying layouts still omits trips. No API schema or shared service changes.

## Remaining configuration

**Yandex Maps is not activated.** The owner confirmed that no API key exists. Production therefore shows an explicitly labelled local track schematic. The Yandex adapter is implemented and tested with a mock SDK; real map tiles, credentials and provider access have not been verified. Activation requires the owner to create a domain-restricted JavaScript API key and configure `VITE_YANDEX_MAPS_API_KEY` before a subsequent build/publication. See [configuration and GPX limits](trip-gpx-maps.md). No Strava integration or embedding is included.

## Verification

915 critical tests, source check, build and six version tests passed. GPX import (including invalid replacement), persistence, discard/removal, trip isolation, tiles with hidden-photo fullscreen navigation, video navigation and map adapter creation/destruction passed in Chromium and mobile WebKit. Existing upload and badge checks passed. Old horizontal-overflow and copy-story assertions were updated to the requested tile and gear-only-copy behavior; upload preview checks now inspect the four visible previews while still verifying all 16 uploads and cached originals.

The full 36-case media suite initially had five failures and six existing environment skips. Four failures came from those obsolete expectations and passed after their updates. One existing Chromium modal-gallery next-arrow test still fails at line 119. It was reproduced against unchanged HEAD v1628 source (same assertion), with all working source edits backed up and restored; this is not claimed fixed. Mobile WebKit's equivalent scenario passes. Baseline diagnostic log: ignored `ftp-upload/gpx-baseline-check/result.log`.

On the deployed site, verified v1629, the existing trip's 17-photo gallery through the +13 tile, navigation to photo 17 (active dot and disabled next button), and the separate GPX upload control. The user's editor was closed without saving; the original collapsed-panel preference was restored. No user's GPX was uploaded during verification.

## Deployment

Incremental pinned FTPS verified staging and live HTTPS hashes. Exactly five changed app files transferred; zero photographs. Recoverable backup:
`/www/vniipo-help.ru/bike-packing-backup-before-v1629-20261002T174100Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | DE2119B9287377D3C4B0ACD1FCCC957B38935BCBB0F453D5B14636653DCEA338 |
| index.html | A465E131506A0124EE3B72904C372B7D889B1DE7AA1C8E75A5F5DA61B94BFD37 |
| styles.css | A7C68654A3D5EE8272293E80053975946818B5989E67F4BC4BF1735CFFE451BD |
| sw.js | 63CDCBBEFBB46F176F45383621493765E8F0F92AC6772E35D8B7B2BAD4817700 |
| release-contract.json | 2252DCFB6919B79FDD6781110A958426948F089E7265B894952C949B1E6B6565 |

No GitHub Actions, server service restart, shared-runtime publication or Experiment handoff.
