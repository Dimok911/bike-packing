# Administrative photo copy: first private-catalog slice

This is a local, inactive implementation in the `admin-photo-copy-after-v1608`
worktrees. The API, independent file materialization, durable client records,
V8 plans and actual item/root-bag forms are implemented; browser acceptance is
being completed. BE runtime is `e5b912cf`, with strengthened paired API tests in
`fab16f5a`. Nothing in this slice is enabled in the v1608/v1609 release.
The existing general, upload and PhotoCreate v1 parsers remain unchanged.
The pure module is mirrored byte-for-byte from
`src/lib/guest-import/sync/admin-template-photo-copy-protocol.js` into the FE
`src/sync` directory and recorded in `source-hashes.json`. Dedicated copy
handlers and clients accept this extension only under their own gates.

`ADMIN_TEMPLATE_PHOTO_COPY_ENABLED = false`;
`TEMPLATE_PHOTO_COPY_CAPABILITY = "adminTemplatePhotoCopyV1"`. The copy gate
remains OFF, alongside the existing admin/staging/absent-owner prerequisites.
Trello stage 3 remains incomplete: trees, whole templates and personal/admin
directions are outside this first slice.

## First supported action

Copy one item, or the shell of one root bag, between **different confirmed
PRIVATE administrative demo/shared templates**, into the recipient catalog.
Copy all 1..50 photos belonging directly to that owner in the original order.
No placement, subtree, personal/public source, pending revision, new template,
batch, extra form edits or partial photo selection is expressible.

The bag may contain children/items in the source. Their records, photos and
tree remain untouched; none enters the target. A nested bag with nonempty
`parentId` is rejected in this slice, following the current root-copy handler.

Actual FE `createItemDuplicateRecord` and `createRootContainerDuplicateRecord`
(`src/state/item-ops.js`, `container-ops.js`) clone the source, then replace
identity, name, photos and creation/edit metadata. The new projection follows
that boundary: item `containerId = ""`; bag `parentId = null`, `childIds = []`,
`itemIds = []`, `order = []`. A known `parentContainerId` alias is rejected,
rather than preserved as a hidden placement. Quantity, availability, color,
dimensions, other known business fields and opaque owner fields are retained
exactly. There is no color/default normalization. Both complete snapshots and
all old target rows/references/layouts/dictionaries/packed/opaque data are exact.

## Immutable save and derived stage

The separate `adminTemplatePhotoCopyIntent` validates this ordinary outer
identity with `kind: "template.save"`:

```js
{ actorId, environment: "bike-packing-experiment", operationId,
  kind: "template.save", itemKey, listId,
  body: { version: 1, base: { stateRevision }, payload: exactTarget,
    metadata: { title, description, language },
    photoCopy: { version: 1, entityType: "item" | "container", entityId,
      fields: { name, createdAt, updatedAt, updatedByDeviceId, updatedByDeviceName },
      source: { itemKey, listId, base: { stateRevision },
        payloadDigest, payload: exactSource, entityId: sourceOwnerId },
      assets: [{ assetId, assetDigest, sourcePhotoId, photoId }] } } }
```

Keys are exact; complete body limit is 3 MiB. IDs use the existing safe Unicode
entity grammar; new photo IDs are ASCII. Save UUID, stage UUIDs, new owner/photo
IDs are allocated and durably retained **before any network dispatch**. This
module allocates no IDs. New owner IDs are absent in all three collections of
both snapshots; new photo/stage IDs cannot reuse known old photo/asset IDs.
JSON absence is only a preflight and does not replace SQL absence/tombstones.

The existing uploaded-asset digest contains input-byte hashes which the copying
client need not know. This is a separate derived manifest, rejected by upload v1
and PhotoCreate stage v2:

```js
{ version: 1, kind: "admin-template-photo-copy", environment, actorId,
  operationId: assetId, templateOperationId: saveUUID,
  source: { itemKey, listId, baseStateRevision, payloadDigest,
    entityType, entityId, photoId: sourcePhotoId, referenceDigest },
  target: { itemKey, listId, baseStateRevision, payloadDigest,
    entityType, entityId: newOwnerId, photoId: newPhotoId } }
```

Every digest is lowercase SHA-256 of UTF-8 `canonicalAccessJson(value)`.
The source/target payload digests bind both full snapshots. `referenceDigest`
binds the exact selected raw photo, including aliases and dates. `assetDigest`
hashes this manifest, never server-derived bytes, owner IDs or storage paths.

`adminTemplatePhotoCopyStageManifests` permits syntactically valid placeholder
asset digests during local construction. Replace them with each manifest hash,
freeze/save the completed intent, and call
`assertAdminTemplatePhotoCopyIntentDigests` **before dispatch**. That assertion
verifies source digest and every final stage digest. Construction is not stage
authority. All asynchronous helpers detach input before the first yield.

## Supported raw photo fields

Inspected sources: legacy BE `mapPhotoRow`, FE `normalizePhotoUrlFields` /
`normalizeItemPhotos`, and current append/create canonical references.

