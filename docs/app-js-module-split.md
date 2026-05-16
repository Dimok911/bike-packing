# App JS Module Split

`app.js` is being split gradually into plain ES modules. The goal is to make data bugs easier to isolate without changing the app stack or adding a build step.

## Current Direction

- `src/config` keeps app constants and storage/API keys.
- `src/data` keeps static dictionaries, demo/shared seed data, and simple data guessing helpers.
- `src/utils` keeps small helpers for time, JSON, HTML escaping, language, storage, weights, and byte formatting.
- `src/state` has safe state shape, layout arrangement/normalization helpers, item photo metadata, state diagnostics, repair helpers, and field normalization.
- `src/sync` has the API client helpers, history helpers, payload reporting, photo cache/prep helpers, state serialization helpers, and entity sync payload helpers.
- `src/public` has scope/read-only helpers, shared layout helpers, public artifact checks, and the first public-to-private copy helpers.
- `src/ui` is starting with DOM refs.

## Working Rule

Each step should be small, behavior-preserving, and easy to revert. Core state helpers should stay free of DOM and fetch. Sync code should stay out of UI rendering. UI code should consume prepared state instead of repairing data structure on its own.

## Next Slices

The next useful slices are the remaining state cleanup helpers, API client, then public/demo copy logic. UI rendering and drag/drop should stay near the end because they have the stickiest dependencies.
