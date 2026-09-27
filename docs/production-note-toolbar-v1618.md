# Production v1618: formatting toolbar on focus

Application source: 74aa14058356f8e04ec4ba2b330218eae4a60035, PR #34.

The existing Bike Packing `createRichNoteEditor` module serves item notes, bag notes, trip descriptions and trip notes. One shared CSS rule now reveals its toolbar while the field or its controls have focus. Hidden controls retain their layout space, preventing focus changes from moving fields or their neighbours. Hidden buttons are excluded from keyboard/accessibility navigation by CSS visibility; focusing the editor makes them available. Link text/address editing remains usable within the same component. There are no per-dialog copies or API/shared-service changes.

Validation: 897 critical checks, production build, six targeted desktop Chromium/mobile WebKit scenarios passed. Browser coverage includes adding and editing links in all four editors, focus transfer, keyboard toolbar navigation, link cancellation, hidden idle controls and unchanged field positions/heights. Tests measure layout offsets rather than scroll position when the browser scrolls focused fields into view.

Only app.js, index.html, styles.css, sw.js and release-contract.json differ from v1617. No photographs transferred. GitHub Actions not used per owner instruction.

## Published file hashes

| File | SHA-256 |
| --- | --- |
| app.js | EF940FF4AB709B1A60C130AA897D647878E8D92B7D082F483FD19C8A5BAF253C |
| index.html | 1FC0DC7149374B000B45B34B650B1D3E2BBF4EB630F13DE5813A4CF6703F0DF5 |
| styles.css | CA73898946C25285BA675E1FFF7420F9630A7186717EC572CE15FA5CC5372AA8 |
| sw.js | 04D477F960844BE79669A1468248AA2899BED282F4DCBBF9D14FBACB854776DE |
| release-contract.json | 13640D1344D2636D438410057CD7D9C2C8F952E4AB19C005F67220CAE79C503A |

## Publication and recovery

Published to https://vniipo-help.ru/bike-packing/ on 2026-09-27 UTC. Staging and production FTPS/HTTPS hashes verified for all five changed files. Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1618-20260927T104439Z/.

Live browser confirmed v1618, both toolbars hidden initially, only the focused description toolbar visible, and both hidden after leaving. Field positions/heights stayed exactly 337/299 and 648/299 px before and after focus. Save remained disabled; no personal data changed. The user's existing tab was left intact. Screenshot: primary project test-results/v1618-live-toolbar.png.

Evidence: ftp-upload/v1618/{critical,browser,focus-final,publication}.log and production-comparison.json. The API remains 0dc79b017f8d56bb21eef4b19b4b3dfab93335d8. No server maintenance or Experiment transfer.
