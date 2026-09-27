# Production v1614: layout introduction and editable links

The layout description now appears next to its photos, before the weight/count summary. The editor and heading call it «Описание и заметки к укладке». Existing rich content, collapse preferences and edit access remain supported; an empty description adds no panel. Admin view options include Above photos / Below photos, with Below photos as the default.

Ordinary users and shared-link readers always get photo variant В and the description below it, even if the browser retains older admin preferences. Administrators retain all photo choices. Variant В displays compact thumbnails in one horizontally scrollable row, keeping long galleries within the page width. Fullscreen photo navigation remains unchanged.

Rich-note toolbars now expose Edit link when a note contains links. One link opens its original text/address fields directly; multiple links open a chooser with captions and addresses. Saving replaces that link, preserves its formatting when only the address changes, and retains URL validation. Normal link clicks still open a separate tab. The same editor handles layout, item and bag notes.

No API or shared runtime change is required. GitHub Actions is omitted under the user's explicit instruction. Publication uses the existing incremental FTPS process with only changed application files, recoverable backups, and FTPS/HTTPS hash verification; photographs are not transferred.

## Validation

891 critical tests, source syntax checks and the production build passed. Across Chromium and mobile WebKit, 23 distinct browser scenarios passed; one pre-existing mobile form-draft case remains skipped. The final media run passed all six scenarios, including loaded images on a shared link, rich description display, hidden editing controls for visitors, admin placement/view choices, guest preference isolation, horizontal overflow and fullscreen navigation. The final link-edit acceptance passed for layout, item and bag notes in both browsers, preserving the other links and formatting through save/reload.

Early failures were fixture errors: a guest layout was renamed by the existing demo normalization, and remote photo fixtures initially missed versioned URLs and credentialed CORS response headers. Corrected fixtures passed without changing application behavior for these cases. Windows WebKit uses synced image fixtures because it cannot store Blob values in IndexedDB; Chromium exercises file import.

Evidence: ftp-upload/v1614/{critical.log,browser.log,acceptance.log,media-final.log,production-comparison.json}. Publication details follow after activation and live verification.