- Regenerated identity/storage fields: `id`, `photoId`, `assetId`, `listId`,
  `status`, `fileName`, `type`, `size`, `width`, `height`, canonical URLs.
- Preserved, when present: exact `createdAt` and `updatedAt` (ISO-like valid date
  strings, or legacy null). Copied references explicitly retain those dates.
- Known URL aliases accepted in the source: `url`, `fileUrl`, `file_url`, `src`,
  `href`; `thumbUrl`, `thumb_url`, `thumbnailUrl`, `thumbnail_url`, `thumb`;
  `urls.{url,file,original,thumb,thumbnail}`. New references use only canonical
  `url`/`thumbUrl` pointing to the new target IDs. URLs never select source files.
- Legacy `localId` and `error` may be empty only; new refs omit them. Pending,
  upload-error, cross-list and conflicting ID aliases are rejected.

Unsupported selected-photo keys, including arbitrary captions/opaque metadata,
copy-provenance markers or storage paths, fail the **entire** copy with
`admin-template-photo-copy-unsupported-photo-metadata`. They are not stripped or
silently lost. Unknown fields on unselected owners/photos and the full frozen
source remain exact. This initial restriction must be expanded explicitly if
later real inputs need additional photo metadata. Supported files follow current
admin limits: JPEG/PNG/GIF/WebP/HEIC, 1..10 MiB. The raw inventory retains the
existing strict identity/tree validation; it does not normalize malformed trees.

## Derived receipt and complete result

```js
{ ok: true, assetState: "ready" | "unavailable", receipt: {
  version: 1, kind: "admin-template-photo-copy", manifest, assetDigest,
  sourceOwnerId, ownerId: targetOwnerId, baseEntityRevision: 0,
  sourceStored: { file: { hash, size, type, fileName, width, height },
                  thumb: { hash, size, type } },
  stored: { file: { hash, size, type, fileName, width, height },
            thumb: { hash, size, type } },
  materialization: { version: 1,
    source: { filePathDigest, thumbPathDigest },
    target: { filePathDigest, thumbPathDigest } } } }
```

Copy already stored/sanitized bytes as-is; `sourceStored === stored`, including
both hashes. Do not re-sanitize JPEG during copying. Materialization path
digests hash the canonical JSON string of the lowercase validated relative path
(conservative case-folded collision check). No source path can equal any target
path, including another photo's source or destination. Source/target original
and thumbnail may each share their own path only when metadata/hashes agree.
No physical path is transmitted. `adminTemplatePhotoCopyMaterialization` only
checks strings/digests; the dedicated server handler independently proves actual
filesystem identity and copied bytes.

The exact final `result.payload.photoCopy` extension is:

```js
{ version: 1, sourceOwnerId, ownerId: targetOwnerId, entityType, entityId,
  added: [{ assetId, assetDigest, sourcePhotoId, photo: canonicalNewReference }],
  confirmedPayload, confirmedPayloadDigest }
```

The full result validator checks source and manifest digests, every ordered stage
binding, common source/target owners, byte/path evidence, new reference metadata,
preserved dates, exact deterministic target projection and its hash (4 MiB
receipt ceiling). It does not merely accept a server-supplied hash of arbitrary
payload. The authenticated journal receipt and transport context are separate
mandatory checks. Historical `unavailable` receipts can be validated for read
and recovery; dispatch must require every asset `ready`. No unknown-stage retry,
fallback upload or cancellation of another operation is authorized here.

These are server attestations bound to immutable requests, not a cryptographic
proof against a malicious server: without locally known bytes the client cannot
independently recompute their hashes. The client retains receipts from its
authenticated, selected API origin, validates outer action identity and restricts
reference URLs to the exact supported relative API paths or approved API origins.

## Server transaction

`assertAdminTemplatePhotoCopyPrepared` is only a pure contract for **trusted
locked observations**: exact actor/admin permission; both private, live, exact
binding/revision/payload/owner observations. Never expose its `canManage` input
as client authority. Actor, source owner and target owner may all differ.

The dedicated gateway independently performs:

1. Acquire the catalog lock and **both** sorted list/head locks; verify exact
   source types/bindings, live private revisions, current rights and full
   assembled snapshots. Reject changed source/target before effects; repeat
   current authorization before commit.
2. Lock actual source entity/photo rows, verify owner equals source list owner,
   exact raw photo reference/membership, nondeleted status and permanent admin
   tombstone exclusion. Check publication heads when present, including exact
   reference/revision; no invented head is required for a legacy source.
3. Check new owner absence in SQL items/containers/layouts, including deleted
   and opposite-type rows; check new photo/stage UUID occupancy and tombstones.
   Never use personal actor==owner bypass or legacy copy upsert.
4. Read contained regular files via validated stored row paths, forbid symlinks,
   hash and independently write/fsync **new** paths; verify copied bytes, physical
   independence and materialization receipts. Existing `writeOperationFiles`
   and `verifyTemplatePhotoAssetFiles` are useful primitives, not source guards.
