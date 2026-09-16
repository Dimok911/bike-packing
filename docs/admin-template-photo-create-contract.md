# New administrative item or bag with photos

Status, 2026-09-12: the separate creation protocol, BE transaction, immutable
FE package/V7 plan and actual new-item/new-bag forms are implemented and locally
verified. This continuation started from FE `0b5ab394` and BE `4d1b703`;
it is **excluded from the v1608 release**. No database migration, live activation
or publication is included. `ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED = false`;
BE `BIKE_PACKING_CAUSAL_ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED` also defaults OFF.
Capability: `adminTemplatePhotoCreateV1`, with the existing admin/append/staging
prerequisites. The general FE `adminTemplateIntent` parser remains unchanged;
the BE journal explicitly dispatches this body to the separate creation parser.
Existing append, replace, edit and personal owner guards are preserved.

## Exact save body

`kind: "template.save"`, existing PRIVATE demo/shared template, one confirmed
`base: {stateRevision}`. The separate `adminTemplatePhotoCreateIntent` prepares:

```js
{
  version: 1,
  base: { stateRevision },
  payload: exactConfirmedSource,
  metadata: { title, description, language },
  photoCreate: {
    version: 1, entityType: "item" | "container", entityId,
    fields, formContext,
    assets: [{ assetId, assetDigest, entityType, entityId, photoId }]
  }
}
```

All keys above are exact. `photoAppend`, `photoEdit`, source, pending base,
creation of a template and publication are not accepted. Assets number 1..50,
all for the one new owner, each stage UUID and ASCII photo ID unique; stage UUID
differs from save UUID. Entity IDs use the existing safe Unicode grammar.
The caller allocates permanent IDs once and durably stores the entire body and
original Blob selection before the first network dispatch. This module generates
no IDs and makes no writes. Repeated capture must retain those exact IDs/bytes.

`payload` contains no new owner or new photo references. It must equal the
locked confirmed server source in full (`assertAdminTemplatePhotoCreateSource`).
Source inventory requires one complete layout and valid, nonduplicated owner,
photo and arrangement identities. JSON absence does not replace the required
SQL absent-row check, including deleted owner rows.

## Actual form fields and placement

Sources: `src/ui/item-dialog-save.js` (`saveItemDialogAction`,
`saveRootContainerDialogAction`), `src/app/app-tail-controllers.js` readForm,
`src/state/container-fields.js` and `src/state/record-meta.js`. Scalar limits
follow the existing BE `bike-packing-photo-form.js` field checks.

Required common fields: `name`, `weight`, `color`, `location`, `category`,
`categories`, `note`, `updatedAt`, `updatedByDeviceId`, `updatedByDeviceName`.
Category equals the first selected category or empty. Item requires `quantity:1`
(catalog quantity); bag requires `volume`, `nestable`, `createdAt`. `createdAt`
is optional for item because its current legacy creation uses edit metadata.
Optional `dimensions` is null or the actual `{width,height,depth}` controls with
nonnegative finite numbers and at least one positive value. Null omits that
property from the new owner. No owner IDs, photo refs, source/provenance or
unknown new-owner fields can be smuggled through `fields`.

Item context:

```js
{ version: 1, availabilityStatus: "available" | "lost" | "broken" | "retired",
  placement: null | { layoutId, containerId, quantity } }
```

Placement requires the sole source layout, an already placed existing bag,
an unlocked layout, a positive integer quantity and available status. Null
means catalog-only creation. The new item is appended to that bag's order.
The projection updates only this placement in `arrangement.items`,
`itemQuantities`, bag `itemIds/order`, the new item's `containerId`, and the
selected bag's assembled `itemIds/order` mirrors. Existing packed bits remain
exact. Unavailable status is set on the new item; available omits the property.

Bag context:

```js
{ version: 1, placement: null | { layoutId } }
```

The actual new-bag handler supports catalog-only or adding a root at the end of
the selected layout. A new bag has no children/items; `parentId` is null while
unplaced, or empty string when placed as a root. Parent changes and insertion
indices currently belong to editing an existing bag and are intentionally not
invented here. Placement updates layout `rootContainerIds` and its arrangement,
then only the layout's three edit metadata fields from the frozen form metadata.

All other raw data, old references/aliases, opaque fields and detached owners
are cloned exactly. No general normalization, existing-tree move or dictionary
update is performed. The selected relationship mirrors are explicit because the
BE assembled read returns them, not just the arrangement.

## Create-only stage v2 and receipts

The existing stage endpoint/table dispatches by manifest version.
`adminTemplatePhotoCreateStageManifest` accepts exactly the existing v1 keys,
but **version 2 means a new absent owner**:

```js
{ version: 2, environment, actorId, operationId, templateOperationId,
  itemKey, listId, baseStateRevision, entityType, entityId, photoId,
  file: { hash, size, type, fileName }, thumb: null | { hash, size, type } }
```

