# V10 whole-template copy registry — 2026-09-16

Card 3.3 is still incomplete. The saved development workspace now connects the
pure V10 plan to the common registry, but no copy form, release gate or published
application has changed. This is an integration boundary, not phone acceptance.

## What is connected

`capturePhotoWholeCopy`, `read`/`list` and `run` recognize only exact V10 grammar.
Every read rederives the complete native typed record and compares the plan bytes
again. The source comparison is explicitly `sourceEditorSnapshot`; it cannot be
used by the generic data-source projector as a target before-state. The target
is only an allocation declaration until a separately verified target apply.

Dispatch uses only the whole-copy typed client. Its journal, intent hash, stage
manifests and complete stage/parent receipt are independently revalidated using
the existing whole-copy journal validator. A successful `run` returns a terminal
receipt fact only. It does not apply an editor, mutate the source, retire stages,
cancel another action or release allocations. Generic cancel and exclusion IDs
cannot bypass this boundary.

When the whole-copy gate is OFF, retained records remain readable and `run`
permits only typed journal reads and client `inspect` GET reconciliation. It
cannot capture a new command, stage, parent POST or cancellation. A missing or
unknown receipt remains paused. The common administrative registry gate retains
its existing outer behavior.

## Required application adapter (not implemented)

An explicit `assertWholeCopyAdmission` dependency is mandatory for capture and
gate-ON run, alongside a genuine outer source+target capture lease. The guard
must synchronously return exactly `true`; missing, no-op, false and asynchronous
guards fail closed. Record/source/target data passed to it are detached copies,
not a self-certifying proof. The registry checks it again across awaited work.

The trusted application adapter must hold a live, complete inventory and
namespace scope outside the plan/command locks. It must verify:

- the current full raw source and its confirmed revision/owner/photo mapping;
- absence of all target namespace allocations, or this exact own pending copy;
- every relevant durable journal, including old/disabled formats and generic
  writers, and no independently pending writer for either namespace;
- stable account, permissions, route/session generation and lock coverage.

The same live scope must be wired to the typed client's `withDispatchAdmission`
so its checks also surround stage claims, transport registration and each POST.
Registry pre/post checks do not replace client-level admission. The adapter must
never reacquire the already-held source/target lease or invert lock ordering.
No default application adapter is supplied; simply enabling the gate cannot
make the current application write whole copies.

As an additional denial fence, a retained V10 plan blocks generic capture/run
against its source or target namespace, even from another registry instance,
with another base or an exclusion ID. This scan grants no authority: global
inventory completeness, source changes, allocation checks and target application
still require the adapter above. Until a typed adoption/removal path exists,
this conservative reservation remains in force.

## Focused validation

The following command passed 52/52 without skips:

```sh
node --test tests/critical/admin-template-photo-whole-copy-plan-registry.test.js tests/critical/admin-template-photo-whole-copy-save-plan.test.js tests/critical/admin-template-photo-tree-copy-plan-registry.test.js tests/critical/admin-template-save-plan.test.js
```

After the final exact journal reread and admission recheck hardening, the V10
registry file alone passed 11/11 again. Logs are retained in
`node_modules/.cache/whole-v10-registry-check.txt` and
`node_modules/.cache/whole-v10-registry-final.txt`. These tests use a simulated
application admission policy with real typed client/store/lease/receipt helpers.
They do not verify the missing real namespace adapter, application forms or
phone behavior. No full transport suite or GitHub Actions run was started.

## Remaining work

Implement that complete source/absent-target inventory adapter, connect the
existing whole-copy form, apply/mirror the independently confirmed target, and
provide cold recovery/acceptance before browser or phone release. Reuse the
existing source, stages and fixed operation IDs through lost acknowledgements.
Do not turn the source snapshot into a fabricated empty target baseline.
