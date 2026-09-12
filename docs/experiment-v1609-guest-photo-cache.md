# Experiment v1609: guest photo cache startup

The public v1608 WebKit smoke reached the RU/EU routing and sign-in checks but reported an unhandled `UnknownError: Error preparing Blob/File data to be stored in object store` during the initial RU load. The saved trace places it before reload, inside `init()` awaiting authentication and guest-demo initialization. This differs from the earlier Cache API reload diagnostics.

Creating the automatic guest demo had already opened its local layout, then awaited optional remote-photo caching. That path wrote native Blobs, and a rejected write escaped the guest-copy call into startup.

The remote fallback now uses the existing binary cache representation. The cache decoder continues to read both legacy Blob rows and new binary rows. The photo reference receives its local cache ID only after the entire IndexedDB transaction commits. No photo action journal, server receipt, API or database schema changes.

If optional photo caching still fails (for example, storage is full), the saved guest layout remains open with its remote photo references, and the interface explicitly says that offline photos could not be saved. Errors creating the layout itself or synchronizing it still propagate to their caller.

Validation before publication:

- The new actual-function startup tests fail against the v1608 function on quota, Blob preparation and concurrent-copy cases, and pass with the fix. They also verify ordinary success and preserve real layout/sync errors.
- 918 critical tests and 1535 transport tests passed; source checks passed.
- 18 normal-release browser scenarios passed, nine per engine, with no retries or skips.
- The candidate with live anonymous RU/EU responses passed Chrome and mobile WebKit, including route selection/reload and the sign-in form. Every mutation request was blocked; none was attempted.
- Native IndexedDB tests cover exact full/thumbnail bytes after reload, refusal of native Blob writes, and an abort after request success that must retain the original remote references. Their final run and the exact GitHub run are recorded in publication evidence.

Deployment remains Experiment-only and application-only. Keep v1608 API fbc03422 and its receipt-aware schema active; never return to the older writer. Keep the manual Frankfurt choice and existing feature cohort; automatic routing and unfinished migration features remain disabled. A real iPhone/Safari check is still required for final acceptance.
