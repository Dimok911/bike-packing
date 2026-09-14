# European API and VPN status investigation — 2026-09-14

## Reported browser behaviour

The user reports that the frontend address becomes unreachable through their foreign VPN. Their sequence is: open without VPN, select Europe, reload, then enable VPN. The active route is reported as European; the header says that five of five personal layouts are loaded, the sync dot remains orange, and clicking it produces no message. The user's authenticated browser session was not available to this investigation. Frontend server geography and the VPN's routing/filtering have not been independently established.

## Established findings

- The public Experiment page still serves v1610. Its published JavaScript contains the same diagnostic and sync-status wording inspected in release checkout `707426117ad5a395e53841f0d739f162f16bb0dd`.
- At 2026-09-14 07:00:18 UTC, the European capabilities endpoint returned HTTP 200, `X-Vniipo-Proxy-Target: bike-packing-experiment`, and `X-Vniipo-Proxy-Write-Gate: enabled`. This anonymous check does not establish the user's authentication or confirm any saved operation.
- The European diagnostic checks capabilities/write permission and then `/auth/me`. It neither switches the active route nor drains the user's save queue. Success therefore does not clear the sync indicator.
- Orange is `sync-dirty`: the UI still considers local changes pending. A remembered offline session with dirty state also uses this colour. The indicator is not a measurement of frontend-host reachability.
- The auth coordinator originally replaced handled remote-load failures with `setPersonalLayoutsLoadedStatus()`. That status counts the current local layouts. The resulting “5 of 5” message therefore was not reliable evidence that a remote load succeeded.
- `savePersonalStateFromOutbox({notify: true})` returns without status/notification when `outbox.hasPending()` is false. An isolated execution of the actual v1610 function with an empty queue and `syncMeta.dirty === true` preserved dirty state and emitted no feedback. This proves that a silent path exists; it does not establish that the user's queue is empty or that their data was saved.
- Existing `sync-visual-state.test.js` passes 10/10 on the active development checkout. Those tests do not reproduce the user's VPN/session or establish the state of their saved operations.

## Local corrections and follow-up boundaries

Handled remote-load failures now return an explicit unsuccessful outcome to the auth coordinator, so it retains the warning/error instead of announcing success. Successful empty-server and local-dirty flows keep their existing completion behaviour. This correction does not reset dirty flags, clear queues, or infer a write confirmation.

The empty-queue save path now compares the current business payload with the queue's last confirmed base and requires a valid confirmed revision. Only an exact match permits persisting a corrected dirty flag. An explicit click explains that data matches the **last confirmed** server version, without claiming a new remote check. Missing/different bases retain the flag and explain that server comparison is required. A failed local status write retains dirty state and original confirmations. No operation or receipt is manufactured, deleted or replayed by this correction.

Five new regressions failed against the old empty-queue path, then passed with the fix. The entire `personal-save-outbox.test.js` suite passed 88/88. Tests use the actual app save function and real in-memory outbox; they cover confirmed UI-only edits, missing/different bases, automatic versus explicit feedback, status-storage failure, and unchanged queue bytes. The user's particular session and VPN remain unverified.

For load-status handling, the old code failed nine new refusal cases while four successful-load controls passed. The corrected focused load/freshness/migration suites passed 112/112; an independent review found no blocker in the empty-queue correction. The final critical suite passed 931/931, and source validation passed. Focused and critical suites overlap; these counts must not be summed into a unique-test total. These are local tests, not a live VPN or authenticated server-write acceptance run.

Route switching currently takes effect at the next page load. The user's VPN workflow requires switching API routes inside the already loaded page; automatic reload is insufficient. A future implementation must wait for active writes, retain existing operation identities and recovery records, resolve uncertain outcomes on their recorded route, verify the destination and current account, and show a definite completion/failure result. API reachability alone cannot make frontend assets reachable; uncached scripts/styles/fonts and other frontend-hosted resources may still fail after the VPN is enabled.

No user data was changed by these diagnostic reads. No publication is implied by a local fix.
