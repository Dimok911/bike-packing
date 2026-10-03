# Note pointer and empty media counts v1638

Published 2026-10-03. Source: 7abfc4799002ad988f553627897f81145dacfc30. PR: https://github.com/Dimok911/bike-packing/pull/34.

Media arrows omit the visible number when it is zero, preserving button dimensions and disabled styling. Positive counts and accessibility descriptions remain.

Live read-only inspection of the reported trip description found a native auto pointer, dark text/caret and transparent editor surface over the light panel; no CSS hiding the cursor was found. The user clarified that the mouse pointer, not insertion caret, disappeared. The existing application note fields now use a small dark SVG text pointer with a white outline on hover-capable devices. Forced-color mode retains the system cursor. Links keep their pointer cursor. Text, caret and document content are untouched. Native cursor visibility is not captured in browser screenshots, so the original platform rendering issue was not visually reproduced or claimed diagnosed. The live editor was closed without saving.

918 critical tests, source check, build and whitespace check passed. Four Chromium/mobile WebKit checks passed for photo/video/map counts and existing rich-note link editing. No new implementation-mirroring cursor test was added for the CSS change.

Exactly five changed application files transferred via pinned FTPS. Staged and live SHA-256 verified, including public HTTPS. Zero photographs transferred. Rollback: `/www/vniipo-help.ru/bike-packing-backup-before-v1638-20261003T091612Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 0E8C677C9EBC3F3A4B8161B997203607E8059232AB4A3607E2B4C9C07C40112D |
| index.html | 9DD6AAE0317DA265BE3DB1B1204EB782EFD8A7C661FA027C0E042D756382E9FE |
| styles.css | 31B1761695C93D097DF6F5D1F3833F279594184830188F30EB5757CA55D89ADA |
| sw.js | F9BC29E02AB254185A0C7D42D684F0F04B6C5C5E555F69B78EC59EEF3BE86C30 |
| release-contract.json | 50D13A51006248DD22722A1C44949F0F1F9287AFD0741FD0183B52F6367453E9 |

No API, shared service or Experiment changes; no GitHub Actions. Circular media scrolling was discussed only and was not implemented.
