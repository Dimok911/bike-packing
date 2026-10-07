# Trip composition previews v1634

Published 2026-10-02. Source: 678730788e5512150343593ecc32b7207b500798. PR: https://github.com/Dimok911/bike-packing/pull/34.

Admin view settings now include a separate Trip block group: Current, Photos above (photos / videos beside maps / description), Photos and description (photos beside description / videos beside maps), and Description and maps (description beside maps / photos / videos). Current remains the marked default for other users. Admin preferences are local to the browser and retained independently of the existing photo style. Mobile layouts use one column in the same reading order. Missing sections leave no reserved row or column. The card retains its fixed height and internal scrolling; long desktop descriptions in paired arrangements also scroll within their area.

Changing composition preserves the existing media DOM and gallery/map bindings. No trip data or sharing rules change.

## Validation

917 critical tests, source check, build and whitespace checks passed. Six existing targeted browser checks passed (admin photo styles, full viewers/compact horizontal rows, multiple GPX persistence) in Chromium and mobile WebKit. Both new composition cases passed after correcting the inherited fixed-width option button style. They verify desktop pairs, mobile order, no horizontal overflow, media node identity, saved selection on render, empty sections, collapsed visibility and guest default. Screenshots of all three variants were inspected. Synthetic map fallback is used in these composition screenshots, not a live Yandex map.

## Deployment

Exactly five changed application files transferred via pinned FTPS; staged and live hashes verified, including public HTTPS. Zero photographs transferred. Backup: `/www/vniipo-help.ru/bike-packing-backup-before-v1634-20261002T201434Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 6034115325E39B5171A44E4B67F4D7E8783E80FAD32CA7780CC99B53241304A7 |
| index.html | 31193E2EEBED6823DC41F6B623B002906D6FE2538C587788A2904B1C421EE110 |
| styles.css | F6B1A06AC26CC0BF0EE03B3B3F5CFFABE5F5E7B7B945D05F2BFF0210D82EDCA0 |
| sw.js | 7E670AEB622849E36DB818D2F80A91D9D0A6D0C6DB2824ED62311CE7603B82D7 |
| release-contract.json | 9BA904B3A9E45E8855B54E0C159A064BB6F97E90A848D5763E10D8A9653BA357 |

No API changes, shared runtime changes, GitHub Actions or Experiment transfer.
