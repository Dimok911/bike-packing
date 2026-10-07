# Trip map ordering v1635

Published 2026-10-02. Source: e2c77690f80f9d0b0167aa0ece96254ce36d98a3. PR: https://github.com/Dimok911/bike-packing/pull/34.

Trip maps default to chronological order, oldest first. Undated GPX tracks are last; equal dates and undated tracks retain their relative order. Dragging a map handle changes the trip to manual order, stored as trackOrder with its tracks. Manual mode survives save, sync and reload, and later imports append to its end. The By date button re-enables automatic ordering. The editor labels the current mode. Existing records without a mode use chronological order. Normalization creates copies and does not mutate stored records on read.

Map dragging reuses the Bike Packing-only photo-grid pointer sorter with configurable selectors; no shared gallery runtime is changed. It provides a destination placeholder, neighboring card motion, auto-scroll, keyboard arrows/Home/End and cancellation. Closing/switching the editor cancels active dragging, and file reads disable ordering.

## Validation

918 critical tests, source check, build and whitespace check passed. Six Chromium/mobile WebKit checks passed: existing compact photo dragging/editing/removal, multiple GPX persistence/removal, and the new chronological/manual ordering flow. After a final map ghost positioning correction, both ordering cases passed again. Verified scrambled import order, undated tracks, drag placeholder, save/reload, manual-mode imports, restoring chronology, Escape cancellation, keyboard ordering and discarding edits. Drag screenshot visually inspected. No user account data was modified by tests.

## Deployment

Exactly five changed application files transferred via pinned FTPS; SHA-256 verified for staging and production, including public HTTPS. Zero photographs transferred. Rollback: `/www/vniipo-help.ru/bike-packing-backup-before-v1635-20261002T204222Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 25E8DD95434E99EED7F13473E69A863B144B046A3E33552BD2AB119DE895A01A |
| index.html | 815009FA95BE92F379C421CE8E91FDC51764EC9361C2757752FC4FBBCA880597 |
| styles.css | 9CEFE1C1B41D09C1D7397E62DEAEDB63CC7F43428FE34FF500AEF87819F6A56D |
| sw.js | 8EA241D72AF4E2C6E3E24B6FE0E60521B735B21BE58315D2F881E6E6F0283836 |
| release-contract.json | BE388C2EA2B6EE36D49C2736880A49214206AD25834CE366B52F9D6EF1C9107D |

No backend migration, shared service changes, GitHub Actions or Experiment transfer.
