# Experiment v1618: unconfirmed old saves

An old save can have a known revision but no retained original snapshot. If the server has advanced and the original operation has no verified terminal receipt, legacy photo preservation stops before three-way reconciliation. The recovery dialog now explains this stage rather than implying that a merge found conflicting edits.

The dialog also compares the validated saved outbox head with the owned server snapshot obtained during review. It names bag columns present on only one side, distinguishes changes to contents, records, photo references and metadata, and explicitly labels the result as a two-snapshot comparison rather than an action history. Output is bounded; omitted differences are counted. Invalid display data cannot prevent opening the recovery controls. The comparison never authorizes replay, cancellation or a merge.

Manual Sync after a confirmed initial load now avoids creating a first operation when the business data is unchanged. The next explicit placement still captures its original version and placement descriptor. Existing old queues remain readable and immutable; this release does not invent missing historical intent or expand whole-layout rebase semantics.

Regression coverage includes native Chromium/mobile WebKit manual Sync with an empty queue followed by a real placement; read-only review against the actual metadata-free state response; deferred choices preserving exact queue bytes; specific receipt, account and waiting failures; malformed display data; and directional comparison by stable identities.

This frontend release leaves backend protocol and photo files unchanged. A real old queue is not considered recovered until the user completes the chosen recovery path on that device. Delayed/failed startup without a confirmed baseline remains a separate scenario to validate.
