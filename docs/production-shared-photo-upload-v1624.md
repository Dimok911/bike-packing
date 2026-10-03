# Production shared photo uploader v1624

App integration: 0556e0b0fd5fd9abb5e84ed923b65c27fe43d4dd. Vendor line-ending pin: 26c858fc. Deployment correction: 5cd6ccbcc908bfe470baadc55ed5bc7f4978ae83. Application PR: https://github.com/Dimok911/bike-packing/pull/34.

## Shared module and application boundary

Bike Packing now bundles the pinned photo-upload-engine 1.0.0 ESM artifact. The existing iPhone/iCloud materialization, validation, image preparation, retry and progress mechanisms were extracted rather than rewritten. Trips, items and bags delegate to the same module; application-specific IndexedDB/account scope, API/authentication, entity ownership and server synchronization remain in Bike Packing adapters. Personal background uploads retain concurrency 1 and account/entity ownership guards.

Shared repository: https://github.com/Dimok911/vniipo-photo-upload-engine (private). PR: https://github.com/Dimok911/vniipo-photo-upload-engine/pull/1. Published implementation commit: 0bbd474; final documentation commit: 6f999b5c42dcfd8ea8a10fe865335a70a2e5f05c. Artifact: https://vniipo-help.ru/shared-ui/photo-upload/v1.0.0/index.js. SHA-256: 8bd6e23f5aeb865f4971a93d1dc04d243f919b3abbb02da532f7ea8dc2124c2f. Public bytes independently matched the vendored artifact. No runtime CDN dependency.

Shared task: 01a0e32c-5e50-7e10-90f8-7f7ac04270cf. Its report records 16 Node checks and real Chromium/persistent WebKit preparation/storage tests. Actions are disabled per owner instruction, with no CI run. PR exists for review; no independent approval is claimed. First immutable shared release has no prior-version backup; reserved withdrawal path: /www/vniipo-help.ru/shared-ui/photo-upload/v1.0.0-withdrawn-20260927T141854Z.

## Verification

900 critical tests passed after integration; all 125 offline-photo tests passed after adding the pinned adapter regression. Five final Chromium scenarios passed: trip draft switching; one then fifteen photos with preserved progress/decoded thumbnails; separate item batches; separate bag batches; native horizontal touch gesture over trip thumbnails. Source check and six release-version checks passed. Two deployment tests passed, including executing partial/full verification and rejecting an unchanged-file mismatch. Physical iPhone/iCloud verification remains with the user.

Live authenticated browser confirmed v1624 and all 15 existing trip photo elements. v1623 already verified their successful image decoding; this release preserves its fixes. The first disappeared pending photo was not recovered; no user photos were modified by verification.

## Publication and rollback

The first staging attempt stopped before activation because verification expected unchanged styles.css in the partial staging directory. The corrected script checks only staged files there, checks unchanged app files on production before activation, and verifies the complete app after activation. Both FTP and public HTTPS hashes passed on retry.

Transferred only app.js, index.html, sw.js and release-contract.json. styles.css is unchanged and verified in place. Zero photographs transferred, moved or deleted. Backup/rollback to v1623: /www/vniipo-help.ru/bike-packing-backup-before-v1624-20260927T142948Z/.

| File | SHA-256 |
| --- | --- |
| app.js | 9B0B162FD3AA8535BC65185A926058954207D73876439D2A8E1533E3F4101215 |
| index.html | 5FB6B03A2D43ED662A02E028E64E0A5550BC1E1C637990261A2B7809DFE3A878 |
| sw.js | 21E56A200C24663F46106BE2194AE453BB1CF3AE4916688AA4B3E3C6C06E7CF2 |
| release-contract.json | 08F3FB5FEEB6D70D8AB521C8103726FA3CF81C892D85BA96628E9B5BD69951D8 |

No API changes, server maintenance, GitHub Actions or Experiment transfer.
