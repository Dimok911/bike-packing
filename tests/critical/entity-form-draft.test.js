import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createNewEntityFormDraft,
  entityFormDraftStorageKey,
  parseNewEntityFormDraft
} from "../../src/ui/entity-form-draft.js";

test("CRITICAL form drafts: item fields, placement, and photo references survive serialization", () => {
  const draft = createNewEntityFormDraft({
    kind: "item",
    updatedAt: "2026-08-23T12:00:00.000Z",
    fields: {
      name: "Tent",
      weight: "1234",
      categories: ["Camp"],
      note: "Long description"
    },
    context: { targetLayoutId: "layout-a" },
    photos: [{ id: "photo-a", localId: "photo-a", status: "pending" }],
    photoUploadEntityId: "item-draft-a"
  });
  const restored = parseNewEntityFormDraft(JSON.stringify(draft), { kind: "item" });

  assert.equal(restored.fields.name, "Tent");
  assert.deepEqual(restored.fields.categories, ["Camp"]);
  assert.equal(restored.context.targetLayoutId, "layout-a");
  assert.equal(restored.photos[0].localId, "photo-a");
  assert.equal(restored.photoUploadEntityId, "item-draft-a");
});

test("CRITICAL form drafts: invalid, outdated, or wrong-kind payloads are ignored", () => {
  const container = createNewEntityFormDraft({ kind: "container", fields: { name: "Bag" } });

  assert.equal(parseNewEntityFormDraft("not json", { kind: "item" }), null);
  assert.equal(parseNewEntityFormDraft({ ...container, version: 0 }, { kind: "container" }), null);
  assert.equal(parseNewEntityFormDraft(container, { kind: "item" }), null);
  assert.notEqual(entityFormDraftStorageKey("item"), entityFormDraftStorageKey("container"));
});

test("CRITICAL form drafts: new dialogs autosave, restore, close safely, and clear after creation", () => {
  const controllers = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.match(controllers, /if \(!containerId\) restoreNewRootContainerFormDraft\(\)/);
  assert.match(controllers, /if \(!itemId\) restoreNewItemFormDraft\(\)/);
  assert.match(controllers, /scheduleNewItemFormDraftSave\(\)/);
  assert.match(controllers, /scheduleNewRootContainerFormDraftSave\(\)/);
  assert.match(controllers, /refs\.dialog\.close\("draft"\)/);
  assert.match(controllers, /refs\.rootContainerDialog\.close\("draft"\)/);
  assert.match(controllers, /result\?\.created\) clearStoredNewEntityFormDraft\("item"\)/);
  assert.match(controllers, /result\?\.created\) clearStoredNewEntityFormDraft\("container"\)/);
  assert.match(app, /window\.addEventListener\("pagehide", flushOpenEntityFormDrafts\)/);
});
