# Production photo upload status v1626

Source: 81eddcfd3482beb8282d17539f7fb501be5ef849. PR: https://github.com/Dimok911/bike-packing/pull/34.

Saving trip photos now retains ephemeral upload batch/progress metadata instead of losing it through object spread. Item and bag cards use the same completed-badge policy on initial render and subsequent updates. Reopening an editor preserves the metadata. Recent photos completed before Save and those completed afterward all retain the Uploaded badge for the current page session. The metadata stays out of persistent and server payloads; unrelated older photos gain no new badge.

The change belongs to Bike Packing state/editor/render adapters. Shared uploader 1.0.0 and gallery 2.4.1 are unchanged.

Validation: 912 critical tests, source check, build and six version checks passed. Browser checks passed for badges on trip/item/bag galleries in Chromium and WebKit (five complete plus five pending, completion and rerender); immediate-upload-before-save regression passed in Chromium. Its WebKit storage case was skipped due to the known Windows runtime limitation, not claimed tested on a physical iPhone.

Incremental pinned FTPS deployment verified staging and production hashes. Four changed application files only; no photographs or styles transferred. Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1626-20260927T160502Z/.

| File | SHA-256 |
| --- | --- |
| app.js | C3B57DAA95B36E0CCEF9498A8DE934C54E8DB4B1900848904381E41832161F36 |
| index.html | E224F0A218C1EE57C54C73F7437A5B69DA7ED5EBEBA9D6E437AD9FB6A2262A86 |
| sw.js | 331C3C8525C7F051EBBCD162C516DA5B302E7F627390D7AD26254673DE833BAA |
| release-contract.json | A1063282AB6A50C69F5FD93135FEEC3C41FB7BF2BB595CAD9164B44A605D25E1 |

No GitHub Actions or Experiment transfer. The user confirmed the earlier nginx correction allowed the queued HEIC to appear automatically.
