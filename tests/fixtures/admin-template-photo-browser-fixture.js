import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoStageManifest, adminTemplatePhotoStageDigest,
  validateAdminTemplatePhotoAppendResult, validateAdminTemplatePhotoStageReceipt } from "../../src/sync/admin-template-photo-append-protocol.js";
import { validateAdminTemplatePhotoEditResult } from "../../src/sync/admin-template-photo-edit-protocol.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

export const adminPhotoOrigin = "https://experiment.vniipo-help.ru";
export const adminPhotoBundle = path.resolve("test-results/admin-template-photo-append-ui-build");
export const selectedGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const api = `${adminPhotoOrigin}/letters-vniipo/api`;
const clone = value => structuredClone(value);
const hash = value => createHash("sha256").update(value).digest("hex");
const digest = value => hash(canonicalTemplateJson(value));
export const photoReferences = payload => Object.fromEntries(["items", "containers"].map(type => [type,
  Object.fromEntries(Object.entries(payload[type]).map(([id, row]) => [id, row.photos || []]))]));
const personal = () => ({ locations: ["Велосипед"], categories: ["Ремонт"], containers: {}, items: {},
  layouts: { personal: { id: "personal", name: "Личный список", rootContainerIds: [],
    arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} } } },
  activeLayoutId: "personal", packedItems: {} });

