import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { adminPhotoBrowserFixture, adminPhotoOrigin, selectedGif } from "./admin-template-photo-browser-fixture.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifest, adminTemplatePhotoCopyStageDigest,
  adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyMaterialization, adminTemplatePhotoCopyReference,
  adminTemplatePhotoCopyPayload, validateAdminTemplatePhotoCopyStageReceipt, validateAdminTemplatePhotoCopyResult } from "../../src/sync/admin-template-photo-copy-protocol.js";

const clone = structuredClone;
export const copyUiDigest = value => createHash("sha256").update(canonicalTemplateJson(value)).digest("hex");
const bytesHash = createHash("sha256").update(selectedGif).digest("hex");
const headers = { "Access-Control-Allow-Origin": adminPhotoOrigin, "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const prepared = server => ({ ok: true, ...server.binding, sourceType: "public-template", exists: true, deleted: false,
  stateRevision: server.revision, visibility: server.visibility, metadata: server.metadata, payload: server.payload, indexes: [] });
export const copyUiOpenInput = binding => binding.itemKey.startsWith("shared-layout:")
  ? { type: "shared", sharedId: binding.itemKey.slice("shared-layout:".length) }
  : { type: "demo", demoListId: binding.listId, language: "ru" };
export async function openCopyUiTemplate(page, binding) {
  await page.waitForFunction(() => window.__adminUiTest?.user()?.id === "admin-a");
  await page.evaluate(input => __adminUiTest.openPrepared(input), copyUiOpenInput(binding));
  await page.waitForFunction(listId => __adminUiTest.state().layouts[__adminUiTest.state().activeLayoutId]?.adminCausalSource?.binding.listId === listId, binding.listId);
}

