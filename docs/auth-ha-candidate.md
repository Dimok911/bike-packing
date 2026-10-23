# Auth reserve adapter candidate — 2026-10-23

This is an isolated candidate from the documented live Production baseline,
not the stale main branch. No production deployment has happened.

Browser v1658 uses the shared Auth client only for recognized Auth operations.
Data/media endpoints and existing browser storage keys stay unchanged. Server
opt-in SHARED_AUTH_ENDPOINTS uses the two independent HTTPS nodes and preserves
separate Bike/admin credentials and the original opaque principal IDs. Renewal
cookies remain separate; denial is final; uncertain mutations are not replayed.

Validation: frontend source check and build passed; 970 existing critical tests
and the new Auth integration test passed. API check passed plus three new Auth
contract tests. Existing test fixtures clear HA configuration before loopback
checks. No changes to Experiment's dirty working trees.

Pending: review the actual deployment baselines and branch destinations before
opening a narrowly scoped release PR, server staging/resource gates, browser
acceptance and rollout. Independent magic-link entry routing must be deployed
before claiming new-link failover. Application data APIs still live on the old
VPS; this adapter does not relocate them.