export async function adminPhotoBrowserFixture(page, context, { shared = false, oldPhotos = true, exactSourceArrangement = false, photoEdit = false } = {}) {
  const bundle = photoEdit ? path.resolve("test-results/admin-template-photo-edit-ui-build") : adminPhotoBundle;
  const webkit = context.browser()?.browserType().name() === "webkit";
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment",
    listId: shared ? "public-shared-layout-photo-ui" : "public-demo-state-photo-ui",
    itemKey: shared ? "shared-layout:photo-ui" : "demo-state:photo-ui" };
  const photo = id => ({ id, photoId: id, listId: binding.listId, status: "synced", fileName: `Original ${id}.gif`,
    url: `${api}/bike-packing/lists/${binding.listId}/photos/${id}/file`,
    thumbUrl: `${api}/bike-packing/lists/${binding.listId}/photos/${id}/thumb`,
    width: 1, height: 1, metadata: { credit: "Original owner", exactOrder: [3, 1, 2] } });
  const payload = { locations: ["Велосипед"], categories: ["Ремонт"],
    items: { pump: { id: "pump", name: "Насос шаблона", weight: 100, quantity: 1, containerId: "bag", location: "Велосипед",
      categories: ["Ремонт"], photos: oldPhotos ? [photo("old-pump")] : [] },
      spare: { id: "spare", name: "Вещь без фото", weight: 20, quantity: 1, containerId: "", categories: [], photos: [] } },
    containers: { bag: { id: "bag", name: "Сумка шаблона", weight: 300, location: "Велосипед", categories: [], parentId: "",
      itemIds: ["pump"], childIds: [], order: [{ type: "item", id: "pump" }], photos: oldPhotos ? [photo("old-bag")] : [] },
      spareBag: { id: "spareBag", name: "Сумка без фото", weight: 30, parentId: "", itemIds: [], childIds: [], order: [], photos: [] } },
    layouts: { original: { id: "original", name: "Фото шаблона", rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { parentId: "", itemIds: ["pump"], childIds: [], order: [{ type: "item", id: "pump" }] } },
      items: { pump: "bag" }, itemQuantities: { pump: 2 }, packedItems: {}, itemQuantityMigrationVersion: 3 } } },
    activeLayoutId: "original", packedItems: {} };
  if (exactSourceArrangement) {
    payload.layouts.original.arrangement.packedItems = { pump: true };
    payload.layouts.original.arrangement.photoRecoveryMarker = { label: "Original administrative arrangement", order: [3, 1, 2] };
    payload.packedItems = { pump: true };
  }
  if (photoEdit) for (const [type, id] of [["items", "pump"], ["containers", "bag"]]) {
    payload[type][id].photos = [photo(`old-${id}`), photo(`второе-${id}`), photo(`third-${id}`)];
  }
  const server = { binding, payload, initialPayload: clone(payload), metadata: { title: "Фото шаблона", description: "", language: "ru" },
    revision: 7, visibility: "private", ownerId: "different-database-owner", privatePayload: personal(),
    posts: [], stagePosts: [], preparePosts: [], operationGets: [], stageGets: [], receipts: new Map(), stages: new Map(), errors: [],
    lostStageAck: false, lostSaveAck: false, stageHidden: false, saveHidden: false, hideSaveAfterCommit: false, stageHold: null,
    capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoEditV1"] };
  page.on("pageerror", error => server.errors.push(error.message));
  await context.addInitScript(() => localStorage.setItem("bike-packing-language-v1", "ru"));
  if (webkit) await context.addInitScript(() => {
    const fetch = globalThis.fetch;
    window.__adminPhotoOutgoingForms = [];
    globalThis.fetch = function(input, options) {
      const url = new URL(typeof input === "string" ? input : input?.url || String(input), location.href);
      if (url.pathname.endsWith("/bike-packing/admin/template-photo-assets") && options?.method === "POST" && options.body instanceof FormData) {
        // WebKit's route protocol can omit file bytes from postDataBuffer().
        // Observe actual outgoing Blob handles independently of the app/IDB;
        // the original fetch starts immediately with its unchanged arguments.
        const entries = [...options.body.entries()], record = { manifest: options.body.get("manifest"), parts: null };
        record.ready = Promise.all(entries.map(async ([name, value]) => typeof value === "string" ? { name, kind: "text", value }
          : { name, kind: "file", fileName: value.name, type: value.type, size: value.size,
            bytes: Array.from(new Uint8Array(await value.arrayBuffer())) })).then(parts => { record.parts = parts; });
        window.__adminPhotoOutgoingForms.push(record);
      }
      return fetch.apply(this, arguments);
    };
  });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { "Access-Control-Allow-Origin": adminPhotoOrigin, "Access-Control-Allow-Credentials": "true" };
    try {
      if (url.pathname.includes("/letters-vniipo/api/")) {
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
        const suffix = url.pathname.split("/letters-vniipo/api")[1]; let data;
        if (/\/photos\/[^/]+\/(file|thumb)$/.test(suffix)) return route.fulfill({ headers, contentType: "image/gif", body: selectedGif });
        if (["/auth/me", "/auth/experiment-share-session"].includes(suffix)) data = { ok: true, user: { id: binding.actorId, email: "admin@example.test" } };
        else if (suffix === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "admin",
          capabilities: ["templates:write", "templates:history:read", "reports:read", "catalog:review"] } };
        else if (suffix === "/bike-packing/capabilities") data = { ok: true, service: "bikepacking-api", apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
          capabilities: server.capabilities };
        else if (suffix === "/bike-packing/lists") data = { ok: true, lists: [{ id: "personal-list", title: "Личный список", ownerId: binding.actorId,
          role: "owner", canEdit: true, stateRevision: 1, payload: server.privatePayload }] };
        else if (suffix.startsWith("/bike-packing/lists/personal-list") && request.method() === "GET") data = { ok: true,
          list: { id: "personal-list", ownerId: binding.actorId, role: "owner", canEdit: true, stateRevision: 1, payload: server.privatePayload },
          payload: server.privatePayload, stateRevision: 1 };
        else if (suffix === "/bike-packing/admin/template-records") data = { ok: true, lists: [{ id: binding.listId, listId: binding.listId,
          publicTemplateKind: shared ? "shared-layout" : "demo", language: "ru", title: server.metadata.title,
          published: false, visibility: "private", adminPayloadEndpoint: "/legacy-read-must-not-be-used" }] };
        else if (suffix === "/bike-packing/admin/template-operations/prepare") {
          server.preparePosts.push(request.postDataJSON());
          data = { ok: true, ...binding, sourceType: "public-template", exists: true, deleted: false, stateRevision: server.revision,
            visibility: server.visibility, metadata: server.metadata, payload: server.payload, indexes: [] };
        } else if (suffix === "/bike-packing/admin/template-photo-assets" && request.method() === "POST") {
          const multipart = await new Response(request.postDataBuffer(), { headers: { "content-type": request.headers()["content-type"] } }).formData();
          const rawManifest = multipart.get("manifest"), manifest = adminTemplatePhotoStageManifest(JSON.parse(rawManifest)), assetDigest = await adminTemplatePhotoStageDigest(manifest);
          const file = multipart.get("file"), thumb = multipart.get("thumb");
          let bytes = Buffer.from(await file.arrayBuffer()), thumbBytes = thumb ? Buffer.from(await thumb.arrayBuffer()) : null;
          let byteEvidence = "intercepted-multipart";
          expect([...multipart.keys()].sort()).toEqual(thumb ? ["file", "manifest", "thumb"] : ["file", "manifest"]);
          if (webkit && (!bytes.length || thumb && !thumbBytes.length)) {
            const observed = await request.frame().evaluate(async raw => {
              const matches = window.__adminPhotoOutgoingForms.filter(row => row.manifest === raw);
              await Promise.all(matches.map(row => row.ready)); return matches.map(row => row.parts);
            }, rawManifest);
            expect(observed).toHaveLength(1);
            const parts = observed[0]; expect(parts.map(part => part.name).sort()).toEqual([...multipart.keys()].sort());
            expect(parts.find(part => part.name === "manifest")).toEqual({ name: "manifest", kind: "text", value: rawManifest });
            for (const [name, parsed, metadata] of [["file", file, manifest.file], ["thumb", thumb, manifest.thumb]]) {
              if (!parsed) continue;
              const part = parts.find(part => part.name === name);
              expect(part).toMatchObject({ name, kind: "file", fileName: parsed.name, type: parsed.type, size: metadata.size });
              const captured = Buffer.from(part.bytes);
              expect(captured.length).toBe(metadata.size); expect(hash(captured)).toBe(metadata.hash);
              const intercepted = name === "file" ? bytes : thumbBytes;
              if (intercepted.length) expect(intercepted.equals(captured)).toBe(true);
              else if (name === "file") bytes = captured; else thumbBytes = captured;
            }
            byteEvidence = "observed-outgoing-formdata-webkit-route-omitted-bytes";
          }
          expect(Object.fromEntries(Object.keys(binding).map(key => [key, manifest[key]]))).toEqual(binding);
          expect(manifest.baseStateRevision).toBe(server.revision); expect(manifest.file).toEqual({ hash: hash(bytes), size: bytes.length, type: file.type, fileName: file.name });
          expect(manifest.thumb).toEqual(thumb ? { hash: hash(thumbBytes), size: thumbBytes.length, type: thumb.type } : null);
          expect(server.payload[manifest.entityType === "item" ? "items" : "containers"][manifest.entityId]?.id).toBe(manifest.entityId);
          // Stage stores bytes only; its response does not advance the template or attach any photo.
          const receipt = { ok: true, assetState: "ready", receipt: { version: 1, manifest, assetDigest,
            ownerId: server.ownerId, baseEntityRevision: 3,
            stored: { file: { ...manifest.file, width: 1, height: 1 }, thumb: manifest.thumb || {
              hash: manifest.file.hash, size: manifest.file.size, type: manifest.file.type } } } };
          expect(await validateAdminTemplatePhotoStageReceipt(receipt, { manifest, assetDigest })).toBe(true);
          server.stagePosts.push({ manifest: clone(manifest), assetDigest, bytes, thumbBytes, contentType: file.type, fileName: file.name, byteEvidence });
          expect(server.stages.has(manifest.operationId)).toBe(false);
          server.stages.set(manifest.operationId, clone(receipt));
          if (server.stageHold) await server.stageHold;
          if (server.lostStageAck) return route.abort("failed");
          data = receipt;
        } else if (suffix.startsWith("/bike-packing/admin/template-photo-assets/") && request.method() === "GET") {
          const id = suffix.split("/").at(-1); server.stageGets.push(id);
          if (server.stageHidden) return route.abort("failed");
          data = server.stages.get(id) || { ok: true, operation: { id, environment: binding.environment, actorId: binding.actorId, state: "unknown" } };
        } else if (suffix === "/bike-packing/admin/template-operations" && request.method() === "POST") {
          const input = request.postDataJSON(), intent = adminTemplateIntent({ actorId: input.expectedActorId, ...input }), { id, ...identityWithBody } = intent;
          expect(input.kind).toBe("template.save");
          const previous = server.posts.find(row => row.operationId === input.operationId);
          if (previous) expect(input).toEqual(previous);
          server.posts.push(clone(input));
          if (!server.receipts.has(id)) {
            if (input.body.base.stateRevision !== server.revision) {
              const { body, ...identity } = identityWithBody;
              const receipt = { ok: true, operation: { id, ...identity, payloadDigest: digest(identityWithBody), state: "rejected" },
                result: { status: 409, payload: { ok: false, error: "Версия шаблона изменилась.", code: "state_revision_conflict" } } };
              server.receipts.set(id, receipt);
              return route.fulfill({ headers, json: receipt });
            }
            expect(photoReferences(input.body.payload)).toEqual(photoReferences(server.payload));
            const assets = input.body.photoAppend?.assets || [], stages = assets.map(asset => server.stages.get(asset.assetId));
            expect(stages.every(Boolean)).toBe(true);
            const confirmedPayload = clone(input.body.payload), added = assets.map((asset, index) => {
              const manifest = stages[index].receipt.manifest, file = stages[index].receipt.stored.file;
              expect(manifest.templateOperationId).toBe(input.operationId);
              const photo = { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: binding.listId, status: "synced",
                url: `${api}/bike-packing/lists/${binding.listId}/photos/${asset.photoId}/file`,
                thumbUrl: `${api}/bike-packing/lists/${binding.listId}/photos/${asset.photoId}/thumb`,
                fileName: file.fileName, type: file.type, size: file.size, width: file.width, height: file.height };
              const owner = confirmedPayload[asset.entityType === "item" ? "items" : "containers"][asset.entityId];
              owner.photos = [...(owner.photos || []), photo];
              return { assetId: asset.assetId, assetDigest: asset.assetDigest, entityType: asset.entityType, entityId: asset.entityId, photo };
            });
            const photoAppend = assets.length ? { version: 1, ownerId: server.ownerId, added, confirmedPayload, confirmedPayloadDigest: digest(confirmedPayload) } : null;
            if (photoAppend) expect(await validateAdminTemplatePhotoAppendResult(photoAppend, { intent, stageReceipts: stages })).toBe(true);
            let editedPhotos;
            if (input.body.photoEdit) {
              expect(assets).toEqual([]);
              const edit = input.body.photoEdit, owner = confirmedPayload[edit.entityType === "item" ? "items" : "containers"][edit.entityId];
              const original = owner.photos, byId = new Map(original.map(photo => [photo.id ?? photo.photoId, photo]));
              expect(new Set(edit.photoIds).size).toBe(edit.photoIds.length);
              expect(edit.photoIds.every(id => byId.has(id))).toBe(true);
              owner.photos = edit.photoIds.map(id => clone(byId.get(id)));
              editedPhotos = { ...edit, ownerId: server.ownerId,
                removedPhotoIds: original.map(photo => photo.id ?? photo.photoId).filter(id => !edit.photoIds.includes(id)),
                confirmedPayload, confirmedPayloadDigest: digest(confirmedPayload) };
              expect(await validateAdminTemplatePhotoEditResult(editedPhotos, { intent })).toBe(true);
            }
            server.payload = clone(confirmedPayload); server.metadata = clone(input.body.metadata); server.revision++;
            const { body, ...identity } = identityWithBody;
            server.receipts.set(id, { ok: true, operation: { id, ...identity, payloadDigest: digest(identityWithBody), state: "committed" },
              result: { status: 200, payload: { ok: true, listId: binding.listId, itemKey: binding.itemKey, stateRevision: server.revision,
                visibility: "private", indexes: [], ...(photoAppend ? { photoAppend } : {}), ...(editedPhotos ? { photoEdit: editedPhotos } : {}) } } });
          }
          if (input.body.photoEdit && server.editAckHold) await server.editAckHold;
          if (server.lostSaveAck) { if (server.hideSaveAfterCommit) server.saveHidden = true; return route.abort("failed"); }
          data = server.receipts.get(id);
        } else if (suffix.startsWith("/bike-packing/admin/template-operations/") && request.method() === "GET") {
          const id = suffix.split("/").at(-1); server.operationGets.push(id);
          if (server.saveHidden) return route.abort("failed");
          data = server.receipts.get(id) || { ok: true, operation: { id, state: "unknown" } };
        } else if (request.method() === "GET") data = { ok: true, lists: [], items: [], containers: [], layouts: [], records: [], photos: [], history: [] };
        else throw Error(`Unexpected legacy/private business write: ${request.method()} ${suffix}`);
        return route.fulfill({ headers, json: data });
      }
      if (url.origin !== adminPhotoOrigin) return route.fulfill({ status: 404, body: "" });
      const filename = path.resolve(bundle, url.pathname === "/" ? "index.html" : "." + url.pathname);
      if (!filename.startsWith(bundle + path.sep)) throw Error("Outside administrative photo test bundle");
      try { return route.fulfill({ body: await readFile(filename), contentType: filename.endsWith(".js") ? "text/javascript"
        : filename.endsWith(".css") ? "text/css" : filename.endsWith(".html") ? "text/html" : "application/octet-stream" }); }
      catch { return route.fulfill({ status: 404, body: "" }); }
    } catch (error) { server.errors.push(`${request.method()} ${url.pathname}: ${error.stack || error}`); await route.abort("failed").catch(() => {}); }
  });
  page.adminPhotoServer = server;
  await page.goto(adminPhotoOrigin); await openAdminPhotoEditor(page, server);
  return server;
}

