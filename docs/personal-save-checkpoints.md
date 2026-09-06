# Personal journal: immutable checkpoints

Local Experiment slice, 2026-09-07. No publication, live migration, route
activation or Production change. This is part of release batch 2.

## Why the singleton was replaced

An action already has an immutable UUID/body, but the previous `anchor` key was
a mutable read-modify-write. A cleanup prepared before another tab adopted
revision 20 could replace that baseline with revision 15 (or remove it). A
post-write head-ID check was insufficient: both tabs could have the same head.

The new implementation uses independent `checkpoint:<UUID>` keys. Each contains
the confirmed head ID, its local generation, server revision, exact retired IDs
and, optionally, a newer confirmed remote baseline. It is published atomically
before any cleanup. An existing checkpoint is never overwritten.

## Reading, confirmation and cleanup

- Repeated scoped-key scans must agree before validation. This is a stable
  observation, not a localStorage transaction, lock or CAS. Later writes still
  require immutable records, post-checks and the backend's revision transaction.
- Certificates for the same head combine retirement sets and select the
  highest **server revision**. Different payloads for one baseline revision are
  an error; neither browser time nor UUID sorting decides which data wins.
- A newer-generation certificate must explicitly retire the earlier certified
  head. A larger generation alone never authorizes dropping a competing branch.
  A delayed remote baseline attached to an older related head is carried forward
  if its server revision is at least the latest local confirmation's revision.
  Advancing the local head must not hide knowledge of a newer server state.
- Applied markers use `applied:<operation ID>:<revision>`. Identical receipts
  are repeatable; inconsistent revisions cannot overwrite one another and are
  blocked. A local applied marker is not a substitute for a server receipt.
- Cleanup deletes only exact old action/applied keys and checkpoint keys from
  its original observation. The replacement carries the observed certificates'
  evidence. A concurrently appended action or checkpoint is not a cleanup target.
- The editor observes the logical head **and baseline**, not a physical
  checkpoint key. Ordinary cleanup does not invalidate it. An unseen baseline
  change does, even if no new action was appended.

After ordinary successful cleanup, fresh-format storage has one full action,
one applied marker and one checkpoint. Concurrent/interrupted cleanup can leave
extra certificates until a later cleanup. Large old payloads are removed, but
retired UUIDs remain: a suspended writer may publish its old certificate later.
The metadata therefore grows with confirmed history; it is **not a constant
storage-size guarantee**. A future bounded archival scheme needs its own proof
and acceptance tests. Quota still pauses safely and permits diagnostic export.

## Compatibility and rollback boundary

The reader accepts old action records, `applied:<operation ID>` and `anchor`.
The legacy singleton is read-only and retained (one extra key): read-then-delete
would create another race with an old writer. New-format cleanup can remove
observed retired legacy actions/applied records after publishing their evidence.

Old clients do not understand the new checkpoint/marker keys. All personal
outbox release gates have remained disabled; no migration of a publicly enabled
personal journal is claimed. Before future activation, test client/PWA upgrades
and require a compatible recovery reader for rollback. Never roll back by
clearing receipts, tombstones, local pending actions or the journal.

## Coverage and remaining work

Regression tests reproduce the old race before the fix and cover cleanup versus
baseline adoption in both orders, 15/20 refresh races, two cleanups, a delayed
old cleanup after a new confirmed head, capture during cleanup/adoption,
publication/deletion crash boundaries, changing storage enumeration, quota,
legacy records, inconsistent certificates/ACKs, large payloads and late branches.
Chromium/mobile WebKit also exercise a prepared old checkpoint published from
another tab after a fresh baseline, then reload and the next exact-revision edit.
Full UI fixtures cover lost ACK, failed local applied, recovery export and CRUD.
Browser API responses are simulated; these are not new paired MySQL results.

Compatible field merging is an explicit opt-in to
`mergeStateFromBase`, default **off**. It supports independent name/weight/note
changes for existing items/bags, plus bag volume. Same-field disagreement,
delete-versus-edit, concurrent creation, photos, dictionaries, arrangements and
unknown fields do not become automatic scalar merges. Default legacy callers
remain unchanged. The disabled personal UI pilot now enables this policy only
inside the receipt-checked reconciliation adapter described below.

The causal adapter settles every retained old operation by its exact receipt,
retain unknown/in-flight operations and both conflicting inputs, establish the
correct common base, and persist a new merge action with a new UUID and current
server revision. It must never mutate an old queued body or reuse a rejected
UUID with different data. Late server edits must trigger another comparison,
not a forced retry with only the revision number advanced. This is required
before removing the current stale-tab/fork stop or enabling the release gates.

Adapter audit: `list-operation-queue.js` still checks freshness before
returning even a rejected historical operation, and `receiptOnly` is a
committed-operation path. The new GET-only `inspect` method distinguishes
terminal evidence from authority to apply its old server payload. A verified
old rejection can be historical evidence without making its snapshot current.
The existing `save-remote-state-flow.js` forced-conflict retry advances the base
revision and retries its candidate; do not reuse that path for automatic causal
merges. Recompute against new remote data instead, with account/editor guards.

## Receipt-checked reconciliation (2026-09-07)

The first local mutation freezes the exact remote base observed by the editor
with the immutable action. Subsequent actions use the confirmed predecessor or
an adopted baseline; a mutable shared mirror is never reconstructed as the base.
Older journals without such evidence remain readable but cannot auto-reconcile.

`outbox.reconcile` inspects exact IDs/bodies and requires terminal evidence for
every retained action, with a final confirmed revision conflict. It reads a new
owner-bound current list separately, performs a three-way comparison, and writes
a NEW UUID/body/snapshot/merge-base plus historical-settlement lineage in one
storage entry. Old bytes remain intact. Server dependencies of this new root
are empty, with the fresh `baseStateRevision`; its local predecessor remains
explicit. Every drain rechecks the historical evidence before dispatching it.
Only confirmed compaction can retire those old records. A historical receipt
never installs its payload as current UI state.

The real personal save button/autosave path uses this adapter. A second server
edit triggers a new comparison, not only a changed revision number. At most two
automatic reconciliations happen per save attempt; continued churn pauses.
The UI installs only the exact durably recorded candidate; normalization that
would change its business payload stops the operation. No force flag survives.

Unknown/waiting descendants, non-revision rejections, deleted lists, unsafe
identity/map data, missing base, incompatible changes and files stop this path.
Same-field and delete-versus-edit conflicts still require an explicit user
resolution/recovery adapter. A fully committed but now stale head also requires
a separate durable current-state adoption path. True forks/stale editors remain
latched; this change does not remove those protections.

Verification: 141 transport tests, 887 critical tests, source check, ordinary and
isolated builds, 74/74 Chromium/mobile WebKit scenarios (no retries). A signed
portable Oracle MySQL 8.4.11 ran locally on loopback with a unique disposable
data directory: 21/21 real API/MySQL tests, including this frontend adapter,
two rejected revisions -> new commit -> lost ACK -> reload and DELETE -> old
SAVE. No cases skipped. This is a local paired run, not a new GitHub CI run.
`scripts/test-causal-with-local-mysql.ps1` verifies the exact server data path
before test database creation, restores process environment and stops its child.
The runtime/archive/test data are ignored; no Windows service was installed.
