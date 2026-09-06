# Future Production batches — tracking only, not deployment permission

User instruction (2026-09-06): continue development, **do not transfer or publish
anything yet**. Keep an explicit record of the portions that may be transferred
later. A green test run, commit or this document is not permission to deploy.

## Baselines and rule

- Experiment frontend baseline before transport preparation: `99caff6` (v1604).
- Unpublished whole-transport candidate: `489482973c7e407d76a6ddf57a44c5ad88776fc7`.
  It changes direct writes and remains blocked; never merge/publish this whole
  branch as a supposedly diagnostics-only release.
- Upload recovery work starts from that frontend candidate and backend
  `748cdda` on `codex/experiment-catalog-scan-sort-memory`.
- Production checkout inspected at `9c8f360` (local version v1594). Re-check
  current Production SHA and public version immediately before any future merge;
  other tasks can advance them. A checkout version is not proof of publication.

Keep commits separated by purpose and keep linked frontend/backend commits,
schema scripts, test evidence, rollout and rollback requirements together.
Select changes against the then-current Production baseline, not the whole
Experiment branch. Do not include secrets, ignored deployment configuration,
test accounts, production database dumps or proxy infrastructure in commits.

## Batch 1 — bag manufacturer catalog

Content/runtime work: `src/data/manufacturer-bag-catalog*`, manufacturer runtime
chunks, catalog sources and assets. UI work: catalog dialog/comparison, brand
marks, descriptions and catalog photo integration. Audit corresponding tests
and imports as part of the same slice. Generated catalog snapshots must match
their sources; do not take only generated files without that check.

There are catalog differences between Production's inspected baseline and
Experiment v1604. This is **not** an exact approved commit/file list for rollout:
prepare a focused diff first, excluding unrelated auth/transport/gallery changes.
If a catalog-management change needs backend scan/review support, explicitly
record its existing deployed capability or paired backend change; do not assume
all catalog work is static data.

Gate: catalog content/inventory review, lazy image loading, mobile filter/scroll
and comparison tests, build and browser suite on the selected Production slice.
Does not require photo operation receipts or the EU route. Roll back frontend
artifact/data snapshot together with matching asset/runtime manifests.

## Batch 2 — operation acknowledgements, first slice: personal photo upload

Current implementation scope is owner/private-list `POST .../lists/:id/photos`
plus protected read-only `GET .../lists/:id/photo-operations/:operationId`.
One operation ID, authenticated actor/environment/target/content binding,
atomic photo row + terminal receipt, crash-safe file ownership and client
GET-only recovery of a lost result. Copy/delete/list/entity/admin/auth writes
are **not** included. Their acknowledgements need later separately audited slices.

Backend package: photo-operation module, upload/status route integration,
additive `2026-09-06-photo-upload-operations.sql`, unit/MySQL fault tests.
Frontend package: photo recovery controller, upload/transport integration,
durable intent/receipt and cold/reload/cross-route tests. Keep exact tested SHAs
in the final development handoff; commits alone do not activate the feature.

Verified upload-only development pair (2026-09-06): frontend
`01c33903c442499dd125e8909c5cba5f08ffa8ea`, backend
`394d6305f14b7fa4c6482236be9b9e03398f97c5`.
Frontend CI: https://github.com/Dimok911/bike-packing/actions/runs/34034841751
Backend/MySQL/browser CI: https://github.com/Dimok911/bikepacking-api/actions/runs/34034903635
Both succeeded. No live schema or feature activation followed these checks.

Next-batch endpoint/effect inventory is in the backend's
`docs/operation-effects-inventory.md` and `docs/operation-coverage.json`.
It includes side-effect GETs, lazy migration/file materialization, queue/batch
boundaries and owner-coordinated Shared Auth work. That inventory is not new
receipt coverage. Catalog handlers are inventoried but explicitly deferred.

Current code is gated for Experiment. **Do not enable the Experiment auth bridge
on Production to make it work.** A future Production slice must deliberately
adapt the environment namespace and deployment configuration, preserve separate
actors/receipts/scopes, and test against Production auth without relaxing it.

Future rollout order, only after separate authorization:

1. Verify backups and approve additive schema/namespace/retention plan.
2. Apply migration; deploy backward-compatible backend with writes feature off.
3. Verify capability/status/auth and file+DB durability on disposable data.
4. Deploy compatible frontend with the pilot off; then explicitly enable the
   approved scope/accounts and check direct mode before any alternate route.

Rollback: stop new protected writes, preserve ledger/receipts/files and keep a
compatible status reader for outstanding IDs. Do not drop the table, delete
unknown intents, or downgrade to a blind writer with pending protected work.
No automatic receipt expiry or file garbage collection is part of this slice.
Unknown old client IDs that never reached the server cannot be retroactively
confirmed. Recovery of photo uploads alone does not remove the whole-transport
candidate's global direct-write blocker for other types of mutation.

## Batch 3 — optional alternate API route

One existing API backend, two network routes. Route configuration and diagnostics
are separate from catalog content and operation acknowledgements. Current EU
client source gate remains off and coordinator owns the read-only proxy gate.

Option A: a **new**, minimal read-only diagnostics slice preserving existing
direct behavior. The whole candidate `4894829` is not this option.
Option B: a restricted EU write pilot with an explicit endpoint/account allowlist,
live TLS/CORS/Safari auth checks and operation-specific recovery. Do not claim
photo-only recovery covers all sync or that a complete ledger is necessary just
to set up HTTPS diagnostics. No route/Production activation is implied here.

## Already separate: fullscreen gallery

Shared fullscreen navigation/gallery changes had their own Experiment and
Production handoffs. Re-check the deployed shared module version before a later
release; do not count them automatically as new catalog or operation-receipt work.

## Handoff checklist for each approved batch

- Exact source/target SHAs and focused diff; clean working trees.
- Coverage and exclusions; paired repositories and minimum API capabilities.
- Migration/asset dependencies and explicit settings (without credentials).
- Full test-run links, cold/mobile tests where relevant, known limitations.
- Backup/rollback procedure and treatment of in-flight/unknown operations.
- Separate user authorization to transfer, and separate activation scope.
