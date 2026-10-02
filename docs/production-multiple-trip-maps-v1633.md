# Multiple trip maps v1633

Published 2026-10-02. Source: 2d45c6f4db71714152f35a23c1d7020f1446d44d. PR: https://github.com/Dimok911/bike-packing/pull/34.

Trips accept multiple GPX files in one selection and subsequent batches. Every track has an independent card, name, optional recorded date and full map. Legacy single tracks are preserved; removing all tracks does not resurrect the legacy value. Invalid files do not discard valid files in the same batch. Save/reload, removal and discard retain independent tracks.

917 critical tests, source check, build and whitespace checks passed. Eight targeted Chromium/mobile WebKit cases passed (GPX, multiple maps, map adapter and compact horizontal media). Actual provider requests were verified in v1632; this release uses mock adapter and fallback tests. No claim is made about the previously documented fullscreen gallery arrow test.

Exactly five changed application files transferred over pinned FTPS and verified by SHA-256 over FTPS and public HTTPS. Zero photographs transferred. Rollback: `/www/vniipo-help.ru/bike-packing-backup-before-v1633-20261002T200245Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 5883F2D89E2241EB66926A35E8283237C65121CDF2251E92E9F5476F19888ECE |
| index.html | 1C9764AE39973F168719DFD22E866C5A3ADBA9B3506C53BF46FAAADDCB90D865 |
| styles.css | AE8273B06668C9A77540D6A29C1A3EC0B85E5633840ED17635B42116324DFEDF |
| sw.js | 27742EA87783B420A2AAEC2019D98F3495F0671E82D17F1100A6E5B1B701ED11 |
| release-contract.json | 57EB73DB410A3B03972F09C7EA3D8865589492CDF28BEE191E375952486B5375 |

No API migration, shared runtime changes, GitHub Actions, server restarts or Experiment transfer.
