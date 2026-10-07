# Unseen media counts v1639

Published 2026-10-03. Source: 32599f151b33e641fd34cbdd43184c9f04635a3a. PR: https://github.com/Dimok911/bike-packing/pull/34.

Arrow counts now include only fully offscreen thumbnails. A partially visible photo, video or map is already shown and is excluded. The row and child bounds use rendered rectangles consistently, including fractional scaling. Blank zeros, native horizontal scrolling and disabled edge arrows remain unchanged.

Read-only production DOM inspection reproduced the discrepancy: three videos were visible (one partly) out of five, while the left count showed three instead of two. No live data or settings were changed.

918 critical tests, source check, build and whitespace checks passed. Four Chromium/mobile WebKit cases passed: existing photo/video/map scrolling and a regression with four cards, three visible, count one in either direction. Resize with all four partly visible clears the number, and fractional scale preserves the count.

Exactly four changed application files transferred via pinned FTPS; staged/live SHA-256 verified including public HTTPS. Styles were unchanged and not uploaded. Zero photographs transferred. Backup: `/www/vniipo-help.ru/bike-packing-backup-before-v1639-20261003T092632Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | CFBCB9D1321D245A067548476081CB5DC49A5BB2107D24A7B4F5172158896867 |
| index.html | 3B24EE4DEEFBC7B4163816CD1F1FF367005DDB1E2978A12CF1FAC3686BAF4E16 |
| sw.js | 6EFF42EB4C8979841F4B6609C36EF88B3172F54F8DD436F60C0BD413149E8132 |
| release-contract.json | 5F6C14300D38804DB0AB910E8C6335CEBFC2020CA0F7DB8A941F9E0BCA8B4956 |

No API, shared service, GitHub Actions or Experiment changes.
