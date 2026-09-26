# Production v1613: history details, rich layout notes and photo views

This frontend release follows v1612. The API remains on d42beebe9c65d5b71c7f21b5ba36da47322746ac; no server maintenance or backend rollout is required.

## User-visible changes

- History details show layout-specific item quantities with the item name and before/after numbers. Changing only quantity no longer claims that items moved.
- Changes to item, bag and layout notes display sanitized formatted Before/After blocks, including links, lists and tables. HTML is never printed as source, and stale formatting from older clients falls back to plain text.
- Layout editing uses the existing rich-note editor: bold, italic, underline, lists, named links and formatted paste. The summary renders the same formatting, and locked-layout backup restoration preserves both text and formatting.
- Fullscreen photos opened from either the layout editor or summary include every photo in the selected layout, in its saved order, starting at the clicked image.
- Above the packing summary, photos have three selectable presentations: А strip, Б featured first photo, В compact grid. A fourth button hides the block. The choice is stored on this device and is separate from the existing numbered packing styles. Controls are in Menu -> View options. Adding, removing and ordering remain in Edit layout.
- Empty layouts have no empty photo panel; switching layouts never retains images from the previous layout. The photo panel also displays the saved video link.

## Validation

891 critical tests passed, including explicit quantity and format-only history cases and rich layout-note persistence. Source syntax checks and the production build passed.

Chromium and mobile WebKit cover formatted notes, links, reload/discard, safe rendered history, and photo gallery/view controls. Windows WebKit cannot store Blob values in IndexedDB (Error preparing Blob/File data to be stored in object store), so its photo scenario uses already-synced image fixtures; real file import is covered by Chromium. One pre-existing mobile new-item/bag form-draft scenario is explicitly skipped by that test suite.

## Publication

Publish only app.js, index.html, styles.css, sw.js and release-contract.json using the existing incremental FTPS script. Preserve all existing photographs. The exact preflight hashes are recorded in ftp-upload/v1613/production-comparison.json. A recoverable file backup and both FTPS/HTTPS verification are required. GitHub Actions is waived by the user's explicit instruction; commits use [skip ci].

Publication result and rollback location will be recorded after verification.
