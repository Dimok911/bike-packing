# Production v1615: unified introduction and consistent spacing

The controls row previously touched the photo section (measured gap approximately 0 px), while the description and metrics used separate margins. Photos and description now share one bordered About this layout section, one header and one collapse control. The introduction, metrics and section tabs use a consistent top interval: 16 px on desktop and 12 px on small screens. Inside the introduction, a 12 px gap separates photos and description; duplicate panel borders, backgrounds and outer margins are removed.

The whole introduction starts expanded for users and shared-link visitors. A manual toggle stores only this browser/user/layout preference using a new introduction storage key; old notes-only collapse preferences do not silently collapse the new block. Photos, description and video collapse together. Empty layouts have no empty introduction card. Existing admin photo variants and description ordering remain available.

Validation: source syntax checks, the production build, 891 critical tests and eight targeted Chromium/mobile WebKit scenarios passed. Browser coverage checks equal measured outer gaps, initial expansion, combined collapse, persistence after reload, re-expansion, shared-link read-only behavior, loaded photos, gallery navigation, and rich notes save/reload/discard. Live pre-release measurement confirmed the old uneven gap of 0 px above vs 18 px below.

The API, shared services and link editor are unchanged in this release. Publish only the five changed application files via the existing pinned incremental FTPS flow; no photographs. GitHub Actions is omitted under the owner's explicit instruction.

Evidence: ftp-upload/v1615/{critical.log,browser.log,production-comparison.json}.
