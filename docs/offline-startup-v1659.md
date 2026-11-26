# Offline startup candidate v1659 — 2026-11-26

Baseline: `455c8794dbc0c364d734eaa288c7345621f983d7`, the merged
`codex/auth-live-v1657-base` production branch. Read-only HTTPS verification
confirmed live v1658 and the unchanged API compatibility contract
`2026-08-30.split-services-bridge-v1` (68 capabilities). GitHub main is still
v1595 and is not the source for this release.

## Behavior

- Saved navigation falls back after 1.5 seconds if the network stalls, and also
  falls back on HTTP errors. The old worker cannot overwrite its saved shell
  with HTML referring to another release's assets.
- Startup exposes the permitted local scope immediately when the browser
  reports offline, or after the existing 1.2-second startup grace period when
  authentication stalls. Authentication and synchronization continue normally.
  Explicit sign-out still prevents access to remembered private layouts.
- A separate connectivity state tracks background API failures, browser network
  events and actual responses. A browser online event means checking, not proof
  of connectivity. Successful requests override incorrect Safari offline hints;
  stale requests cannot override more recent transitions.
- Worker activation only retires old caches wholly owned by this application's
  scope. Other applications, Experiment and mixed caches remain untouched.
- The build derives the worker from the same source used by regression tests.
  Shared Auth, shared gallery, backend and data contracts are unchanged.

## Validation

- Source syntax check and production build passed.
- Critical tests: 979 + 2 passed, including nine new behavioral checks for
  navigation deadlines, cache integrity/ownership and connectivity ordering.
- Browser tests: six passed, three each in Chromium and mobile WebKit. They
  cover a stopped/restarted static HTTP server, saved assets, offline new-tab
  startup and reload, recovery without replacing the document, preserved guest
  data, stalled authentication, remembered private data and explicit sign-out.
- Protocol offline emulation in Windows WebKit prevented cached fetch dispatch;
  the final test stops the real local server instead. Network hints are modeled
  separately. This is automated mobile WebKit coverage, not physical iPhone
  acceptance.
- Live API compatibility check passed. No GitHub Actions were invoked.

## Release preparation

The reviewed HTTPS comparison is in ignored
`ftp-upload/v1659-offline/incremental-manifest.json`. Exactly four application
files change: `app.js`, `index.html`, `sw.js`, `release-contract.json`.
`styles.css` matches production. Photographs and user data are excluded.

This document records a tested candidate, not a completed deployment.
Publication still requires PR review and the existing guarded incremental FTPS
flow with baseline revalidation, verified rollback and public hash checks.
Retention must use the standing 0-confirmed / 2-unconfirmed policy; the legacy
five-release planner is not evidence of compliance with that policy.
