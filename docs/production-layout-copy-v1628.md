# Production layout copy without trips v1628

Source: 6c2367fdde50f168ca01c6afbf51fb81b7a2c09c. PR: https://github.com/Dimok911/bike-packing/pull/34.

New copies keep the gear arrangement and quantities, dictionaries and their existing item/bag records and media. They omit layout trips, trip photos, videos, descriptions/private notes and legacy layout-level story fields. This applies to ordinary copies, demo/template copies and published shared-layout copies. Existing source layouts, prior copies, backup/restore and published editing/materialization are not changed.

Validation: 913 critical tests, source check, build and six version tests passed. The final browser copy scenario passed in Chromium and mobile WebKit using a prepared source fixture: copied arrangement equals source; target has no trips/media/badge; source trips and item/bag photos and notes remain. The initial WebKit attempt failed during the unrelated bag-creation setup before reaching copy; deterministic source setup allowed the intended copy behavior to be checked in both browsers.

Incremental pinned FTPS deployment verified staging and live HTTPS hashes. Four changed files only; no photographs transferred. Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1628-20260927T200528Z/.

| File | SHA-256 |
| --- | --- |
| app.js | DD4441F5D3EE9FEF1AE39B33B33F520765AE2645C0B965FBED1B64BE80A901F4 |
| index.html | AC776765F1690B1FDC7F6FF68804CB808C06DF9F3839919EFFC1C262D68EAB95 |
| sw.js | E6CA8E541B0178B51F85953BB32DB4ADC43441BEE64577CA4F81682BF34907A2 |
| release-contract.json | 9E07C57C666F63C100306435C4400AEB5EEF334C8ADEE3C0C4DCCC183585CEA7 |

No API/shared-runtime changes, GitHub Actions or Experiment transfer.
