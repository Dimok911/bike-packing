# Production v1622: trip video previews and appearance controls

Feature source: 588cdfc6ecce16ab280e160896248a82bbd70357 (v1621). Final source: 27ad568d835399ab57e784cec0ef0dba47326a7c (v1622), PR #34.

Trips now show photos, a separate horizontally scrolling video strip, then the description. YouTube watch, short, live and embed links get a thumbnail and play icon; clicking creates a privacy-enhanced YouTube iframe in a Bike Packing dialog. No player is loaded before clicking. Closing removes the iframe and restores focus; a link to YouTube remains available. Failed thumbnail loads have a clean fallback and other valid web links remain external cards. Explicit start times are preserved. Shared photo-gallery code is unchanged.

Trip label, counter, selected name and controls now fit one compact header row. Redundant photo/description/video counts were removed. Long names truncate, with their full text available in the title or trip selector. Description-position experiments were retired in favour of the requested photos → videos → description order. Card height, internal scrolling and collapse behaviour remain stable.

Administrator view options now include Photo visibility and Light overlay sliders, local to the browser. Non-administrators ignore these preview values. Defaults remain the v1620 appearance (32% photo, 76% overlay control); the CSS gradient reproduces the previous default values exactly. Each slider shows its common default and a marker; Use defaults resets this group. Common options 4 and В have a persistent outlined marker, independent of the filled current selection. The final panel is width-limited and includes its own close button for mobile use.

## Validation

- 897 critical checks and source checks passed for the feature release.
- Ten applicable Chromium/mobile WebKit trip/media scenarios passed; four final tests passed after adding administrator preference/default checks.
- Browser coverage includes trip navigation/public privacy, card geometry, video fallback covers, lazy iframe creation, start-time links, button/Escape cleanup, scroll unlocking, horizontal overflow, administrator preview persistence and guest defaults.
- Final panel-only refinement passed source checks, production build and six cache/version checks.
- Live v1621: actual user YouTube Shorts cover loaded; embedded playback and captions appeared, and close stopped/removes the player. Header was one row. Slider 32 → 33 immediately set opacity .33, then restored to 32; persistent default markers were 4 and В.

Implementation references: [YouTube embed parameters](https://developers.google.com/youtube/player_parameters) and [official thumbnail URL example](https://developers.google.com/youtube/v3/getting-started).

## Publication

Both increments replace only app.js, index.html, styles.css, sw.js and release-contract.json. No photographs uploaded or moved. FTPS staging and public HTTPS hashes verified. No API/shared-runtime change, server maintenance, GitHub Actions or Experiment transfer.

v1621 backup: /www/vniipo-help.ru/bike-packing-backup-before-v1621-20260927T114544Z/.

Final hashes:

| File | SHA-256 |
| --- | --- |
| app.js | E22419BE2DD62ECA52872266899D5DD073CD916972D1F034B19E4AA80E9D6B39 |
| index.html | 074E7154F8A5FC37C3618A6C03849256B4F1827BEE39D4D83F62A1392007E57B |
| styles.css | 9F9B030C7C21AFAF4D06F63E44A7CD718C35BC89A338E693BE7EE3A644A6A338 |
| sw.js | 99884F56BD048AC48B5DAF95C85EE172070343D910B8D98BFA827AABFD4BF314 |
| release-contract.json | F87FBDA44221D7F553BFD754B0D7C057B0F58BE321E4B7668E832EA6478256C9 |

Final v1622 backup: /www/vniipo-help.ru/bike-packing-backup-before-v1622-20260927T114957Z/.

Live v1622 verification at 390×844: view-options panel fits within the viewport (355px wide), displays default markers and 32%/76% values, and its dedicated close button hides the panel. No horizontal document overflow. Temporary viewport override reset; verification tab closed. The selected layout was restored after v1621 playback checks; no trip content changed. Screenshot: primary project test-results/v1622-view-options-mobile.png. Earlier live trip screenshot: test-results/v1621-live-trip.png.

Evidence: ftp-upload/v1621/{critical,source,browser,final-browser,publication}.log and ftp-upload/v1622/{build,source,version,publication}.log; both folders contain production-comparison.json.

The owner manually confirmed normal standard-gallery navigation after v1620. Its automation anomaly is not a confirmed product defect; no gallery change is required or included here.
