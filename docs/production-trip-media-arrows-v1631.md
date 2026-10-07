# Production trip media arrows v1631

Source: c18bc03c1e2f9beadda37fd4324f11e9aef22ea1. PR: https://github.com/Dimok911/bike-packing/pull/34.

Published 2026-10-02. Trip photo/video rows hide native scrollbars and expose previous/next buttons only when content exceeds the available width. Buttons move by most of the visible row, disable at the corresponding end, respect reduced motion, and update on resizing/collapse. Native touch scrolling is retained. Photo thumbnails no longer have white padding or a border. Fullscreen photo/video behavior and GPX map configuration are unchanged; Yandex still requires a configured key.

## Verification

915 critical tests passed. Source check and build passed. Targeted media browser tests: seven passed, one existing environment skip. Chromium and mobile WebKit checks covered button scrolling, start/end disabled states, hidden scrollbars, responsive button removal/reappearance, view options and fullscreen navigation. Chromium native touch scrolling passed. Rendered mobile screenshot inspected. Initial new test caught a 2 px video scroll-snap offset caused by old inline padding; removed that padding and reran the targeted suite successfully.

## Deployment

Exactly five changed app files transferred by pinned FTPS. Staging and production verified by SHA-256, including public HTTPS. Zero photographs transferred. Backup:
`/www/vniipo-help.ru/bike-packing-backup-before-v1631-20261002T183006Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | F7890130E3E5C01C67F1FC5A729E1B77909B9F74F0005CDB869C014A771AA3F1 |
| index.html | 04EB737AE25BD18CACC474BAC0431D0AD3C5BCFDC264430EEDB775416CA21851 |
| styles.css | 926CB294F62CA113E7F791E23A67186435053FD1BD4882DF41ECD63DFF8FB7A6 |
| sw.js | 384971940821B22B5CBFCA29021980DB000A829310451C800DBE6734DF69BA04 |
| release-contract.json | 2CA0BA3B727EE156257C229FD6B99ECC6B7B5C64A24A50AC78CB4DFB88E411A1 |

No GitHub Actions, shared service changes, server restart or Experiment handoff.
