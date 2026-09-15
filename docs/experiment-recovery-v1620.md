# Experiment v1620: storage pressure during recovery

The phone's v1619 recovery dialog now confirms a browser storage quota failure before the original actions can be archived. The server choice must remain blocked until that archive is durable.

Required recovery, personal outbox and transport journal writes now retry the exact same key and serialized value once after a named quota exception, removing only the renewable public-template offline cache. Personal state, original actions, recovery archives and photo files are not removed. Optional public caching stops for that storage instance after pressure is detected, and new public caches are limited to 256 KiB of estimated UTF-16 content. The storage formats and operation identities are unchanged.

The recovery dialog also provides a collapsible storage breakdown. Counts estimate localStorage keys and values as UTF-16 bytes; they do not claim to measure free device space, browser quota or photo file storage. Size-only diagnostics are included in the recovery download, including measurements before a failed server choice and after it.

If the cache is absent or too small to relieve pressure, the original failure remains visible and the originals remain retained. Real phone acceptance is still required; synthetic quota tests cannot establish the phone's available capacity.

Validation covers quota at archive, successor, transport and completion writes, immutable original bytes, cold reload, persistent quota, inaccessible storage, diagnostic privacy and the complete browser recovery flow. Exact final results belong to the local validation report for the release commit.

Publication scope: Experiment frontend only. API, production and stored photo data are unchanged. Build and release checks run locally without GitHub Actions.