`assetDigest = SHA256(canonicalJSON(manifest))`, including version 2 and original
input file metadata, never derived/stored hashes. Original size/type/name/bytes
are verified by the server stage handler. Existing v1 parser rejects
v2; no existing-owner check is loosened. Receipt:

```js
{ ok: true, assetState: "ready" | "unavailable", receipt: {
  version: 2, manifest, assetDigest, ownerId, baseEntityRevision: 0,
  stored: { file: { hash, size, type, fileName, width, height },
            thumb: { hash, size, type } }
} }
```

Zero is the server's absent-owner proof, not an upsert permission.
`ownerId` is the template row owner, independently of uploader/admin actor.
Unavailable preserves a known immutable receipt; validators do not grant
dispatch permission or authorize repeating an unknown stage.

The success extension is exact:

```js
{ version: 1, ownerId, entityType, entityId,
  added: [{ assetId, assetDigest, entityType, entityId, photo }],
  confirmedPayload, confirmedPayloadDigest }
```

`photo` has the same exact canonical fields as append receipts. Ordered `added`
matches the assets. `confirmedPayload` equals the deterministic creation
projection plus those verified references, and its canonical digest matches.
The full validator binds all stage manifests to actor/environment/save UUID/
target/base/new owner/photo IDs, verifies stored metadata and common owner ID.
It does not replace outer journal receipt validation or check current rights.

## Implemented server and durable UI boundaries

1. Under catalog/head/list locks, the BE asserts PRIVATE/exact base/admin rights and
   absent owner in both source and SQL (including deleted rows), then repeat
   stage binding/file checks. New entity/photo owner is `list.owner_id`.
2. One transaction commits new owner, photos/heads, selected placement,
   revision, history and bounded recoverable receipt, or roll all effects back.
   Existing photo tombstones and ID-reuse fences still apply. No new table is
   expected; stage receipt JSON supports the versioned evidence.
3. The real forms keep the confirmed ownerMap strict and store one distinct pending
   local/server ID pair with frozen before/candidate state and the binary record.
   Only the exact receipt promotes it. No provisional legacy owner/upload occurs
   before durable capture.
4. The projection matched actual assembled API output for all seven empty and
   populated catalog/placement scenarios. Full attachment tests also verified
   exact receipts. No alternate hash or normalization fallback was introduced.
5. BE runtime requires existing admin/staging prerequisites plus its own gate.
   Known receipt GET/cancel retains existing recovery semantics, including own
   create gate OFF. The FE validates retained V7 against the actual IDB record
   even during OFF reads/cancellation; turning a gate OFF does not authorize a
   queued write or retrying an unknown upload.

Implementation points: `bike-packing-template-photo-assets.js` has the separate
`lockAbsentTemplatePhotoOwner` and stage v2 branch; the legacy owner guard remains
strict. Absence probes items, containers and layouts with `FOR UPDATE`, without
excluding deleted rows. `bike-packing-template-photo-create.js` checks the full
raw source, all stage/owner/base bindings and unchanged previous photo ownership
before effects. It uses the attachment/postflight primitives extracted from the
existing append handler; append/replace keep their own original preconditions.
`executeCausalTemplateOperation` then persists the new owner and placement,
verifies its exact resulting revision/owner and returns the complete receipt.
The operation journal provides final rights checks, receipt size rollback,
stable cancellation, historical receipt GET and replay.

## Actual forms, recovery and ordinary changes

`src/ui/admin-template-photo-create-form-controller.js` is connected before the
legacy item/container save and upload paths in `src/app/app-tail-controllers.js`.
It freezes real fields, placement and original Blob handles once, binds the open
form to actor/target/context, and keeps the same input and IDs on a quota retry.
The app checks the new local ID against every collection before capture and
again before apply. A form closes only after IDB and V7 read-back; failure before
that point retains the form. Failure after capture retains the complete package
and action for reload. No personal draft key is repurposed.

The package contains exact raw source, strict before-state proof, one new owner,
candidate namespace and original file metadata/bytes. The V7 plan binds that
package by intent hash. Stage v2 binds all original IDs and absent owner; lost
stage ACK resolves by GET, and lost save ACK/reload uses the same save UUID/body.
Candidate and receipt projection copy only the selected administrative namespace,
including arrangement/root IDs and edit metadata. Mirror conflicts or quota
roll back the live candidate and preserve the durable record, personal data,
other administrative drafts and recovery journals.

Fresh private demo and shared templates use the canonical projector. Both direct
opening and fresh background hydration retain its exact raw baseline before
snapshot capture. Existing local drafts are skipped by hydration; legacy drift
is retained for explicit recovery, not silently normalized. Display arrangement
application touches only mapped owners. The ordinary snapshot adapter inversely
maps proven IDs onto the raw baseline without dropping opaque fields, old raw
photo aliases, detached owners, packed state or distinct raw layout dictionary
mirrors. Unmapped owners or unsupported new fields pause with the draft retained. Explicit packed
toggle/unpack intent updates only the corresponding arrangement bits.

