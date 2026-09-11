# Experiment canonical session release

Prepared only. Publication requires the explicit approval pending in Shared
Services and confirmation that Shared Auth PR #6, commit
6084483f15cbbad23bb3e85617b8b25cb03724f5, is live. No production user sessions
or data are test fixtures.

## Authoritative baseline

- Frontend: 99caff653f5c3a3306bc316d51f96a4a14b0ae9f, v1604,
  `/var/www/experiment/release-contract.json`.
- API: 748cddae2303cdd393e06c014035583fc5468bc7, process cwd and current link
  `/opt/bikepacking-api-experiment/releases/748cddae2303cdd393e06c014035583fc5468bc7`.
- Published app SHA-256:
  `0c9ed9d65d704006251d837bbd4e6c5b78dd4914f1f82bde3fefb677e97020f6`.
- Published service worker SHA-256:
  `b3fb36b7a747657d810be64aac5584f25c52761b808650cf18e15371d2878264`.
- Published API server.mjs raw SHA-256:
  `696ec488cd4c3940578ec055d4584f96d116441aa7591863ede2b7e15ef3c324`.

The baseline build differed only by the catalog runtime chunk name. Its embedded
Blackburn SVG had CRLF locally and LF on the server. Normalizing only newlines
inside the base64 SVG makes the entire chunk byte-identical, SHA-256
`aa710028837ee6a482348b0389f5e118a0079b402f6f384731b91edc52883d0d`.
The SVG Git EOL rule prevents this build-only difference. No image content changes.

## Application behavior

v1607 uses `https://api.vniipo-help.ru/experiment/letters-vniipo/api` for the
complete Experiment API. Production hosts retain their previous API base.
Fetch/XHR/photo requests retain credentials. Old photo URLs normalize to the new
prefix, preserving list/photo IDs and query parameters. Auth goes directly to
Shared Auth; the new frontend never invokes experiment-share-session.

Startup/focus only reads auth/me. The sign-in dialog offers an explicit transfer
button, then falls back to the established email-link flow if transfer fails.
Successful transfer and logout clear the old experiment-host cookie through that
origin. Failed logout does not pretend the session was ended. Local storage keys,
IndexedDB, guest workspaces and saved layouts are unchanged. Service worker v1607
retains the existing update/reload mechanism and API cache exclusion.

## Release gates and order

1. Review the focused frontend and API PRs based on the deployed commits, not on
   the unrelated working branches. Require Frontend quality and the API MySQL
   workflow for the exact published SHA. API workflow also exercises Nginx with
   isolated Experiment/Production/Auth stubs, every HTTP method, photos, cookie
   cleanup and internal-route denial. No production data is accessed.
2. After approval, wait for Shared Services to confirm its Auth release first.
3. Prepare a new API release directory from the checked API commit. Keep the
   current release for rollback. Copy its env internally without logging it;
   set only `BIKE_PACKING_EXPERIMENT_CANONICAL_SESSION=1`. Keep service identity,
   DB selection, port 4312, photo storage and existing credentials unchanged.
4. Install the API repository's `experiment-canonical.locations.conf` into the
   API TLS server and replace the old experiment-host API location with
   `experiment-retired.locations.conf`. Back up both exact Nginx files first;
   validate syntax before reload. No existing Production routes are replaced.
   Old API requests return 409 with a reload message; a cookie-free public
   capabilities alias remains for pre-activation CI.
5. Verify anonymous capabilities and credentials preflight on the new prefix,
   private API rejection, direct Auth routing, internal 404, and legacy writer
   409 without Set-Cookie. Read-only Production capability checks must match the
   baseline. Never run logout or migration with real user credentials.
6. Build the clean frontend commit. Compare every build file with the saved
   live SHA-256 manifest, then rerun that comparison immediately before upload.
   Initial verified delta: app.js, index.html, release-contract.json, sw.js;
   no deleted code files and no changed/missing assets. Store exact final hashes
   and commit in the release evidence, since hashes belong to the final build.
7. Use deploy-experiment-vps.ps1 code-stage/code-activate mode. It rejects any
   changed asset, transfers only changed code, keeps the existing asset symlink,
   verifies stage file count/bytes/hashes, and verifies HTTPS after activation.
   Record `ftp-upload/release-evidence/<release-id>/transfer.json` and hashes.

## Recovery

Before activation save `/etc/nginx/sites-enabled/experiment.vniipo-help.ru` and
`/etc/nginx/sites-enabled/personal-tags-api.conf` under an isolated timestamped
backup directory. Baseline hashes observed on 2026-09-11:
`5fad09b2fedd4cc0c600d5942090831a345034002f610dbd07710aa4424b234c`
and `0e4fe32e5529a6fdbee33c31f31fb1d8cb084994efe27d957bc363dc2164be80`.
Recheck before changing either file because other services share the API server.

Frontend backup is `/var/www/experiment-backup-before-<release-id>`. Restore it
with code-rollback, restore both saved Nginx configurations, point API current
back to the exact baseline directory, and restart only bikepacking-api-experiment.
Verify nginx syntax, anonymous API responses and old frontend HTTPS hashes.
Never move `/var/www/experiment-shared/assets` or the API photo directory.
Restore the Experiment adapter/routing before considering a Shared Auth rollback.

The large guest-transfer/queue task and its working directories are excluded.
