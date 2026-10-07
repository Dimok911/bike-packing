# Production v1614: layout introduction and editable links

The layout description now appears next to its photos, before the weight/count summary. The editor and heading call it «Описание и заметки к укладке». Existing rich content, collapse preferences and edit access remain supported; an empty description adds no panel. Admin view options include Above photos / Below photos, with Below photos as the default.

Ordinary users and shared-link readers always get photo variant В and the description below it, even if the browser retains older admin preferences. Administrators retain all photo choices. Variant В displays compact thumbnails in one horizontally scrollable row, keeping long galleries within the page width. Fullscreen photo navigation remains unchanged.

Rich-note toolbars now expose Edit link when a note contains links. One link opens its original text/address fields directly; multiple links open a chooser with captions and addresses. Saving replaces that link, preserves its formatting when only the address changes, and retains URL validation. Normal link clicks still open a separate tab. The same editor handles layout, item and bag notes.

No API or shared runtime change is required. GitHub Actions is omitted under the user's explicit instruction. Publication uses the existing incremental FTPS process with only changed application files, recoverable backups, and FTPS/HTTPS hash verification; photographs are not transferred.

## Validation

891 critical tests, source syntax checks and the production build passed. Across Chromium and mobile WebKit, 23 distinct browser scenarios passed; one pre-existing mobile form-draft case remains skipped. The final media run passed all six scenarios, including loaded images on a shared link, rich description display, hidden editing controls for visitors, admin placement/view choices, guest preference isolation, horizontal overflow and fullscreen navigation. The final link-edit acceptance passed for layout, item and bag notes in both browsers, preserving the other links and formatting through save/reload.

Early failures were fixture errors: a guest layout was renamed by the existing demo normalization, and remote photo fixtures initially missed versioned URLs and credentialed CORS response headers. Corrected fixtures passed without changing application behavior for these cases. Windows WebKit uses synced image fixtures because it cannot store Blob values in IndexedDB; Chromium exercises file import.

Evidence: ftp-upload/v1614/{critical.log,browser.log,acceptance.log,media-final.log,production-comparison.json}. Publication details follow after activation and live verification.

## Publication and live verification

Published on 2026-09-27 from application commit fa82907d048cfe7501d7f8bff0fc32081069b09c (PR https://github.com/Dimok911/bike-packing/pull/34).

- Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1614-20260927T083445Z/.
- Incremental FTPS upload and public HTTPS SHA-256 checks passed for all five changed application files; zero photographs transferred.
- Live authenticated admin tab shows v1614, variant В, all three existing photos loaded, and the renamed description underneath. Existing Strava links are listed by Edit link; selecting one opens its original caption/address and Save link. Opening and cancelling leaves the layout Save button disabled; no personal content was edited.
- API remains d42beebe9c65d5b71c7f21b5ba36da47322746ac; services and shared photo-gallery runtime were not redeployed.
- Live evidence: primary repository test-results/v1614-live-link-fields.png. Deployment evidence: ftp-upload/v1614/publication.log.

Published SHA-256:

- app.js: A4E266E3B0755606A330442A59E01F2320BEA34104E44D0564538AD6C764640C
- index.html: 44F7E741251DFB37D5200747C01A7FBBE1AB74F94671EA700ED2E306EEEF2BEC
- styles.css: F41D3476942EC6F569157DB886A5B9B8FCFA6000EDC9DD8F62B623D3B59C26F8
- sw.js: C3DC611CDAA9413D6862053E4BA3CCAD6B443EF11B5418AEFD026484BE5A25BA
- release-contract.json: B02699F7821EFE7EE6CF3AAE25A006A1DEB390C2A0C1A26BD6E9B236258BFCDD
