# Production immediate photo upload and WebKit cache correction v1625

Source: dbcb596ae900553df77f0adbb42b8944ffd1d883. PR: https://github.com/Dimok911/bike-packing/pull/34.

## Behavior

Trip photos now begin uploading as soon as each selected file has been fully prepared and committed to local storage. The editor uses the existing application dialog queue and shared photo-upload-engine 1.0.0. Saving/closing hands ownership to the saved layout; caption/trip edits survive late upload results and replacement of live records. Cancelling or changing accounts prevents late attachment. Uploaded draft cache records remain outside automatic remote-cache pruning until saved.

File storage and upload now read full/thumbnail bytes into independent Blobs before rewriting IndexedDB or sending FormData. Reads finish before the write transaction opens. Failed reads leave the existing record intact and show a specific per-photo error before any network attempt. This preserves the original iCloud materialization, resize, GIF and transaction-commit policies. It does not reconstruct already unreadable bytes.

A photo request with its own retry/error UI no longer toggles the whole-app connection banner for every intermediate failure. Other API failures retain their existing connection handling. Preview loaders retry a changed source after a stale read and do not mark a broken image ready merely because it has a src.

## Diagnosis and limits

Shared Services diagnosis: https://github.com/Dimok911/vniipo-photo-upload-engine/pull/2, commit f197c8ad296da84bd9fc22939b4af6e4c09b567a. Engine 1.0.0 remains unchanged. Persistent Windows WebKit reproduced unreadable backing bytes after overwriting a stored Blob with a Blob read from the same record, especially after display. Detaching bytes before overwrite passed the control. Slice/FormData alone passed; XHR status 0 also occurs on real network interruption, so the user's repeated 12%/24% failure is not conclusively attributed to this local reproduction.

The user reports a 7.3 MB JPEG/HEIC from the normal iPhone library that opens full-size locally but does not reach desktop. A synthetic 7,300,000-byte JPEG was reduced by the existing pipeline; the Shared Services WebKit diagnostic sent 900,372 multipart bytes to a local server, which verified lengths and SHA-256. The GIF control sent 7,300,292 bytes unchanged. No limits were increased. Physical iPhone and the user's actual source file remain untested. Production nginx/request limits were not independently audited in this release.

## Validation

910 critical tests passed, followed by 130 offline-photo tests after the final distinction between local-read and remote-download failures. Source check, production build and six version checks passed. Six Chromium browser scenarios passed: trip draft switching/discard; one plus fifteen photos; separate item batches; separate bag batches; native horizontal thumbnail gesture; immediate open-editor upload of a >7 MB source followed by a second picker batch, save during upload, and completion with preserved captions/URLs. Shared Services recorded 19 checks and persistent Chromium/WebKit byte-transfer diagnostics with and without a controlling service worker.

Live authenticated browser confirmed v1625, synchronized state and the existing 15 photo entries without a preview error message. No production test photos were uploaded. The user's missing first photo is not claimed recovered; device verification is still needed.

## Deployment

Four changed application files only; photographs and styles.css left in place. Staging FTPS/HTTPS and production FTPS/full HTTPS SHA-256 verification passed. Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1625-20260927T145635Z/.

| File | SHA-256 |
| --- | --- |
| app.js | 34BB251F65D7F332D891A4ED73A9D9D33D9A3371454523ED7F917C2EF3AE0BE9 |
| index.html | BB59DBA8369415D839023AFF648EF68985F7E4DD8F4EC85D8E3872163725E3D3 |
| sw.js | BD5D1FC2EF2AB93783369127960BA9C92BE1233BB54DB41CE78C202160222F0E |
| release-contract.json | 2D7CB29B74C6C0C5B4425489C580D2E1E72F7A5E07A8BCD6A6C99207FDC72A83 |

No API/server configuration changes, GitHub Actions or Experiment transfer.
