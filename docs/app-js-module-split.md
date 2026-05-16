# App JS Module Split

`app.js` is being split gradually into plain ES modules. The goal is to make data bugs easier to isolate without changing the app stack or adding a build step.

## Current Direction

- `src/config` keeps app constants and storage/API keys.
- `src/data` keeps static dictionaries, demo/shared seed data, and simple data guessing helpers.
- `src/utils` keeps small pure helpers for time, JSON, HTML escaping, language, weights, and byte formatting.
- `src/state` has safe state shape, layout arrangement helpers, state diagnostics, and the first normalization helpers.

## Working Rule

Each step should be small, behavior-preserving, and easy to revert. Core state helpers should stay free of DOM and fetch. Sync code should stay out of UI rendering. UI code should consume prepared state instead of repairing data structure on its own.

## Next Slices

The next useful slices are the rest of state normalization, layout repair, sync serialization, then public/demo copy logic. UI rendering and drag/drop should stay near the end because they have the stickiest dependencies.
