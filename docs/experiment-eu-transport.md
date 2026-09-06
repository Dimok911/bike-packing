# Experiment API route selection and release gates

Frontend remains **https://experiment.vniipo-help.ru/**. Production/Initial and
backend 4312 are unchanged. Top menu → API route (also available in Settings)
stores an allowlisted
`auto` / `direct` / `eu` preference in the existing per-tab sessionStorage key.
The default preference is `auto`; a previous explicit manual choice is preserved.
Manual mode overrides automatic choice. It takes effect on the next reload,
never mid-request, and never clears local state, pending writes or receipts.

The automatic **initial route selector is implemented, but release-gated**.
`AUTO_TRANSPORT_RELEASE_ENABLED = false` keeps Auto on the Russian route in the
shipped source; `EU_TRANSPORT_RELEASE_ENABLED = false` separately blocks EU.
Saved preferences and successful diagnostics cannot override either release gate.
Browser tests inject separate enabled test transports; live activation is not
authorized by these changes. No business request is automatically replayed.

## Selection rules

| Preference | Initial preparation | Alternative |
| --- | --- | --- |
| Auto (when separately enabled) | Anonymous GET to exact Russian Experiment capabilities URL | EU descriptor only after network/timeout/408/5xx failure |
| Russian | Fixed Russian Experiment address | None |
| European | Verify EU identity, API compatibility and open write gate | None |

RU 401/403/404/409/429, redirects, invalid JSON and incompatible API responses
do not permit fallback. EU remains the exact domain below, never the IP.
Neither probe creates business data or confirms a user's authentication.
Timeouts include decoding the response body. Parallel preparations share one
probe chain; a late probe cannot change the winning route. Both routes failing
leaves data untouched; a later explicit synchronization may retry preparation.
After successful selection the route is pinned for the tab's lifetime, including
photos, until reload. This is not a mid-request or per-photo failover mechanism.

Unconfirmed journal entries override RU-first priority **in automatic mode**:
the prior route is pinned for receipt reconciliation, not retried elsewhere.
Mixed/unknown journal routes stop automatic selection. A new pending operation
appearing in another tab during the probes is rechecked before selecting EU.
Manual selection may choose the route for reconciliation after reload, but
does not remove the write barrier or authorize a fresh POST. Existing receipt
validation decides whether any specific operation may progress with its old ID.

The top-menu entry is available without sign-in, including when the server is
unreachable. It is hidden outside the exact Experiment origin. Its dialog uses
the shared modal/scroll-lock controller and distinct field IDs from Settings.

Local evidence for the selector/menu: eleven dedicated unit scenarios plus the
transport/queue browser suite (40 Chromium/mobile-WebKit scenarios). These are
isolated fixtures, not proof of live EU session/cookie or server write readiness.

## Agreed route and activation gate

Coordination update, 2026-09-06: the infrastructure owner reports the domain
active with trusted TLS, domain guards 11/11 and certificate renewal dry-run
passing. The previous domain-activation/TLS blocker is superseded. This is
reported infrastructure evidence, not a frontend live-auth or write test.
The configured EU base below already uses the domain, never the diagnostic IP.
Writes and verify GET remain blocked by the proxy; frontend release flags stay
off. Recovery coverage, authenticated cookie/session checks (including real
Safari), explicit write-gate approval and an approved isolated write smoke
remain required before calling this usable EU synchronization. Fixed-RU shared
session bootstrap and Production/Initial are unchanged.

- EU base: `https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api`.
- Proxy strips only initial `/experiment`, routes the entire namespace to
  Experiment 4312, including `/auth/*` through its existing cookie bridge.
- `/bike-packing/capabilities` must match the application's required API version
  and all required capabilities, and expose:
  `X-Vniipo-Proxy-Target: bike-packing-experiment` and
  `X-Vniipo-Proxy-Write-Gate: enabled`. Missing/wrong identity, read-only gate,
  failed DNS/TLS/CORS, or API mismatch prevents EU requests.
- Probe is anonymous (`credentials: omit`, `redirect: error`); authenticated
  requests are not started by an unverified transport. Settings separately checks
  `/auth/me` only after the domain and write gate pass. Anonymous success never
  claims authenticated sync or successful mutation/upload.
