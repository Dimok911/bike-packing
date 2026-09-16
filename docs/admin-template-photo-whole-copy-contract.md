# Whole-template photo copy (3.3): pure preparation

Only the pure source inventory and exact payload projection are implemented.
Card 3.3 remains work in progress. No whole-copy command wire, plan, SQL effect,
HTTP dispatch, new feature gate or UI is connected by this module. Existing
V1–9 behavior and the completed tree-copy flow are unchanged.

The canonical module is `src/sync/admin-template-photo-whole-copy-projection.js`;
the BE mirror is byte-identical at
`src/lib/guest-import/sync/admin-template-photo-whole-copy-projection.js`.

## Pure interface and preservation

`adminTemplatePhotoWholeCopySourceInventory({payload, listId})` returns a detached,
deeply frozen `{layoutId, owners, photoCount}`. Owners are ordered containers
then items, with each collection sorted by source ID. Each row contains
`{entityType, sourceEntityId, photos:[{sourcePhotoId, reference}]}`. The inventory
includes every owner in the one-layout raw catalog: all placed roots, detached
forests, unplaced items and photo-free owners.

`projectAdminTemplatePhotoWholeCopyPayload({sourcePayload, sourceListId,
targetListId, operationId, metadata, owners})` returns a detached, deeply frozen
payload. `owners` must contain the exact complete ordered mapping, with rows
`{entityType, sourceEntityId, entityId, photos:[{sourcePhotoId, photo}]}`.

The unchanged `projectAdminTemplateCopy` determines all owner/layout IDs and
structural conversions. The new helper replaces only each mapped owner's full
photo array; absent and explicitly empty photo fields remain distinct. Raw
catalog and arrangement forests are validated independently and may differ.
Their known references are remapped without discarding ordinary/opaque fields.
Availability statuses, quantities, original photo timestamps, dictionary mirrors
and arrangement packed entries retain their meanings. The existing projector
removes its editor-only fields, applies new layout metadata, converts absent or
null root references to empty strings, and derives top-level packed state from
the remapped arrangement. It does not promise preservation of a divergent old
top-level packed map.

## Bounds and authority

The source must contain exactly one layout, at most 100 item/container owners,
forest depth at most 32 in each representation, and 1–50 photos across the
complete catalog. Zero-photo copies remain the existing fileless flow. The
canonical UTF-8 **source payload** limit is 3 MiB; it is separate from a future
complete action limit. The **projected payload** limit is 4 MiB; it is separate
from a future complete receipt limit. Neither envelope is defined here.

Unsupported photo metadata, structural aliases, dangling/duplicate membership,
cycles, malformed packing, incorrect owner/photo order and collisions with the
source ID inventory or new allocations reject the entire pure operation.

Canonical target photo references are data, not proof of rights or files.
Checking their shape, routes, identity and preserved timestamps does not prove
source/target byte equality or the claimed file metadata. Before applying or
writing anything, future callers must prove the full authenticated parent/stage
receipts and stored facts, current private source/head/rights, target SQL and
historical-ID absence, original local-ID absence and independent physical paths.

The existing generic intent parser still has additional reserved-word metadata
restrictions. Pure projection acceptance does not promise command acceptance;
that unchanged parser limitation must be decided during explicit wire design.

## Validation and remaining integration

Matching focused FE and BE tests cover full catalog membership, independent
forests, the unchanged projector's conversions, raw/opaque preservation,
statuses/packing, limits, order/identity corruption and detached immutable output.
The FE suite is registered in `test:transport`; BE uses `test:operations`.

Still required: typed immutable action/stages/receipts, durable record/client/plan,
source and absent-target admission, atomic creation with photo attachment at
revision 1, cancellation/fencing, target-only apply and acceptance, existing-form
integration, and actual API/filesystem/browser acceptance. This pure checkpoint
does not complete 3.3 or establish those authorities.
