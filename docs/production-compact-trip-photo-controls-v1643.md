# Compact trip photo controls v1643

Published 2026-10-03. Source: 677001aba202ae4caa0e0a07dfb4a6b62e7f4f8f. PR: https://github.com/Dimok911/bike-packing/pull/34.

The Photos heading now uses the same strong heading markup as Videos and Maps. File selection, camera and clipboard/URL controls share a wrapping action row. Desktop controls have intrinsic widths and 36px minimum height; coarse-pointer controls retain a 44px touch target. The clipboard control uses a regular button border and pointer cursor. Existing file, camera, paste and drag/drop handlers and photo data are unchanged.

920 critical tests, source/build and whitespace checks passed. The existing compact photo-editor scenario passed in Chromium and mobile WebKit, including captions, ordering, cancellation and confirmed removal. Inspected desktop/mobile screenshots; desktop file and clipboard controls fit side by side.

Exactly five changed application files transferred via pinned FTPS; staged/live SHA-256 and public HTTPS verified. Zero photographs transferred. Backup: `/www/vniipo-help.ru/bike-packing-backup-before-v1643-20261003T104031Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 5253CDF9846FCC9A313B2B331D098BEC144BC589A7858B2A0847F962A2DAD239 |
| index.html | FC2E190173557B9D1122086D107ECA0D541FB653B92EC8ECDD514E652C1598B6 |
| styles.css | C488F955BE7ED45E100E166E2A3E4985EE342F91DD1F66B6A68FD2D3CCC9E7F6 |
| sw.js | 943B25B7C4A5E31AEA2A5E2CF9D63619FABE57CDD1BC6F16E9F0127C65D0E522 |
| release-contract.json | DBDD08CE66F398ABA58CA8594A7CEA279984786B1FFA3AE7C275540BFE299DAE |

No API server, shared service, GitHub Actions or Experiment changes.
