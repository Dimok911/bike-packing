# Recovery preparation failures

Choosing the server version must first preserve the original local actions. Previously a failed archive write closed the dialog and reported that the server version had been chosen, even when no choice was durable. This could leave the same local queue after reload without an actionable explanation.

The dialog now prepares the durable archive before closing. A preparation failure keeps the original actions and the dialog available, shows the actual storage failure, and includes its bounded code, stage and reason in a downloaded diagnostic copy. Quota, storage access/write failures and failed read-back are distinguished. No cancellation is sent before verified archival. Existing archive formats and successful recovery semantics remain unchanged.

Completion-marker failures are reported separately because the archive and selected successor already exist at that stage. These messages do not claim that the server accepted the successor.

The fresh phone export matched the pre-choice export exactly and contained no recovery archive. This narrows the reported incident to unsuccessful preparation, but does not establish a specific phone quota error. The release improves diagnosis and recovery controls; real-phone acceptance remains required. It does not resolve every storage-capacity failure or the separate startup-photo delay.
