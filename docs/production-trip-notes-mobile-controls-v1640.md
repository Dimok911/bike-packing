# Trip notes and mobile media controls v1640

Published 2026-10-03. Source: 63a3ea20b5c468739f608930827690f1fe927c47. PR: https://github.com/Dimok911/bike-packing/pull/34.

Trip private notes now occupy the final full-width row below description and all media on the main page, across presentation variants. Publication visibility is unchanged. Editor fields remain in their original order, following the user's correction. Grid rows use intrinsic content height so long descriptions cannot overlap later rows.

The layout editor now participates in the existing application keyboard scroll guard used by item and bag editors. It follows visual viewport resize/scroll and keeps a focused photo caption above the keyboard. No shared gallery or upload runtime changes.

Trip photo/video/map arrows use an absolute target clamped to the last visible card's edge and the browser's scroll limit. Native snap correction is disabled on these rows to avoid moving the arrow's final position; touch scrolling remains native and horizontal rubberband is suppressed. Counts still exclude partly visible thumbnails; zero counts stay blank.

Validation: 918 critical tests, source/build and whitespace checks passed. All 16 relevant Chromium/mobile WebKit cases passed across the final runs, covering notes privacy, all four composition previews, long descriptions without overlap, stable outer card height, count/resize behavior, bounded photo/video/map navigation, compact photo editing/reorder/removal, and formatting toolbar stability. The keyboard regression models visualViewport contraction on a 390px viewport and checks focused caption bounds and typing. A physical iPhone keyboard was not available. The extra-end-space regression intentionally adds scrollable tail space; the original phone-specific cause was not directly reproduced. Initial test failures exposed grid row compression (fixed) and test viewport interference with the existing desktop drag coordinates (test restores its original viewport before drag).

Exactly five changed application files transferred via pinned FTPS; staged/live SHA-256 and public HTTPS verified. Zero photographs transferred. Backup: `/www/vniipo-help.ru/bike-packing-backup-before-v1640-20261003T094532Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | EF72069BA08802217DF107A1B19EA962900EE876ADE498A367B3ACEC664A9B94 |
| index.html | BF3ED58B080505C831FC88601A3739B15C41292B82A81906F82407092424CF19 |
| styles.css | 1437A1E9EE720A48FFAE1163ADB3CBED48FF9B1DDC479C407D160A627B18ABB8 |
| sw.js | D966FF2256A8BAE6712E296684BE11429158D79D0D42819873B8CBC03B59F923 |
| release-contract.json | 26BB8FCD7E8745E1F84BF3475D2F657C3E76D554C0E8B027E0D1F10B6BFFA114 |

No API, shared service, GitHub Actions or Experiment changes.
