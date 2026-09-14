# Experiment v1616: ordinary recovery state identity

The published `/bike-packing/lists/:id/state` response carries assembled state,
revision and integrity metadata, but no list owner identity. Ordinary recovery
previously rejected that response before opening its recovery choice. The browser
fixture incorrectly supplied a complete `list` object and hid the mismatch.

Normal cold reads also retain the server envelope's `listId` when its nested
record has no `id`. Otherwise a confirmed save could be followed by a red sync
indicator on reload because baseline adoption received an empty list identity.

Recovery now reads authenticated list detail, then state, then detail again.
The list and owner must match the current editor and every revision must be the
same positive safe integer. Owner/access metadata must remain unchanged between
the detail reads. Payload and integrity fields come only from the middle state
response; detail payloads are ignored. A failed bracket stops that sync attempt
without falling through to a second recovery read. Subsequent writes still use
the ordinary numeric revision check and confirmed operation receipts.

The browser fixture now represents the two actual response shapes separately.
Regression coverage checks the manual recovery choice, concurrent revision and
owner changes, queue preservation before a choice, and the existing rebase,
conflict, cancellation, lost-acknowledgement and cold-start scenarios. Unit tests
also cover invalid identities/revisions, different payload aliases, failed reads,
context changes during requests and immutable input objects.

This is a frontend-only Experiment release; API a5a7904c is unchanged. Passing
fixtures does not establish the contents or successful recovery of a real phone
queue. Device acceptance still requires the published version, an explicit sync
and checking the resulting choice/confirmation without clearing site storage.
