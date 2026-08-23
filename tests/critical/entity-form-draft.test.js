import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createNewEntityFormDraft,
  entityFormDraftStorageKey,
  parseNewEntityFormDraft
} from "../../src/ui/entity-form-draft.js";
import {
  newEntityFormDraftDeleteConfirm,
  renderNewEntityFormDraftCardHtml
} from "../../src/ui/entity-form-draft-card.js";

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

test("CRITICAL form drafts: interrupted work is rendered as an accessible catalog card", () => {
  const html = renderNewEntityFormDraftCardHtml({
    draft: createNewEntityFormDraft({
      kind: "item",
      fields: {
        name: "Tent <draft>",
        weight: "1234",
        categories: ["Camp"],
        location: "Home"
      }
    }),
    kind: "item",
    showPhotos: true,
    t: (key, values = {}) => ({
      "formDraft.badge": "Draft",
      "formDraft.catalogStatus": "Not saved · click to continue",
      "formDraft.open": `Continue ${values.name}`,
      "formDraft.delete": "Delete draft",
      "formDraft.photoPlaceholder": "Local draft"
    })[key] || key
  });

  assert.match(html, /data-entity-form-draft-card="item"/);
  assert.match(html, /Tent &lt;draft&gt;/);
  assert.match(html, /Not saved · click to continue/);
  assert.match(html, /entity-form-draft-card-badge[^>]*>Draft</);
  assert.match(html, /data-delete-entity-form-draft="item"/);
  assert.match(html, /entity-form-draft-photo[^>]*>Local draft</);
});

test("CRITICAL form drafts: deleting a recovery card requires an irreversible-action confirmation", () => {
  const config = newEntityFormDraftDeleteConfirm({
    draft: createNewEntityFormDraft({ kind: "item", fields: { name: "Tent draft" } }),
    kind: "item",
    t: (key, values = {}) => ({
      "formDraft.deleteTitle": "Delete draft?",
      "formDraft.deleteText": `Delete ${values.name} forever`,
      "buttons.deleteLayout": "Delete",
      "buttons.cancel": "Cancel"
    })[key] || key
  });

  assert.equal(config.title, "Delete draft?");
  assert.equal(config.text, "Delete Tent draft forever");
  assert.equal(config.okText, "Delete");
  assert.equal(config.cancelText, "Cancel");
  assert.equal(config.tone, "danger");
  assert.equal(config.hideClose, true);
});

test("CRITICAL form drafts: dialogs autosave silently, recover after interruption, and only explicit choices clear", () => {
  const controllers = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  assert.match(controllers, /if \(!containerId\) restoreNewRootContainerFormDraft\(\)/);
  assert.match(controllers, /if \(!itemId\) restoreNewItemFormDraft\(\)/);
  assert.match(controllers, /window\.setTimeout\(persistNewItemFormDraft, 250\)/);
  assert.match(controllers, /window\.setTimeout\(persistNewRootContainerFormDraft, 250\)/);
  assert.match(controllers, /if \(!list \|\| !addButton \|\| dialog\?\.open \|\| saving\) return/);
  assert.match(controllers, /renderNewEntityFormDraftCardHtml\(\{/);
  assert.match(controllers, /const confirmed = await askConfirmDialog\(newEntityFormDraftDeleteConfirm\(\{/);
  assert.match(controllers, /if \(!confirmed\) return;\s+clearStoredNewEntityFormDraft\("item"\)/);
  assert.match(controllers, /if \(!confirmed\) return;\s+clearStoredNewEntityFormDraft\("container"\)/);
  assert.match(controllers, /const action = await askUnsavedChangesDialog\(\)/);
  assert.match(controllers, /if \(action === "save"\) \{\s+saveDialogItem\(\)/);
  assert.match(controllers, /if \(action === "save"\) \{\s+saveRootContainerDialog\(\)/);
  assert.match(controllers, /if \(action === "discard"\) \{\s+clearStoredNewEntityFormDraft\("item"\)/);
  assert.match(controllers, /if \(action === "discard"\) \{\s+clearStoredNewEntityFormDraft\("container"\)/);
  assert.doesNotMatch(controllers, /close\("draft"\)/);
  assert.doesNotMatch(index, /FormDraftNotice|FormDraftStatus/);
  assert.match(controllers, /result\?\.created\) clearStoredNewEntityFormDraft\("item"\)/);
  assert.match(controllers, /result\?\.created\) clearStoredNewEntityFormDraft\("container"\)/);
  assert.match(app, /syncNewEntityFormDraftCatalogCards\(\)/);
  assert.match(app, /window\.addEventListener\("pagehide", flushOpenEntityFormDrafts\)/);
});
