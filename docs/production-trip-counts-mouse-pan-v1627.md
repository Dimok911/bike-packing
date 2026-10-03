# Production trip counts and desktop mouse panning v1627

Source: ae3c46e83fbf9952791190864ea91e454e60b550. PR: https://github.com/Dimok911/bike-packing/pull/34.

The layout selector now presents trip counts as green numeric badges in an aligned column, separate from layout names. Empty counts remain blank. The existing native select remains the application state/change contract. The presentation supports keyboard navigation/typeahead, Escape, disabled options, touch scrolling, and localized accessible descriptions. Opening/highlighting options only scrolls inside the list.

Desktop photo panning was cancelled by native image dragstart followed by pointercancel. The Bike Packing lightbox adapter now disables native image dragging for every bound image (including replacement originals). Trusted mouse drags after zoom now move the full requested distance on both ordinary desktop and touchscreen/hybrid configurations. Shared gallery 2.4.1 and uploader 1.0.0 are unchanged.

Shared Services reproduced and diagnosed the adapter defect in task 01a0e39d-8ec1-7e93-8e83-1fd89578b339; no shared runtime release was needed.

## Validation

912 critical tests, source check and six version checks passed. Gallery browser suite: 27 passed across desktop Chromium and mobile WebKit, one Chromium-only native pinch test skipped on WebKit. Both new mouse regressions assert a full 140 x 70 pixel drag and normal pointerup without native dragstart/pointercancel. Final layout selector checks passed in Chromium and WebKit for aligned counts, pointer selection, keyboard selection/Escape, blank zero counts and unchanged page scroll. Desktop/mobile screenshots were inspected. This does not claim a physical iPhone test.

Live clean Chromium confirmed v1627, one custom selector and no page errors. Deployment verified all changed files over pinned FTPS and public HTTPS. No photographs transferred. Backup: /www/vniipo-help.ru/bike-packing-backup-before-v1627-20260927T161732Z/.

| File | SHA-256 |
| --- | --- |
| app.js | 3FE04B41F89B38C10E1F8955C86AC8CC7088301B204FC552232BACCF231ED198 |
| index.html | B03ED2816324A2789C615AA7FE25E82C5B81A1D958514DF1AD8FE436DCCF6B9D |
| styles.css | 98C1FD336976622A630C22E2C848D89985508D4E9052B80551F084B012350309 |
| sw.js | 23CD7E879C001012E7E48DA617ABD5558778A4D70EADEDBAE444479D80D0758F |
| release-contract.json | A81C61056FF3108A3A03EE2A1976080E48FBAEE2FDC79B50DD38F734AD56D08B |

No GitHub Actions or Experiment transfer. v1626 upload-status improvements remain included.
