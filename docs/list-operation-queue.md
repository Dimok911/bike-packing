# Persisted list/entity queue — disabled development candidate

NO DEPLOY / TRANSFER / ACTIVATION. `LIST_OPERATION_QUEUE_ENABLED=false` and
`EU_TRANSPORT_RELEASE_ENABLED=false`. Backend partner: list-operation gateway
introduced at `0dec7d2`, tested through `df7f461`. Additive SQL remains unapplied
on live databases. This is not universal recovery or a whole-direct release gate.

The API client can route seven existing personal create/update/delete/entity
requests through `/bike-packing/list-operations`. Application context supplies
authenticated user, personal vs readonly scope, local modification timestamp,
active list ID and serialized local state. The queue checks the same context
before dispatch and before returning a result. Normal runtime is unchanged while
the gate is off; computing a large context snapshot is lazy and gated too.

A cross-tab Web Lock serializes dispatch. Before sending, the existing durable
transport journal stores the operation UUID, frozen JSON body, kind, target,
actor, generation, payload digest and child entity IDs. Same logical generation
and request recover the same ID across reload/tabs/direct/EU; later intentional
edits have different generations/IDs even if their data is equal. Each frozen
entity batch has its own ID; child IDs and partial outcomes are checked exactly.
Duplicate/missing child IDs are rejected before sending.

Lost or malformed results, timeout, HTTP error and unknown status NEVER trigger
another POST, a route failover, or a fallback list creation. Recovery GET requires
the exact actor/environment/kind/target/digest/ID. The global barrier remains for
unresolved older actions, including another account's or old unprotected intents.
Known server rejection is persisted and returned as a business error, not
mistaken for outer-envelope HTTP 200 success. A stale rejection carrying an old
server payload is not applied blindly.

Before releasing a write barrier the journal atomically replaces the frozen
large body with a compact terminal proof and child identities. No list snapshot
is copied into that proof. If the tab dies before applying the response locally,
replay reads the full server receipt again. Storage failure retains the original
intent/barrier. There is no automatic expiry, pruning or blind writer fallback.
Compaction reduces growth, but browser quota/private-mode durability and eventual
terminal-ID retention still require a rollout policy; storage is not infinite.

A receipt proves a historical action, not current state. A freshness read must
match the receipt's revision; an acknowledged deletion must still be absent.
Changed server revision, deletion/recreation, account or local generation stops
application of the historical payload. Whole-save completion also checks the
local generation before clearing dirty state. Such conflicts may pause for
reconciliation; automatic rebase/application of every old generation is NOT
implemented. Do not advertise that all interruptions now self-heal.

Read-side auth renewal/local user provisioning and existing freshness migrations
are outside this receipt's business guarantee. Fixed-RU bootstrap, cookie scope,
Shared Auth, proxy infrastructure and catalog are unchanged. Photo copy/delete,
admin/template/import/restore/shares and other excluded routes still need their
own protocol slices. This queue is not a file-side-effect wrapper.

Checks: critical contracts, operation-queue unit tests, Chromium and mobile
WebKit fixtures for lost ACK/reload/cross-route and cross-tab replay, stale local
generation and advanced server revision. Browser fixture routes are simulated;
they do not establish live EU TLS/cookie or production behavior. Paired real
MySQL checks must be recorded with exact frontend/backend SHAs before rollout.
