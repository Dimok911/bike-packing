# Production v1619: note editor frame and website paste spacing

Application source: c301fc863df7d0674eafd61a24b96e216fa412ad, PR #34.

The existing Bike Packing rich-note editor now groups the text and focus-only formatting toolbar inside one border. The label sits immediately above the text; the reserved footer is inside the field and keeps surrounding layout stable. A single horizontally scrollable row works on narrow screens. The same component serves items, bags, trip descriptions and trip notes. Edit-link remains conditional on an existing formatted link, as requested by the owner.

HTML clipboard paste now removes source indentation, empty layout paragraphs and empty tables after allowlist sanitization. Paragraphs, formatting, safe links, nonempty tables and pre/code whitespace remain. Saved notes, typed line breaks and plain-text paste are not rewritten.

## Validation

- 897 critical checks, source syntax check and production build passed.
- Rich-note browser suite: 21 passed, one existing mobile WebKit draft exclusion. After the final nested-whitespace/empty-table adjustment, four Chromium/mobile WebKit focus and paste checks passed.
- An additional isolated browser test used the observed DETAILS and SUPPORT markup from https://stans.com/products/stans-original-tubeless-sealant. Both sections pasted without runs of three blank-line separators. The description link and support table (17 rows) survived; table persistence after reload was verified. Third-party source markup and this one-off fixture remain ignored local evidence, not repository content.
- Live v1619 browser: label gap approximately zero, field top/height pairs 337/305 and 653/305 px unchanged on focus transitions. Only the focused toolbar appears; edit-link appears in the linked description and stays hidden in unlinked notes. Both toolbars hide on leaving the fields. Save stayed disabled throughout; no personal data changed. Original user tab preserved.

## Publication

Published 2026-09-27 UTC via pinned incremental FTPS. Exactly five changed application files, zero photographs transferred. Staging FTPS and public HTTPS hashes verified. Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1619-20260927T110220Z/.

| File | SHA-256 |
| --- | --- |
| app.js | 197EB66DAAF9CA12E26E8FF62422811B4496447D4CB4FE2569120B65A757AACE |
| index.html | 0D565BE19D1D06AB7442C3E63845CB2000D493A9E3F95A46DE78F57C9FC89758 |
| styles.css | DFD31A446E2ECC02E8B8073A31DB2E7C69DA7244772DAF9B925B134EE436D437 |
| sw.js | 17D9BE70F8E4FD5EE0998B582B63A6E284B094627E5ABA9B8CE91875B521490F |
| release-contract.json | 87E63A35E5BC2E8102F67578AD2736B85CBB7BDB4CFF1E49A330B45F608440CA |

GitHub Actions not used per owner instruction. API remains 0dc79b017f8d56bb21eef4b19b4b3dfab93335d8. No shared-runtime change, server maintenance or Experiment transfer.

Evidence: ftp-upload/v1619/{critical,rich-final,paste-final,stans-final,source,publication}.log and production-comparison.json. The initial one-off fixture failures were test setup issues (keyboard conversion of its English layout name and reopening the default layout); the corrected fixture passed. Screenshot: primary project test-results/v1619-live-toolbar.png.
