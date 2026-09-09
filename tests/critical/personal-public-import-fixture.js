import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { personalGuestImportPlan } from "../../src/sync/personal-guest-import-plan.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";
import { preparePersonalPublicImportSelection } from "../../src/sync/personal-public-import-selection.js";
export async function publicImportFixture(fileless, { containerPhotos = false } = {}) {
  const f = guestSelectionFixture(), sourcePayload = f.candidate.sourceState;
  if (fileless) sourcePayload.items.item.photos = [];
  if (containerPhotos && !fileless) sourcePayload.containers.bag.photos = [{ id: "public-bag-original" }];
  sourcePayload.items.item.custom = { selected: "complete original field" };
  const selection = preparePersonalPublicImportSelection({ ...f, sourcePayload, layoutIds: ["a"], layoutNames: ["Independent public copy"],
    source: { kind: "public-template", itemKey: "shared-layout:selected", listId: "public-shared-layout-selected", stateRevision: 8, language: "ru" } }, { enabled: true });
  const { ownerTargets, photoTargets } = selection;
  const file = new Blob(["frozen public original"], { type: "image/png" });
  const fileHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("");
  const files = photoTargets.map(({ sourceEntityId, ...target }) => ({ ...target,
    file: { hash: fileHash, size: file.size, type: file.type, fileName: "Selected.png" }, thumb: null }));
  const manifest = { version: 1, operationId: selection.operationId, sourcePayload, sourceHash: await personalArchiveHash(sourcePayload),
    layoutTargets: selection.layoutTargets,
    ownerTargets, photoTargets, editMeta: f.editMeta, targetStateRevision: f.baseStateRevision, files,
    source: selection.source };
  const plan = personalGuestImportPlan({ ...manifest, currentPayload: f.basePayload, listId: f.binding.listId }, files);
  manifest.payloadHash = await personalArchiveHash(plan.payload);
  const action = { ...f.binding, operationId: manifest.operationId, kind: "list.import", body: {
    baseStateRevision: f.baseStateRevision, payload: plan.payload, publicImport: manifest,
    causal: { dependsOn: [], reads: [{ listId: manifest.source.listId, revision: manifest.source.stateRevision }] } } };
  return { action, plan, selection, binding: f.binding, file, options: { base: f.basePayload, listId: f.binding.listId, operationId: action.operationId, causal: true } };
}
