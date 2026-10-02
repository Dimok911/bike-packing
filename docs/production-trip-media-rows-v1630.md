# Production trip media rows v1630

Source: 800fb00738503ee08b446fc37592aff8482e0cc4. PR: https://github.com/Dimok911/bike-packing/pull/34.

Published on 2026-10-02. Restored horizontally scrolling photo and video rows, photos above videos, with 4 px gaps. All thumbnails remain available in their row; removed tile overflow counters. Photo fullscreen gallery and video previous/next navigation remain available. Existing admin view options are preserved.

GPX support is unchanged. Yandex Maps remains unconfigured pending a JavaScript API key; the current track preview is the explicitly labelled local schematic. No API or shared module changes.

## Verification

915 critical tests and source checks passed. Targeted Playwright media checks passed: seven passed and one existing environment skip. Covered both Chromium and mobile WebKit, all-thumbnail horizontal overflow, 4 px spacing, photo-above-video order and full photo/video navigation. Chromium native photo touch scrolling passed. Inspected the rendered rows screenshot. Build completed and deployment verified production hashes.

The pre-existing modal-gallery arrow test documented in the v1629 report was outside this targeted run and is not claimed fixed.

## Deployment

Incremental pinned FTPS verified staging and live HTTPS hashes. Exactly five changed application files transferred; zero photographs. Recoverable backup:
`/www/vniipo-help.ru/bike-packing-backup-before-v1630-20261002T181839Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 8586AA03494C881CA65C0F3A73BCDA4D2930D248F37490669C436ED36D79545A |
| index.html | 12441FE4FE5A50291B3BAF6D608865CE581DFABD9230FD0C22A51261692752B8 |
| styles.css | E3283EF23E05226AA9B51E75094585CB2B0660108A73854819A6F0DC801CD04F |
| sw.js | 6B5DDFBC86CC4C4EFB8FCA4C79D0F32A90234AEA217B875646EEA0329CAB45B5 |
| release-contract.json | 9090E31028904119B2E2FFCB71C99FBE5DB7626DBEF59B09F2CDEDAD6667B5C5 |

No GitHub Actions, server service restart, shared-runtime publication or Experiment handoff.