// The existing fixture still supplies the real boot/auth/private-list surface.
// Page routes override only the isolated bundle and the new two-template wire.
// No application store, client, controller or IndexedDB method is stubbed here.
export async function adminPhotoCopyUiFixture(page, context, { sharedTarget = true, copyOff = false } = {}) {
  const control = { target: null, source: null, copyOff, stagePosts: [], stageGets: [], saveGets: [],
    stages: new Map(), lostStageAck: false, stageHidden: false, hideStageAfterCommit: false, lostSaveAck: false, saveHidden: false,
    hideSaveAfterCommit: false, stageHold: null, errors: [] };
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      if (!url.pathname.includes("/letters-vniipo/api/")) {
        if (url.origin !== adminPhotoOrigin) return route.fallback();
        const bundle = path.resolve(`test-results/admin-template-photo-copy${control.copyOff ? "-off" : ""}-ui-build`);
        const filename = path.resolve(bundle, url.pathname === "/" ? "index.html" : "." + url.pathname);
        if (!filename.startsWith(bundle + path.sep)) throw Error("Outside copy test bundle");
        try { return route.fulfill({ body: await readFile(filename), contentType: filename.endsWith(".js") ? "text/javascript"
          : filename.endsWith(".css") ? "text/css" : filename.endsWith(".html") ? "text/html" : "application/octet-stream" }); }
        catch { return route.fulfill({ status: 404, body: "" }); }
      }
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const suffix = url.pathname.split("/letters-vniipo/api")[1];
      if (suffix === "/bike-packing/capabilities") return route.fulfill({ headers, json: { ok: true, service: "bikepacking-api", apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
        capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoEditV1", "adminTemplatePhotoCreateV1", "adminTemplatePhotoCopyV1"] } });
      if (!control.target) return route.fallback();
      const { source, target } = control;
      let data;
      if (suffix === "/bike-packing/admin/template-records") data = { ok: true, lists: [source, target].map(server => ({
        id: server.binding.listId, listId: server.binding.listId, publicTemplateKind: server.binding.itemKey.startsWith("shared-layout:") ? "shared-layout" : "demo",
        language: "ru", title: server.metadata.title, published: false, visibility: "private", adminPayloadEndpoint: "/legacy-read-must-not-be-used" })) };
      else if (suffix === "/bike-packing/admin/template-operations/prepare") {
        const input = request.postDataJSON(), selected = [source, target].find(server => server.binding.itemKey === input.itemKey);
        expect(Object.keys(input)).toEqual(["itemKey"]);
        expect(selected, JSON.stringify(input)).toBeTruthy(); selected.preparePosts.push(clone(input)); data = prepared(selected);
      } else if (suffix === "/bike-packing/admin/template-photo-assets/copy" && request.method() === "POST") {
        const input = request.postDataJSON(); expect(Object.keys(input)).toEqual(["manifest"]);
        const manifest = adminTemplatePhotoCopyStageManifest(input.manifest), assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
        expect(manifest.actorId).toBe(target.binding.actorId); expect(manifest.environment).toBe(target.binding.environment);
        expect(manifest.source).toMatchObject({ itemKey: source.binding.itemKey, listId: source.binding.listId,
          baseStateRevision: source.revision, payloadDigest: copyUiDigest(source.payload) });
        expect(manifest.target).toMatchObject({ itemKey: target.binding.itemKey, listId: target.binding.listId,
          baseStateRevision: target.revision, payloadDigest: copyUiDigest(target.payload) });
        const owner = source.payload[manifest.source.entityType === "item" ? "items" : "containers"][manifest.source.entityId];
        const photo = owner.photos.find(photo => (photo.id ?? photo.photoId) === manifest.source.photoId);
        expect(manifest.source.referenceDigest).toBe(copyUiDigest(photo));
        for (const type of ["layouts", "items", "containers"]) expect(target.payload[type][manifest.target.entityId]).toBeUndefined();
        const stored = { file: { hash: bytesHash, size: selectedGif.length, type: "image/gif", fileName: photo.fileName, width: 1, height: 1 },
          thumb: { hash: bytesHash, size: selectedGif.length, type: "image/gif" } };
        const materialization = await adminTemplatePhotoCopyMaterialization({ filePath: `legacy/${manifest.source.photoId}.gif`, thumbPath: `legacy/${manifest.source.photoId}.thumb.gif` },
          { filePath: `operations/${manifest.operationId}.gif`, thumbPath: `operations/${manifest.operationId}.thumb.gif` });
        const stage = { ok: true, assetState: "ready", receipt: { version: 1, kind: "admin-template-photo-copy", manifest, assetDigest,
          sourceOwnerId: source.ownerId, ownerId: target.ownerId, baseEntityRevision: 0, sourceStored: clone(stored), stored, materialization } };
        expect(await validateAdminTemplatePhotoCopyStageReceipt(stage, { manifest, assetDigest })).toBe(true);
        expect(control.stages.has(manifest.operationId)).toBe(false); control.stagePosts.push(clone(input)); control.stages.set(manifest.operationId, stage);
        if (control.stageHold) await control.stageHold;
        if (control.lostStageAck) { if (control.hideStageAfterCommit) control.stageHidden = true; return route.abort("failed"); } data = stage;
      } else if (suffix.startsWith("/bike-packing/admin/template-photo-assets/") && request.method() === "GET") {
        const id = suffix.split("/").at(-1); control.stageGets.push(id);
        if (control.stageHidden) return route.abort("failed");
        data = control.stages.get(id) || { ok: true, operation: { id, environment: target.binding.environment, actorId: target.binding.actorId, state: "unknown" } };
      } else if (suffix === "/bike-packing/admin/template-operations" && request.method() === "POST" && request.postDataJSON().body?.photoCopy) {
        const input = request.postDataJSON(), intent = adminTemplatePhotoCopyIntent({ ...target.binding, operationId: input.operationId, kind: input.kind, body: input.body });
        expect(input).toEqual({ expectedActorId: target.binding.actorId, environment: target.binding.environment, operationId: intent.id,
          kind: intent.kind, itemKey: target.binding.itemKey, listId: target.binding.listId, body: intent.body });
        expect(input.body.payload).toEqual(target.payload); expect(input.body.photoCopy.source.payload).toEqual(source.payload);
        expect(input.body.base.stateRevision).toBe(target.revision); expect(input.body.photoCopy.source.base.stateRevision).toBe(source.revision);
        expect(target.receipts.has(intent.id)).toBe(false); target.posts.push(clone(input));
        const stages = input.body.photoCopy.assets.map(asset => control.stages.get(asset.assetId)); expect(stages.every(Boolean)).toBe(true);
        expect(stages.map(stage => stage.receipt.manifest)).toEqual(await adminTemplatePhotoCopyStageManifests(intent));
        const selected = input.body.photoCopy, owner = source.payload[selected.entityType === "item" ? "items" : "containers"][selected.source.entityId];
        const added = selected.assets.map((asset, index) => {
          const file = stages[index].receipt.stored.file, suffix = `/letters-vniipo/api/bike-packing/lists/${encodeURIComponent(target.binding.listId)}/photos/${encodeURIComponent(asset.photoId)}`;
          return { assetId: asset.assetId, assetDigest: asset.assetDigest, sourcePhotoId: asset.sourcePhotoId,
            photo: { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: target.binding.listId, status: "synced",
            url: `${suffix}/file`, thumbUrl: `${suffix}/thumb`, ...Object.fromEntries(["fileName", "type", "size", "width", "height"].map(key => [key, file[key]])),
            ...adminTemplatePhotoCopyReference(owner.photos[index], source.binding.listId) } };
        });
        const confirmedPayload = adminTemplatePhotoCopyPayload(intent, added), photoCopy = { version: 1, ownerId: target.ownerId, sourceOwnerId: source.ownerId,
          entityType: selected.entityType, entityId: selected.entityId, added, confirmedPayload, confirmedPayloadDigest: copyUiDigest(confirmedPayload) };
        expect(await validateAdminTemplatePhotoCopyResult(photoCopy, { intent, stageReceipts: stages })).toBe(true);
        const { id, ...identityWithBody } = intent, { body, ...identity } = identityWithBody;
        data = { ok: true, operation: { id, ...identity, payloadDigest: copyUiDigest(identityWithBody), state: "committed" },
          result: { status: 200, payload: { ok: true, listId: target.binding.listId, itemKey: target.binding.itemKey,
            stateRevision: ++target.revision, visibility: "private", indexes: [], photoCopy } } };
        target.payload = clone(confirmedPayload); target.metadata = clone(input.body.metadata); target.receipts.set(id, data);
        if (control.lostSaveAck) { if (control.hideSaveAfterCommit) control.saveHidden = true; return route.abort("failed"); }
      } else if (suffix.startsWith("/bike-packing/admin/template-operations/") && request.method() === "GET") {
        const id = suffix.split("/").at(-1); control.saveGets.push(id);
        if (control.saveHidden) return route.abort("failed");
        data = target.receipts.get(id) || { ok: true, operation: { id, state: "unknown" } };
      } else return route.fallback();
      return route.fulfill({ headers, json: data });
    } catch (error) { control.errors.push(`${request.method()} ${url.pathname}: ${error.stack || error}`); await route.abort("failed").catch(() => {}); }
  });
  const target = await adminPhotoBrowserFixture(page, context, { shared: sharedTarget, photoCreate: true, exactSourceArrangement: true });
  target.capabilities.push("adminTemplatePhotoCopyV1");
  const binding = { ...target.binding, listId: sharedTarget ? "public-demo-state-copy-source" : "public-shared-layout-copy-source",
    itemKey: sharedTarget ? "demo-state:copy-source" : "shared-layout:copy-source" };
  const payload = clone(target.initialPayload);
  for (const [type, id] of [["items", "pump"], ["containers", "bag"]]) {
    payload[type][id].name = type === "items" ? "Исходный насос" : "Исходная сумка";
    payload[type][id].sourceOpaque = { preserved: [3, 1], exact: { value: null } };
    payload[type][id].photos = [0, 1].map(index => {
      const photoId = `copy-source-${id}-${index}`, suffix = `/letters-vniipo/api/bike-packing/lists/${binding.listId}/photos/${photoId}`;
      return { ...(index ? { photoId } : { id: photoId, photoId }), listId: binding.listId, status: "synced", fileName: `Исходное ${id} ${index}.gif`,
        ...(index ? { file_url: `${suffix}/file`, thumbnailUrl: `${suffix}/thumb` } : { url: `${suffix}/file`, thumbUrl: `${suffix}/thumb` }),
        type: "image/gif", size: selectedGif.length, width: 1, height: 1,
        createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-02T11:00:00.000Z" };
    });
  }
  payload.containers.child = { id: "child", name: "Вложенная сумка остаётся в источнике", parentId: "bag", childIds: [], itemIds: [], order: [], photos: [] };
  payload.containers.bag.childIds = ["child"]; payload.containers.bag.order.push({ type: "container", id: "child" });
  payload.layouts.original.arrangement.containers.bag.childIds = ["child"];
  payload.layouts.original.arrangement.containers.bag.order = clone(payload.containers.bag.order);
  payload.layouts.original.arrangement.containers.child = { parentId: "bag", childIds: [], itemIds: [], order: [] };
  const source = { binding, payload, initialPayload: clone(payload), metadata: { title: "Источник фотографий", description: "Исходный приватный шаблон", language: "ru" },
    revision: 5, visibility: "private", ownerId: "independent-source-owner", preparePosts: [] };
  Object.assign(control, { target, source }); page.adminPhotoCopyServer = control;
  await openCopyUiTemplate(page, binding);
  return control;
}

export async function nativeAdminCopyRecords(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("bike-packing-admin-template-photo-copy-actions-v1");
    const db = await new Promise(resolve => { request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); });
    if (!db) return { actions: [], claims: [] };
    try {
      const tx = db.transaction(["actions", "stage-dispatches"], "readonly"), actions = tx.objectStore("actions").getAll(), claims = tx.objectStore("stage-dispatches").getAll();
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
      const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
      return { actions: await Promise.all(actions.result.map(async row => ({ key: row.key, bindingKey: row.bindingKey, intent: JSON.parse(row.intentJson),
        intentHash: row.intentHash, checkedIntentHash: await hash(row.intentJson) }))), claims: claims.result };
    } finally { db.close(); }
  });
}