5. At save, under both locks, repeat source/base/rights/row/file checks and every
   exact stage binding. Atomically commit only the new target owner/photos/heads,
   target payload/revision/history and bounded receipt. Source remains unchanged.
   Failure rolls back all business effects; stage assets and claims remain
   retained. Recover by exact immutable UUID; no new IDs or blind retry. Their
   eventual cleanup requires the separate retention work in stage 7.

The personal `deriveCopiedPhotoAsset` is not reused: it assumes actor==owner,
personal stages/heads and shared physical paths. Legacy `copyPhotoRecord` copies
files independently but performs an unjournaled upsert. Source file trash cleanup
physically deletes old paths after 30 days, so sharing source paths is unsafe.

The paired API/MySQL suite covers both owner types, source/base/rights refusals,
identity and file independence, atomic failure and immutable replay/cancellation.
The strengthened 11-case run validates actual API receipts with the FE validator,
including unchanged relative photo URLs. Its 740 source hashes remained stable;
the isolated MySQL process was stopped after the run.

## Client capture, recovery and actual forms

The explicit catalog command only accepts saved source fields. A root-bag copy
clearly excludes contents and placement. The picker retains the same immutable
attempt through quota failure, while a new completed copy receives new IDs.

Source and target capture use sorted shared locks also respected by ordinary
saves, uploads and template ordering. Existing plans, upload/copy records and
order journals are checked before capture, including records whose gates are
OFF. Applied flags alone do not grant permission to reuse a pending base.

The full copy record, V8 plan and client journal are durable before dispatch;
the target receives a pending marker without an optimistic new owner. Recovery
keeps the original IDs after a lost stage/save response. Unknown stages are
inspected by GET, never blindly reposted. A validated parent cancellation fence
can remove its own transport barrier without inventing a successful stage or
deleting the raw journal/IDB evidence.

Confirmed application replaces only the target namespace. A copy-specific
adapter preserves existing target local owner IDs and uses the new ID from the
immutable record; source, private drafts and opaque business data remain intact.
Mirror quota failure restores the pending target and retains its record for a
cold retry. An OFF copy gate may inspect an existing validated action; it cannot
create a missing plan/journal or dispatch a new copy.

Actual browser acceptance passed 14 distinct cases (7 Chromium and 7 WebKit),
with zero retries/skips. It covers the item, root shell, repeated copy, lost
stage/save responses, OFF recovery and real local-storage failures. Frozen
source hashes are recorded with the acceptance run. This work is not the whole
stage 3 or real-device Safari acceptance or performance verification.

## Local derivation cost

Record preparation, encoding and decoding now each derive the immutable
envelope once per invocation. For two photos, observed SHA-256 calls fell
from 11/12/23 respectively to 7/7/7; all seven required proof inputs are still
hashed on every invocation. The stored format and hashes are unchanged.
There is no ID cache or retained proof authority. All external context checks,
locks, fresh IDB reads and transaction/readback checks remain unchanged.

The refactor passed 111 focused cases, all 1833 transport cases (including
the separately registered tree foundation), then the same 14 UI scenarios
with a fresh build and no retries/skips. Across the transport/UI runs, 841
code/test file hashes remained stable. In this single Windows comparison,
WebKit's two-copy case fell from 52.5s to 30.7s and its root shell from 27.3s
to 14.7s; the entire 14-case run fell from 5.2 to 3.3 minutes. These are test
run observations, not a formal benchmark or an iPhone performance guarantee.

## Local preparation checks

The focused copy suite contains 16 independent cases covering item/root shell,
exact raw/opaque preservation, known aliases/dates and unsupported metadata,
all-photo ordering/collisions, legacy parser exclusion, both-snapshot/source-ref
digests, actor/UUID/owner bindings, unequal byte proofs, independent paths,
full-receipt tampering and trusted-observation refusals. Final focused group
passed **42/42** (16 copy + 14 existing create + 12 existing ordinary protocol),
with no failures/skips. Command:

```text
node --test test/bike-packing-template-photo-copy-protocol.test.js test/bike-packing-template-photo-create-protocol.test.js test/bike-packing-template-operation-protocol.test.js
```

The original pure preparation log `photo-copy-pure-1.txt`, pre/post hashes of
218 source/test files and its four-file whitelist remain as historical evidence.
The implementation and paired/UI evidence described above extend those checks;
local implementation is separate from publication.

## Reviewed FE mirror verification

Root reviewed the complete pure module, fixture, tests and wire contract. BE
preparation passed 42/42 (16 copy, 14 create, 12 ordinary protocol), with 218
source/test hashes unchanged. The FE mirror passed 30/30 (16 copy + 14 create),
with no skips or retries; the separate BE source-manifest check passed 1/1.
Existing-parser rejection is also covered inside the copy suite.

Shared module SHA-256: `b7f88c593432d611f59b664b68d01c9f6c91e2c1cf7e50981675f02bda2b0939`.
The FE copy suites are registered in `test:transport`. PhotoCopy has not been
published or tested with real user data on the live service.