- IP `https://201.51.16.219/experiment/letters-vniipo/api` is diagnostic only.
  No IP selection, user cookie requests, insecure TLS, or frontend relocation.

## Auth, CORS and writes

`bikepacking_experiment_session` retains Domain=.vniipo-help.ru, HttpOnly, Secure
and its existing SameSite attribute. It works on the same-site EU subdomain,
not on the IP. Generic `/auth/` Shared Auth is **not** used by this transport.
The existing host-only shared-session bootstrap remains an explicit POST to
`https://api.vniipo-help.ru/letters-vniipo/api/auth/experiment-share-session`:
the host-only Shared Auth cookie cannot be obtained on api-eu. Its availability
is not assumed. New login uses the Experiment bridge and POST token verification.

Proxy preserves Origin. The agreed proxy guard requires exact
`Origin: https://experiment.vniipo-help.ru` for mutations and OPTIONS; absent or
foreign origins are rejected. ACAO is exact, ACAC=true and Vary=Origin. OPTIONS
allows Content-Type and actual GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS methods.
No custom authentication/CSRF header is added. XHR multipart upload uses browser
boundary and credentials; its progress listener triggers preflight. GET/HEAD
verify-magic-link stays forbidden at proxy even after enabled; email navigation
requires a separate contract. No cookie/Origin/CSRF relaxation is part of this work.
Fetch forbids redirects. XHR cannot disable redirects before dispatch, so the
proxy must intercept upstream 301/302/303/307/308 as errors before opening its
write gate. XHR additionally rejects a changed response URL, retaining its intent.
The Russian shared-session bootstrap has a bounded 7-second timeout and no retry.

Each Experiment unsafe request, **direct and EU**, writes a durable localStorage
intent before dispatch. The fixed RU shared-session bootstrap participates too;
it is not a transport fallback. Web Locks serialize check-and-register across
tabs, with a separate key per operation. Missing locks or failed persistence
fails closed before sending. The short critical section does not encompass the
network transfer: independent photos in the owning page remain concurrent.
Another tab's pending intent blocks its writes, without claiming the independent
edit is a duplicate. Other pages/closed and reopened tabs use the same journal.
Selection is immutable for a page; changing next-reload settings, switching
accounts, offline reconnect, or duplicating a tab cannot reset the barrier.
No request bodies, tokens or server response payloads enter the journal. Local
operation UUIDs and timestamps are diagnostics, not server idempotency keys.

Network failure, timeout (including response-body timeout), 408/5xx (including
proxy `upstream_redirect_rejected` 502), invalid success JSON or page interruption
retains the intent. Late fetch/XHR success after timeout cannot acknowledge it.
Autosave cannot dispatch subsequent mutations, and the photo batch stops picking
new work. Already dispatched independent operations may still settle. Known
401/403 are HTTP/auth errors, never a reason to switch endpoints.

Photo intents include a digest of target route, photo/entity IDs and file bytes
(copy operations use source IDs). A confirmed photo receipt remains durable to
block stale queue replay even if the page died before persisting its local ACK.
Different photo IDs or changed bytes remain distinct; general edit bodies are
not treated as operation IDs. Receipts are not automatically pruned: exhausting
storage blocks new writes, not silent loss of protection. Their removal needs
a future audited retention/queue-reconciliation policy.

**Hash-only recovery is disabled for ambiguous operations.** Existing
`POST /bike-packing/lists/:id/photos/resolve` searches files by content hash;
an old matching photo does not establish completion of the new operation. It is
not sent as a read-only fallback while blocked. Neither this resolver nor copy
failure may silently retry upload or clear an unknown intent. The UI says the
save result is unconfirmed and repeat saving is paused; local photos/data remain.
Failed EU logout explicitly says server-session revocation is unconfirmed.

## Recovery limits and proposed backend contract (not implemented)

There is **no safe general automatic or user-click recovery path in this
preparation release**, and no unconditional clear/retry button. The internal
`reconcile(id)` primitive has no runtime caller; invoking it requires a separately
reviewed terminal-operation audit, not elapsed time or a matching file. Do not
instruct users to clear site data/journal or switch browser to bypass protection.
EU activation remains blocked pending a recovery decision. Manual server audit
can collect evidence but must leave the barrier if completion cannot be proven.

