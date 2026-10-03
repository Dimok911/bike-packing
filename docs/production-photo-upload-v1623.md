# Production photo upload correction v1623

Source commit: f8ee1f3f46f3c901a97bb40cfd824fc1eb025e30. PR #34.

## Changes

- Photo-only local edits count as unsynced changes even though the server payload excludes pending local assets. A server refresh retains unuploaded local photo entries in existing layouts, items and containers; it does not recreate deleted entities. Background refresh is deferred while upload is active.
- Trip snapshots preserve transient upload progress. Progress and server URL updates keep decoded thumbnail nodes and horizontal scroll position instead of replacing the entire strip.
- Trip single-image gallery adapters no longer consume the outer strip's native horizontal gesture. Shared fullscreen/gallery source is unchanged.
- IndexedDB writes resolve on transaction completion rather than request success. Storage read errors propagate instead of masquerading as a missing local file. Existing iCloud byte materialization, JPEG resizing and GIF behavior remain unchanged.

## Verification

899 critical tests passed before the additional storage commit regression; all 124 offline-photo tests including that regression then passed. Source check and six release-version checks passed. Browser suite: 15 passed, five skipped for ephemeral Windows WebKit Blob persistence/native Chromium touch requirements. Final Chromium checks after the storage change: four passed (one +15 trip photos through actual preparation/cache and controlled upload responses, independent item and bag batches/save/reload, native horizontal touch over thumbnail images). Physical iPhone/iCloud acceptance remains user verification.

Live v1623: authenticated app, 15 existing photos in 2026 Panniers trip loaded, zero preview errors, strip tracks use overflow clip. User reports first pending photo disappeared without manual deletion; not recovered by this release, no user photos were changed during verification.

## Publication

Changed files only: app.js, index.html, styles.css, sw.js, release-contract.json. No photographs transferred, moved or deleted. FTPS and public HTTPS hashes verified.

Rollback: /www/vniipo-help.ru/bike-packing-backup-before-v1623-20260927T141502Z/.

| File | SHA-256 |
| --- | --- |
| app.js | 9567D040D6943634A0351FAE792058F0009D2CB19A16AC87A7664DD2758F2949 |
| index.html | BD9A3F09A450694832052F5BA2CF28EE0147F736D71A2F97E2668A0B6A7B92A4 |
| styles.css | C9A7F94DF78EFD9A7828207EFA11A1280AF8ECCC0A366054A5EF16CC03CEC86B |
| sw.js | 863362F34FF9EAA666E4FE5790609699EB32C6E880878CF846F6D307308C17C2 |
| release-contract.json | 13CAF8439E69D220A4E17BA3001B3FB86B261C402191246C9E7E76B5EE124E74 |

No API/server maintenance, GitHub Actions or Experiment transfer. Shared uploader extraction is separately owned by Shared Services task 01a0e32c-5e50-7e10-90f8-7f7ac04270cf and is not yet part of v1623.
