# Explicit video captions and editable GPX titles v1642

Published 2026-10-03. Source: 5aa74e9bf21b78a23118bcf8e4e3bef8dba6da84. PR: https://github.com/Dimok911/bike-packing/pull/34.

Video thumbnails without a user caption no longer render a caption row, including the ordinal and provider text. User captions still render normally. Accessible link names and player navigation retain useful fallback names.

The existing GPX title now serves as the initial editable caption in the trip editor. One inline caption control replaces the previous fixed title plus separate Add caption control; its input opens prefilled with the displayed title. Edits survive saving and reordering and appear on the map card and large-map header. Original GPX metadata is preserved. An explicitly cleared caption stays empty instead of reviving the imported title, and history uses the same caption resolver.

Validation: 920 critical tests, source/build and whitespace checks passed. Six distinct Chromium/mobile WebKit cases passed across final runs: video player, combined video/GPX caption editing and persistence, and chronological/manual track ordering. Existing caption checks verify no ordinal row for uncaptioned videos and that the track caption input starts with the imported name.

Exactly four changed application files transferred via pinned FTPS; staged/live SHA-256 and public HTTPS verified. Unchanged styles and all photographs were omitted. Backup: `/www/vniipo-help.ru/bike-packing-backup-before-v1642-20261003T103622Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 92AFBDBB99C3971C75CFB8B01585D9DDDE51B7BD5C4B4E4AE68824501B4168BC |
| index.html | B0A53034C55E5374926E3E0A9F30792826C7CBEF992095BDDE5E541F1078EFBA |
| sw.js | EC3A256CA8DAE6CA96201985DF798A002D8FEC8FE86EEABB9FFBBA6890E19379 |
| release-contract.json | 1577B9B173DCAD387D44E02C4B9C6261BE999B367670BDE360634FE20F1E82C1 |

No API server, shared service, GitHub Actions or Experiment changes.
