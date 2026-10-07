# Production compact trip editor and Yandex maps v1632

Source: 871aeae44b93e407da4b168425052f44ab118a07. PR: https://github.com/Dimok911/bike-packing/pull/34.

Published on 2026-10-02. The owner's activated free JavaScript API key is configured in ignored `.env.local`; no credential is committed. The real SDK now renders GPX tracks. Map previews are square cards with the track name and optional date. The earliest valid point timestamp is retained as `startedAt`; export metadata is not used as a trip date. Old imports need reimporting to recover timestamps that were previously discarded. Missing timestamps do not produce an invented date.

The trip photo editor now uses a compact grid, captions edited in place, a top-right removal cross with confirmation, and a top-left drag grip. Dragging shows a destination placeholder and shifts neighbors. Keyboard arrows/Home/End reorder; Escape and touch cancellation preserve the previous order. Repeated moves are gated while the editor rerenders. Caption input uses 16 px text to avoid iPhone focus zoom. Upload preparation and background transport are unchanged.

## Verification

916 critical tests, source check, build and diff whitespace check passed. GPX import/date persistence and mock map adapter checks passed in Chromium and mobile WebKit. The opt-in real provider test passed with the authorized site origin, synthetic route, actual remote SDK and tile responses; the rendered map and orange track were visually inspected. This test does not load or change account/trip data.

The full media run passed 29 cases with six existing environment skips and three failures. One is the existing Chromium modal fullscreen arrow test previously reproduced on baseline v1628 and documented in v1629. The other two were the new editor test trying to assert lazy image decoding before scrolling the photo into view; the test was corrected. Both final compact-editor cases passed, including decoded previews, inline captions, mouse sorting, keyboard sorting, Escape cancellation, confirmed/canceled removal and persistence. Chromium also verified native touch cancellation. Upload batches for trips, items and bags passed, including completing upload after the editor closes. The known fullscreen arrow failure is not claimed fixed.

Live production browser verification confirmed v1632 and the compact editor with the owner's existing 17-photo trip. Inspected the real decoded previews and controls, then closed the editor without saving or changing trip data.

## Deployment

Exactly five changed application files transferred using pinned FTPS. Staging and production SHA-256 verified, including public HTTPS. Zero photographs transferred. Backup:
`/www/vniipo-help.ru/bike-packing-backup-before-v1632-20261002T185512Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | 2B971714071FD0E58CD1AE85F1D40A6E1E3DA8B05D5E393D9CE8DE7DEE02E22B |
| index.html | EA4D85FABFDCFE0FC734236ACACB4D27C36A9F27F2536D8193759BA99E4A1E4D |
| styles.css | 8912492B4ABEC5CFC67070763434B1BCF0ABBA5817E736A345E30BEBA25F1F1C |
| sw.js | 569FBE1B16233A33C703549BAC03D391456B44F10B0C592E6019D5223EE3139A |
| release-contract.json | BCEE7537C74FEAA5F00AA4CE7F111E9F15BE668532C936311AC4F01C438161FD |

No GitHub Actions, backend API migration, shared-runtime change, server restart or Experiment handoff.
