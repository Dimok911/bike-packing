# Production → Experiment: v1643 integration candidate

## Scope and bases

Local candidate only; no site, API service, database or photo store was deployed or migrated.
Frontend base: b2f73a507571cfba67639d7c0b78a563a718420c (Experiment v1642).
API base: 094a1c1d1fbd333842e5792d5d8896e7df200e37 (codex/whole-copy-release-api-v1627).
The BP2 owner confirmed both clean bases on 2026-09-26.
Frontend GitHub codex/experiment-whole-copy-v1627 is 15 commits behind this snapshot; the PR uses a new codex/experiment-v1642-integration-base pointing to the exact base so unrelated earlier work is excluded from its diff.

Production package: bb77f5d44fe9f848ebc6b3998bece3992d70cca7..b1a777e868b960dcf920c067456e5f1cb7392f29.

## Backport map

| Status | Functionality | Source / integration |
| --- | --- | --- |
| Ported | Stock independent of packing quantities; preparation lists, purchases, built-in categories, public privacy | v1606, 1616fad3c610b262f4a1a8aa4a4de4468a559358 |
| Ported | Preparation photos and inventory card alignment | v1607, 26d70d3380d69cd079299c78e2dce053948cabef |
| Ported | Multiple stock locations, item editor and mobile stock workflow | v1608, c7b1f486ab7bdf1fb99dfff644974458d20d2289 and 660936c0ef9d672c7aaeda4a952e214907e3c4b8 |
| Ported | Item/modal refinements (v1609), safe rich notes/tables/search/history/copy (v1610), note links and named-link editing (v1611) | v1609–v1611, 7293d19ca34bb826d51b4e0208f2567c24bb7970, 4263958f6cb4007235cdb0de3ad3898dc247d25a, 81bda11ea59af33586f734d4d2938ade9a4cba15, 266b7cb2fec40fd6bfa4da8ff48b094a8a2565e1 |
| Adapted | Dictionary mutation, photos/forms, pending import forms, stock dialog saves | Keep Experiment durable capture and existing transport; persist optional noteHtml and item stock fields, await acceptance before closing forms |
| Earlier gap closed | Comparison thumbnails/open item, available variants and selection | 6362f22a, b9e8464d; comparison arrows from c4561fb4 were already equivalent |
| Earlier gap closed | Desktop search layout | 09f85f2b |
| Earlier gap closed | Bundled gallery fallback 2.4.1 | Existing Shared Services artifact, 6047d8a9 / 5cb83d8b; SHA-256 88ac9af6260e1a323c43c054607579150091eebe0c860363b275a575aaf389ac |
| Already present / retained | Photo originals and zoom behavior | Equivalent behavior was present with Experiment transport adaptations; no transport replacement |
| Isolated candidate | BP2 note/stock field compatibility | API PR contains a patch and a read-only reproducible test, not an enabled runtime or a change to the BP2 owner's checkout |

Mobile validation additionally found a drag placeholder whose inline max-width bypassed the responsive CSS. It now stays within the board. Manufacturer catalog selection loads the rich note editor together with its plain text value.

## Data and publication boundary

Deploy the companion API field support before the frontend; retain current rollout gates and Experiment routing. No BP2 switch is part of this release. No SQL schema migration or photo-file transfer is introduced.
Normalizing legacy personal records assigns a default stock of 1 when absent, or 0 for the legacy Need to buy location; existing explicit stock including zero is retained. This is the Production inventory normalization, unrelated to BP2 pilot conversion. Back up the current Experiment data before publication and verify this conversion on representative legacy records.
Public exports omit personal stock. Rich note rendering sanitizes HTML; plain notes remain available to older clients. Clearing rich notes in strict form commands sends an explicit empty noteHtml to avoid retaining an old value.

BP2 remains a separate development pilot. Its owner reported isolated migrations of two Experiment scopes with history, a personal list with five layouts/history, and a separate current Production snapshot for copy/performance tests. Ordinary Experiment, Production and device stores have not been switched. Mass migration, ordinary-screen integration, rights/revocation and recovery/load acceptance remain outside this integration.
The isolated BP2 patch preserves source HTML bytes, absent-vs-empty fields, hashes and receipts; it extends existing conversion/copy/entity-create field validation only. It needs review and rebasing by the BP2 owner before adoption and does not add a general field-update command.

Publication still needs: review/merge of the paired changes; backup and recoverable staging; matching API rollout; browser/HTTPS verification of the deployed build and signed-in persistence/copy behavior. Production is not a deployment target here.

## Local validation

- Frontend source check passed; build passed through Playwright global setup.
- Critical suite: 1003 passed.
- Transport suite: 2907 tests across eight batches (Windows command-length limit); one fixture missing readNoteFields was corrected and its complete 390-test batch passed on rerun. No remaining failures.
- Browser suite: 35 passed in Chromium and mobile WebKit, including inventory, stock places, rich notes/links, comparisons and touch desktop photo navigation/zoom.
- API operations: 518 passed; API check: 89 tests passed plus syntax/payload checks.
- Isolated BP2 compatibility: 29 passed using the recorded 14-file input hashes.

CI was not used. No live MySQL integration, remote deployment or full BP2 acceptance is claimed. Browser tests exercise guest behavior; signed-in live API acceptance is a publication check.
