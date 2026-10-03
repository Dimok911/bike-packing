# Accepted trip layout, media counts and map interactions v1637

Published 2026-10-03. Source: 7bcf8aba1903c52c514c0c7681198cece4c19fa9. PR: https://github.com/Dimok911/bike-packing/pull/34.

Description on the left is now the public and unset-admin default, marked accordingly in view settings. Explicit admin preferences still work. The earlier layout is labelled Previous layout. Media row arrows show the count of children clipped beyond each viewport edge, including partially visible thumbnails; values update on scrolling and resize, with accessible descriptions. Existing compact widths, native touch scrolling and hidden scrollbars remain.

The entire map preview has a pointer cursor and opens the large map, except provider attribution links. Large map dialogs now identify themselves as gesture-owned surfaces, so the existing modal scroll lock does not cancel Yandex touch/wheel events. Native multiTouch behavior remains enabled. No shared gallery code or generic modal scroll controller was modified.

The SDK fullscreen control was replaced with an application dialog expansion button. It expands the top-layer dialog within the usable browser viewport, keeps the map inside it, fits the provider canvas on resize, and restores with the button or first Escape; the next Escape closes the dialog. Background application content remains intact. Provider controls/attribution remain available.

## Verification

918 critical tests, source check, build and whitespace checks passed. Ten final Chromium/mobile WebKit cases passed covering public links, video player, counts for photo/video/map rows, map adapter lifecycle and all trip compositions. The opt-in real Yandex check passed with the configured domain-restricted key on the authorized origin using synthetic test data. It verified SDK tiles, background-area click, modal scroll locking, expansion dimensions, a native two-finger Chromium touchscreen gesture increasing actual map zoom while browser viewport scale remained 1, Escape restoration and destruction. Final map screenshot visually inspected. Tests do not modify user account data. Initial full-window assertion was corrected to compare the usable viewport excluding its reserved scrollbar gutter, preventing clipped controls.

Reference consulted: https://yandex.com/dev/jsapi-v2-1/doc/en/v2-1/ref/reference/Map (native multiTouch behavior and viewport fitting). The blocked gesture diagnosis comes from the local modal-scroll-lock capture handler and was verified with the real SDK.

## Deployment

Exactly five changed app files uploaded via pinned FTPS; staged/live SHA-256 and public HTTPS verified. Zero photographs transferred. Backup: `/www/vniipo-help.ru/bike-packing-backup-before-v1637-20261003T085200Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | C0F8B639619977942575CAEDF6787FAC405AE75E43D919F0E540A30B68C8B211 |
| index.html | 4E5BC62F7A1D2089FB4DB9B0E8E6D724075F211A04F27D16C7BFA7BCA566B1D0 |
| styles.css | A4715C76441A7FF6BB1DF402A54BF0E05A89F515FB6475720BEE0D41705465CE |
| sw.js | 3D1974DD1E296D2A518DD0E02D174569DB52D4590CD27B9DAAC6EDB31E03A598 |
| release-contract.json | 173A818A5618FDC3CC4AF29C6E2963AB26E97581DAADA759B5E07D81722E48D4 |

No API migration, shared runtime changes, GitHub Actions or Experiment transfer.