export async function openAdminPhotoEditor(page, server) {
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await page.waitForFunction(() => window.__adminUiTest?.user()?.id === "admin-a");
  await page.evaluate(binding => __adminUiTest.openPrepared(binding.itemKey.startsWith("shared-layout:")
    ? { type: "shared", sharedId: "photo-ui" } : { type: "demo", demoListId: binding.listId, language: "ru" }), server.binding);
  await page.waitForFunction(listId => Object.values(__adminUiTest.state().layouts).some(layout => layout.adminCausalSource?.binding.listId === listId), server.binding.listId);
}

// Read real IndexedDB records and hash the stored ArrayBuffers independently.
// No application module/store is stubbed or invoked by this observation helper.
export async function nativeAdminPhotoRecords(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("bike-packing-admin-template-photo-actions-v1");
    const db = await new Promise(resolve => { request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); });
    if (!db) return { actions: [], claims: [] };
    try {
      const tx = db.transaction(["actions", "stage-dispatches"], "readonly"), actions = tx.objectStore("actions").getAll(), claims = tx.objectStore("stage-dispatches").getAll();
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
      const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
      return { actions: await Promise.all(actions.result.map(async row => ({ key: row.key, bindingKey: row.bindingKey, intent: JSON.parse(row.intentJson),
        intentHash: row.intentHash, checkedIntentHash: await sha(new TextEncoder().encode(row.intentJson)),
        files: await Promise.all(row.files.map(async part => ({ stageOperationId: part.stageOperationId,
          size: part.file.byteLength, hash: await sha(part.file), thumbHash: part.thumb ? await sha(part.thumb) : null }))) }))), claims: claims.result };
    } finally { db.close(); }
  });
}
