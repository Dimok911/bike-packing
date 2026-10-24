# Independent BP2 confirmation page

This is a separate entry artifact. It must never replace the main BP2 app,
runtime chunks, photos, styles, service worker, or API data. It was extracted
with the Experiment owner from the reviewed Auth candidate; the stylesheet
is the hash-verified published ui-long-scroll-20261020 stylesheet.

Install the pinned build dependency with `npm ci --prefix standalone/bp2-auth-entry`.
Build with `node scripts/build-bp2-auth-entry.mjs`. The output contains exactly
three files for `/bp2-auth-entry.html` and `/bp2-auth-entry/` on the Experiment
origin. The global Auth feature defaults remain disabled; only this dedicated
bootstrap enables the confirmed handoff hook.

Prerequisites: merged Auth confirmation hook; A/B issuer and EU receiver with
expectedActorId checks. Do not enable Auth's Experiment entry mapping until
the new route and full confirmed identity handoff have passed installed checks.
The main application's direct Auth adapter is a separate integration step.
