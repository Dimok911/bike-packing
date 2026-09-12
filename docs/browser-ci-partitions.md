# Complete browser coverage on isolated runners

The Chromium run at `891fc` reached test 1868 of 2157 when its 120-minute job expired. Its administrative UI file ran 1433 tests in 86.08 minutes; the first 362 personal UI tests took 29.66 minutes. Increasing Playwright workers in one checkout would race the shared test bundle paths.

The quality workflow therefore uses four independent runners per browser. Each retains `workers: 1`, `fullyParallel: false`, the existing retries, and all existing test and job timeouts. Playwright's ordinary `--shard` cannot balance these files because they are indivisible sequential groups.

`scripts/run-browser-partition.mjs` collects the complete current project through native `--list --reporter=json`, then produces native `--test-list` files. Only the two reviewed large files can be split. Their tests create independent browser/API fixtures; their `beforeAll` hooks build test bundles. Every nested describe stays together, and every other file stays together. A serial/parallel mode declaration in a split file stops partitioning for review. No test source or execution mode changes.

Measured per-test file averages guide greedy balancing. These are scheduling estimates, not test deadlines or promised finish times. Before running its selected partition, every runner asks Playwright to list all four generated selections. It rejects empty lists, duplicate identities, overlapping selections, unknown tests, or missing tests. Full project collection and the verified coverage summary are retained in `browser-diagnostics/partitions/<project>/`, included in that partition's diagnostic artifact. The extra disabled-owner environment scenarios still run once per browser, on partition 1.

To verify the actual native selections without building, starting a server, or running a browser:

```sh
node scripts/run-browser-partition.mjs --project chromium --partition 1 --list-only
node scripts/run-browser-partition.mjs --project mobile-webkit --partition 1 --list-only
```
