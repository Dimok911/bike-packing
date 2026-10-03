# Compact trip video editor and track captions v1641

Published 2026-10-03. Source: 05d12e45295be5fef87069e289e62f0df0fb3de7. PR: https://github.com/Dimok911/bike-packing/pull/34.

The trip editor accepts a video URL in one input and creates a compact thumbnail on Add or Enter. A valid pending URL is also retained when saving or switching trips. Each video has an inline editable caption, the existing photo-grid drag placeholder/neighbor animation, keyboard ordering, and a corner remove button with confirmation. Preview uses the existing trip video player. Blank captions use the current ordinal label. Saved captions appear in the main panel, player and shared publication. Photos retain their existing uploader/editor.

Videos are stored as ordered `{url, caption}` entries in `trip.videos`; legacy single URLs and URL lists remain readable, and saves keep URL-only compatibility fields. Captions remain associated with duplicate URLs when reordered. Normalization, trip snapshots, signatures, history and JSON synchronization preserve the new data; empty arrays do not revive removed videos.

GPX tracks now have an optional caption editable inline. It appears on the main map card and the large map header; original GPX name, date and coordinates remain preserved. Captions follow tracks during date/manual reordering and appear in history. The layout-order button moved beside the layout name at the top of the editor, using its existing compact mobile icon.

Validation: 920 critical tests, source check, production build and whitespace check passed. Sixteen Chromium/mobile WebKit scenarios passed across final runs: trip migration/switching, notes/video persistence, photo editing regression, date/manual map ordering, new video captions/pointer drag/player/confirmed deletion/cancel/reload, GPX captions, top order-button placement/opening, public captions and privacy, existing video player and horizontal media rows. Initial test failures were fixed in automation by waiting for save completion/selecting the intended restored layout and releasing simulated input focus before map drag. No physical iPhone verification was available.

Exactly five changed application files transferred via pinned FTPS; staged/live SHA-256 and public HTTPS verified. Zero photographs transferred. Backup: `/www/vniipo-help.ru/bike-packing-backup-before-v1641-20261003T101750Z/`.

| File | SHA-256 |
| --- | --- |
| app.js | BF53DE29B304B319BCA04AEF6ECED12E09789E201E33119B06B252F706DC8453 |
| index.html | F92F7E48E352407625B0B199F76040C965E2BACFE25F034734C571623DDA34A7 |
| styles.css | D375AC74B762EF9CDCB04E439942A88BC1956B7B9370903FF5D26386042C17D4 |
| sw.js | 053AF3F5E23997954C86F6AFB75E086C7B75FB335D762A45DD40C79D7683FED4 |
| release-contract.json | FE129EAF50ED5AFFDD19D144B323DB3E23F21C35D913CB4EA02304F5BC863111 |

No API server, shared service, GitHub Actions or Experiment changes.