After a verified ordinary save, its confirmed numeric revision, unchanged owner
identities and current exact raw baseline are persisted together. Quota restores
that metadata so the flow keeps the original durable receipt/action for retry.
The next creation therefore uses the newly confirmed base; it never guesses new
IDs or rebases against an unrelated newer server revision.

## FE final verification and scope

The final local FE source check passed; **912/912 critical** and **1648/1648
transport** tests passed with no skips. The runner recorded **810 unchanged
sources** from `2026-09-12T01:43:16.250Z` to `01:44:01.248Z`.
The prior 73 package/store and 206 client/V7 checks are subgroup evidence, not
additional totals. Evidence is in this worktree's ignored
`node_modules/.cache/causal-evidence/photo-create-full-checks-3.json` and its
referenced logs.

Browser acceptance covers **26 distinct cases: 13 Chromium and 13 mobile WebKit**,
with no automatic retries or skips. It uses actual forms, original selected
files, native IDB and isolated test API responses, with gates enabled only in the
test bundle. Cases include item/bag catalog creation, existing-bag/root placement,
first creation in an empty template, lost stage/save ACK, cold reload, quota
before binary capture and after durable V7, unchanged foreign/private drafts,
create OFF, and existing-owner append/edit with create ON. The extended positive
sequence creates, moves with quantity, marks packed, reloads and creates again;
it checks exact old raw data, dictionaries/opaque arrangement fields, current
base, IDs and bytes throughout.

Successful final coverage is composed of UI7's twelve Chromium cases plus UI11's
corrected first sequence, and UI9's twelve WebKit cases plus UI10's first
sequence. Earlier runs exposed and corrected a missing fresh
hydration baseline and packed-key absence handling. Later fixture corrections
await the existing collection-mode save and blur the actually focused quantity
control before a real mobile Save tap; no force click or app-internal save bypass
is used. The last change was test-only. Logs `admin-photo-create-ui-{7,9,10,11}.txt`
and `admin-photo-create-ui-final-evidence.json` are in the original FE worktree's
ignored `node_modules/.cache/causal-evidence/2026-09-08` directory.

WebKit multipart inspection uses the existing independent outgoing-FormData
observer only when Playwright omits the part body. This is not a physical iPhone
or Linux/native Safari acceptance claim; the existing platform limitations remain.

The new protocol covers **one new owner with files in an existing confirmed
private template**. Fileless creation and arbitrary new/unmapped ordinary owners
are not added to this protocol. Existing legacy drift requires a proven source
or an explicit existing recovery choice. New templates, pending bases/targets,
manufacturer/public/copy sources, nested new bags, ZIP and publication remain
outside this slice. No create gate is enabled in the normal or v1608 release
profile. This result does not complete the full migration list.

## Historical preparation verification


Preparation FE group: 41/41 (14 creation cases plus 27 existing contracts).
Final shared-source creation cases: FE 14/14; BE operations 211/211 include the
same 14 cases and four new server guard checks. BE `check`: 77/77 existing tests
and 30 command steps passed. FE/BE new module bytes match, and the existing
source-manifest test passes.

The first projection probe passed the three empty cases; four populated cases
stopped at a fixture INSERT missing required `thumb_path`, before projection
comparison. Correcting only that fixture gave **8/8** (seven scenarios + parent)
with 726 files unchanged. No contract change was required.

The final canonical-auth paired API/MySQL run passed **61/61**: three auth cases,
seven projection cases, thirteen new creation groups, sixteen append, thirteen
edit, eight replacement, plus the parent test. This includes real FE-generated
manifests and save bodies, actor != template owner, full original/thumb GET,
history, lost-ACK restart/replay, SQL deleted/opposite-type ID collision at stage
and commit, permanent photo tombstones, public/wrong/stale source rejection,
own-gate OFF cancellation, injected SQL failure with exact retry, late revoked
rights and oversized-receipt rollback. All **730** snapshotted FE/BE source/test
files stayed unchanged. MySQL shutdown completed `2026-09-12T00:26:18.349537Z`.

Logs, source snapshots and runner commands are in the BE worktree's ignored
`node_modules/.cache/causal-evidence`: `photo-create-operations-check-1.txt`,
`photo-create-projection-api-2.txt`, `photo-create-api-1.txt`,
`photo-create-api-sources.json`, `photo-create-api-sources-verified.json`,
`run-photo-create-api.ps1`. That historical server run did not include browser
or build verification and made no live service or deployment changes.

After that run, two stale explanatory comments in the shared creation module
were corrected and the byte-identical mirror/manifest updated. No executable
code changed. `photo-create-final-comment-only.json` proves that reversing just
those comments restores the tested bytes; the final mirror test passed 1/1.
Final shared module SHA-256:
`ac152ca0d9ab92dc0ec79c81dba488a7e3631208a58e3b217da458c808155e67`.