Proposed minimum contract for coordination approval, without backend deployment:

- Client persists a stable random operation ID with the logical queued change,
  before its first send. Retries/read-back preserve it; a new lawful operation
  gets a different ID even for identical bytes. Target account/list/photo and a
  canonical payload digest bind the ID to intent; timestamps are diagnostic only.
- Backend scopes the ID to Experiment + authenticated principal and atomically
  claims it with the business transaction. A reused ID with different intent is
  rejected; concurrent equal IDs cannot both execute. File staging/publication
  and crash recovery must participate, not only an HTTP request-ID header.
- A same-ID duplicate returns the stored terminal result instead of executing
  again. A protected read-only operation-status endpoint returns pending,
  committed (with exact target/result/revision), or a definitive terminal
  rejection. Not-found/expired or a transient 404 is NOT proof of non-execution.
- Client binds the acknowledgement to its queued operation, persists the result,
  then clears only that operation's barrier. Pending/unknown stays paused. Status
  retention, tombstones and crash tests must cover offline queues and late sends.

Current guarantee is **no blind retry/failover after an unknown result**, within
the updated Experiment client and shared browser origin/storage. It is not
exactly-once execution. Older open versions, another device/profile/incognito
context, cleared storage, manual recreation with new IDs and generic stale edits
after an acknowledged response are not transactionally deduplicated by this
frontend. The proposed backend contract is required to close those limits.

## Local data and photos

Account scopes, localStorage state keys, IndexedDB name/version, photo IDs,
canonical URLs and cache source signatures are unchanged. Only network-bound
trusted private photo URLs are rewritten. Catalog assets, third-party photos and
blob/data URLs are not routed through the proxy. Fetch/XHR, preview/full-photo
downloads, offline caching, upload read-back and backup downloads use the same
transport. Cache identity is independent of EU/RU selection.

## Tests and publication gate

Run `npm run check`, `npm run test:critical`, `npm run test:transport`, build and
the complete browser suite. Browser transport fixtures intercept all requests:
they use fake cookies/responses and never create real server data. They cover
cross-origin same-site cookies, missing host-only cookies, anonymous probes,
fetch/photo/XHR routing, read-only gate and upload interruption across reload.
The mandatory anti-duplicate release tests also cover server-commit/response-loss,
late body/XHR success, direct/EU switching, offline reconnect, concurrent tabs,
closed/reopened tabs, photo concurrency and acknowledged stale-photo replay.
They include old matching photo + lost new operation => no resolver/no clear,
and failure before journal persistence => no dispatch. These checks run in CI's
`Experiment transport isolation` step plus the browser suite, not only manually.
Cookie egress is asserted in Chromium. WebKit's intercepted fixture does not
expose its Cookie header: it checks matching cookie scope and credentials
options, NOT authenticated Safari success. A real Safari/iPhone same-site
authenticated read remains a release gate; do not replace it with a mocked green.
The existing cold-gallery tests remain a required regression.

Before publishing, send the exact candidate SHA and CI results to coordination.
Only that task manages Frankfurt nginx/write gate. DNS+TLS alone does not permit
writes. The app may be published in preparation/diagnostic mode with direct
default only after explicit coordination approval; do not label it as a working
authenticated EU connection while the write gate/domain/smoke remain incomplete.

Proposed live smoke after coordinated activation: verify trusted domain TLS,
anonymous identity/gate+CORS and hostile Origin rejection; compare authenticated
`auth/me` user identity over RU/EU without printing identifiers/tokens. Only with
explicit approval use a disposable test-owned list to verify a uniquely named
write, read-back, tiny photo XHR upload and hash/HEAD retrieval. Keep records for
inspection; cleanup separately authorized. Never induce a real mutation timeout
on user data. Logout/login/new magic-link checks require an approved test account.
Only Experiment frontend deployment uses its existing VPS stage/hash/backup/
activation/HTTPS/rollback workflow. No backend or shared service republish.
