# Project routing

## Shared Services boundary

Work that changes a service or browser module shared by more than one VNIIPO
application must be split out of the Bike Packing task immediately and run as a
separate Codex task in the saved project named `Shared Services`.

This rule is pre-authorized by the project owner and applies in particular to:

- VNIIPO Auth and cross-application session/authentication contracts;
- Personal Tags API and its shared client contracts;
- `vniipo-photo-gallery` and anything published below `/shared-ui/`;
- any new backend, frontend runtime, or public contract intended for two or more
  VNIIPO applications.

Bike Packing-specific UI, its own API, and its app adapters stay in the relevant
Bike Packing Production or Experiment project. When one request touches both
an application adapter and a shared service, create two tasks: Shared Services
owns the shared implementation and publishes it first; the Bike Packing task
owns only the adapter and application release.

Every Shared Services change must be committed and pushed to its own repository,
reviewed through a GitHub pull request, and pass the repository's required
GitHub Actions checks before publication. Record the exact commit, pull request,
CI run, published version/hash, and rollback location in the completion report.
Never treat a server-only upload as the source of truth.
