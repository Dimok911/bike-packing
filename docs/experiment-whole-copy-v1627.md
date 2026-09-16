# Experiment v1627 — whole administrative template copy

Release candidate integrates published v1626 (`521291db`) and its quiet photo
recovery improvement (`1dba5471`) with the whole-copy development chain through
`95e1b72b` and cancellation `424c9952`. Published compact rename, personal
IndexedDB mirrors/queues, large request-body storage and SSE are preserved.

Whole copy uses permanent operation/owner/photo IDs, independent copied files,
per-stage and parent receipts, exact source/target admission and retained
recovery. Acceptance permits subsequent edits. A committed response wins a
concurrent cancellation; a fully proved cancellation permits new source work
without deleting its journals, claims or reusing target IDs.

The joined application explicitly awaits IndexedDB mirror persistence before
whole-copy acceptance/live installation. The small acceptance marker remains
synchronous. It reads the current mirror repository rather than the retired
localStorage mirror. Create/copy pending candidates also await persistence and
roll back visible candidates on write failure. No async Storage.setItem shim.

The production-build profile enables CREATE, COPY and WHOLE_COPY only on the
exact Experiment origin. Tree and replacement remain separately disabled.
Default source gates remain OFF. Paired API candidate is
`35bb84f6bba17f5d0cd9a7f702322c7210dc8dc6`, based on released `fd984c0`, with the
same three additional flags and no new migrations/dependency lock changes.

## Validation and release evidence

Use focused real API/MySQL/browser verification including the entire shipped
release profile (personal IndexedDB enabled). The old admin-only browser mode
does not establish compatibility with the release. The browser driver reads
the actual mirror repository and independently verifies its native IDB row.
Do not count earlier localStorage-only exploratory runs as release acceptance.

Local evidence and report are retained under node_modules/.cache/v1627-verified;
paired browser artifacts under test-results/whole-joint-api-browser. API stage
evidence is in the paired API candidate's node_modules/.cache/v1627-api-stage.
Publication uses ApplicationOnly plus the explicit local validation report,
preserves static photo assets, verifies hashes and does not use GitHub Actions.
This source document is a candidate specification, not proof of activation;
the deployment report and public HTTPS verification establish publication.

## Phone acceptance after publication

1. Verify v1627. Open a private administrative template with photos and copy
   the whole template under a distinct name.
2. Check bags, contents, unplaced items and photo previews/full-size images.
   The original must remain unchanged.
3. Rename one item in the copy, wait for server confirmation and reload.
4. Check on the other device; the copy and new name must be retained.
5. On a separate test copy, interrupt connectivity, then resume or cancel from
   recovery. A successful resume must not create a duplicate. A confirmed
   cancellation must allow a fresh attempt with a new name/identity.

Card 3.3 is development-ready only after browser/API verification. Publication
and phone acceptance remain separate statuses. This release does not complete
3.4, B2, partial loading, expanded offline catalogs or the remaining migration.
