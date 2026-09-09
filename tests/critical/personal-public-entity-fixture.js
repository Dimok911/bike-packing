import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { preparePersonalPublicEntitySelection } from "../../src/sync/personal-public-import-selection.js";
import { personalPublicImportPlan } from "../../src/sync/personal-public-import-protocol.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";

export async function publicEntityFixture({ kind = "tree", photos = true, nested = true, transformSource = () => {} } = {}) {
  const f = guestSelectionFixture(), sourcePayload = f.candidate.sourceState;
  if (!photos) sourcePayload.items.item.photos = [];
  sourcePayload.items.item.custom = { original: "full owner" };
  if (nested) {
    sourcePayload.containers.pocket = { id: "pocket", name: "Pocket", photos: [] };
    sourcePayload.layouts.a.arrangement.containers.bag.childIds.push("pocket");
    sourcePayload.layouts.a.arrangement.containers.bag.order.unshift({ type: "container", id: "pocket" });
    sourcePayload.layouts.a.arrangement.containers.pocket = { parentId: "bag", childIds: [], itemIds: [], order: [], customRow: "preserved" };
  }
  const basePayload = { items: { kept: { id: "kept", name: "My edited item", photos: [], custom: 17 } },
    containers: { target: { id: "target", name: "My bag", photos: [] } }, locations: [], categories: [],
    layouts: { private: { id: "private", name: "Personal", rootContainerIds: ["target"], customLayout: { untouched: true },
      arrangement: { rootContainerIds: ["target"], containers: { target: { parentId: "", childIds: [], itemIds: ["kept"], order: [{ type: "item", id: "kept" }] } },
        items: { kept: "target" }, itemQuantities: { kept: 9 }, packedItems: { kept: true } } } } };
  transformSource(sourcePayload);
  const copy = { version: kind === "catalog" ? 3 : 1, mode: kind === "catalog" ? "catalog" : "independent", sourceLayoutId: "a",
    entries: [{ entityType: ["item", "catalog"].includes(kind) ? "item" : "container", sourceId: ["item", "catalog"].includes(kind) ? "item" : "bag", includeContents: kind === "tree" }],
    destination: { layoutId: "private", containerId: kind === "catalog" ? "" : "target", index: kind === "catalog" ? null : 0 } };
  const selection = preparePersonalPublicEntitySelection({ ...f, sourcePayload, basePayload, copy,
    source: { kind: "public-template", listId: "public-shared-layout-selected", itemKey: "shared-layout:selected", stateRevision: 8, language: "ru" } }, { enabled: true });
  const file = new Blob(["Original selected entity image"], { type: "image/png" });
  const fileHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("");
  const files = selection.photoTargets.map(({ sourceEntityId, ...target }) => ({ ...target,
    file: { hash: fileHash, size: file.size, type: file.type, fileName: "Original.png" }, thumb: null }));
  const { binding, baseStateRevision, basePayload: base, ...selected } = selection;
  const manifest = { ...selected, targetStateRevision: baseStateRevision, files, sourceHash: await personalArchiveHash(sourcePayload) };
  const plan = personalPublicImportPlan({ ...manifest, currentPayload: base, listId: binding.listId }, files);
  manifest.payloadHash = await personalArchiveHash(plan.payload);
  const action = { ...binding, kind: "list.import", operationId: selection.operationId,
    body: { baseStateRevision, payload: plan.payload, publicImport: manifest,
      causal: { dependsOn: [], reads: [{ listId: manifest.source.listId, revision: manifest.source.stateRevision }] } } };
  return { binding, selection, file, plan, action, options: { base, listId: binding.listId, operationId: selection.operationId, causal: true } };
}
