import { API_BASE, EXPERIMENT_API_BASE } from "../config/constants.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../config/api-contract.js";

export const EXPERIMENT_FRONTEND_ORIGIN = "https://experiment.vniipo-help.ru";
export const EU_EXPERIMENT_API_BASE = "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api";
export const IP_DIAGNOSTIC_API_BASE = "https://201.51.16.219/experiment/letters-vniipo/api";
export const EXPERIMENT_TRANSPORT_KEY = "bike-packing-experiment-transport-v1";
export const AMBIGUOUS_WRITE_KEY = "bike-packing-experiment-uncertain-write-v1";
export const EXPERIMENT_WRITE_LOCK = "bike-packing-experiment-write-journal-v1";
// Deliberate release gate, not a user preference. Enable only in a separately
// approved release after live auth/write/redirect checks and recovery review.
export const EU_TRANSPORT_RELEASE_ENABLED = false;
export const AUTO_TRANSPORT_RELEASE_ENABLED = false;

function tabStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

function journalStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function pendingExperimentWrites(storage = journalStorage()) {
  if (!storage) return [];
  const entries = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(`${AMBIGUOUS_WRITE_KEY}:`)) continue;
      entries.push({ ...JSON.parse(storage.getItem(key)), id: key.slice(AMBIGUOUS_WRITE_KEY.length + 1) });
    }
    return entries;
  } catch { return [{ id: "unreadable", uncertain: true }]; }
}

// Photo identity is stable across queue replay/tab duplication, but different
// photo IDs or bytes remain distinct operations. Never hash generic edit bodies:
// two deliberately identical edits are not necessarily the same operation.
export async function photoWriteIdentity(path, method, body) {
  if (String(method).toUpperCase() !== "POST" || !/\/photos(?:\/copy)?$/.test(path)) return "";
  let identity;
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const file = body.get("file");
    if (!body.get("photoId") || !file?.arrayBuffer) throw transportError("Photo operation identity is missing; write was not sent");
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const thumb = body.get("thumb");
    const thumbBytes = thumb?.arrayBuffer
      ? await globalThis.crypto.subtle.digest("SHA-256", await thumb.arrayBuffer()) : bytes;
    identity = [path, body.get("photoId"), body.get("entityType"), body.get("entityId"),
      file.name, file.type, thumb?.type || file.type, [...new Uint8Array(bytes)], [...new Uint8Array(thumbBytes)]];
  } else if (path.endsWith("/copy")) {
    const data = JSON.parse(body);
    if (!data.photoId) throw transportError("Photo operation identity is missing; write was not sent");
    identity = [path, data.photoId, data.entityType, data.entityId, data.sourceListId, data.sourcePhotoId];
  } else throw transportError("Photo operation identity is missing; write was not sent");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identity)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isExperimentFrontend(locationLike = globalThis.location) {
  return locationLike?.origin === EXPERIMENT_FRONTEND_ORIGIN;
}

export function readTransportSelection(storage = tabStorage()) {
  try {
    const selection = storage?.getItem(EXPERIMENT_TRANSPORT_KEY);
    return ["auto", "direct", "eu"].includes(selection) ? selection : "auto";
  } catch { return "auto"; }
}

export function saveTransportSelection(mode, { storage = tabStorage(), locationLike = globalThis.location } = {}) {
  if (!isExperimentFrontend(locationLike) || !["auto", "direct", "eu"].includes(mode)) throw new Error("Invalid Experiment transport");
  if (!storage) throw new Error("Session storage is unavailable");
  // Only next page load consumes this setting. Never switch in-flight requests.
  storage.setItem(EXPERIMENT_TRANSPORT_KEY, mode);
}

export function validateApiPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\\r\n#]/.test(path)) {
    throw new Error("Invalid API path");
  }
  const pathname = path.split("?")[0];
  for (const segment of pathname.split("/")) {
    const decoded = decodeURIComponent(segment);
    if ([".", ".."].includes(decoded) || /[\\/%]/.test(decoded)) throw new Error("Invalid API path");
  }
  return path;
}

export function isReadOnlyRequest(path, method = "GET") {
  // Auth GETs may consume tokens. Do not treat method=GET as proof of safety.
  return ["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase())
    && (!path.startsWith("/auth/") || path.split("?")[0] === "/auth/me");
}

function transportError(message, status = 0) {
  const error = new Error(message);
  error.status = status;
  error.isTransportUnavailable = true;
  error.isNetworkError = ![401, 403].includes(status);
  return error;
}

export async function probeExperimentProxy({
  target = "eu", fetchImpl = globalThis.fetch, timeoutMs = 7000,
} = {}) {
  if (!["eu", "ip"].includes(target)) throw new Error("Invalid diagnostic target");
  const base = target === "ip" ? IP_DIAGNOSTIC_API_BASE : EU_EXPERIMENT_API_BASE;
  const { response, data } = await readRouteDescriptor(base, { fetchImpl, timeoutMs });
  const identity = response.headers.get("X-Vniipo-Proxy-Target");
  const gate = response.headers.get("X-Vniipo-Proxy-Write-Gate");
  if (identity !== "bike-packing-experiment" || !["enabled", "read-only"].includes(gate)) {
    throw transportError("Proxy identity or write gate is not confirmed");
  }
  assertRouteContract(data);
  return { target, gate, identity, available: true, authenticated: false, usable: target === "eu" && gate === "enabled" };
}

function assertRouteContract(data) {
  if (data?.ok === false || data?.apiCompatibilityVersion !== REQUIRED_ADMIN_API_VERSION
    || !Array.isArray(data.capabilities) || !REQUIRED_ADMIN_API_CAPABILITIES.every(name => data.capabilities.includes(name))) {
    throw transportError("Experiment API contract does not match");
  }
}

async function readRouteDescriptor(base, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  const unavailable = (message, status = 0) => Object.assign(transportError(message, status), { mayTryAlternateRoute: true });
  try {
    // Bound body decoding too. A late response cannot select a route after the
    // timeout won; probes are anonymous GETs and never business operations.
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await fetchImpl(`${base}/bike-packing/capabilities`, {
            method: "GET", credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal
          });
        } catch { throw unavailable("API route is unreachable"); }
        if (response.redirected || response.type === "opaqueredirect") throw transportError("API probe redirect was rejected");
        if (!response.ok) {
          const message = `API route check: HTTP ${response.status}`;
          if (response.status === 408 || response.status >= 500) throw unavailable(message, response.status);
          // Auth, permission, rate-limit and other business/configuration
          // failures are not permission to try a different address.
          throw transportError(message, response.status);
        }
        let data;
        try { data = await response.json(); }
        catch { throw transportError("API route returned an invalid response"); }
        return { response, data };
      })(),
      new Promise((resolve, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(unavailable("API route check timed out"));
      }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

export async function probeDirectExperimentRoute({ fetchImpl = globalThis.fetch, timeoutMs = 7000 } = {}) {
  const { data } = await readRouteDescriptor(EXPERIMENT_API_BASE, { fetchImpl, timeoutMs });
  assertRouteContract(data);
  return { target: "direct", available: true, authenticated: false, usable: true };
}

export function createExperimentTransport({
  locationLike = globalThis.location, selection = readTransportSelection(),
  canonicalBase = API_BASE, fetchImpl = (...args) => globalThis.fetch(...args), storage = journalStorage(),
  locks = globalThis.navigator?.locks,
  euEnabled = EU_TRANSPORT_RELEASE_ENABLED,
  autoEnabled = AUTO_TRANSPORT_RELEASE_ENABLED, probeTimeoutMs = 7000,
} = {}) {
  const experiment = isExperimentFrontend(locationLike);
  const requestedMode = experiment && ["auto", "direct", "eu"].includes(selection) ? selection : "direct";
  const automatic = requestedMode === "auto" && autoEnabled;
  let mode = requestedMode === "eu" ? "eu" : "direct";
  const canonical = experiment ? EXPERIMENT_API_BASE : canonicalBase;
  let readiness = null;
  let ready = mode === "direct" && !automatic;
  let journal = [];
  const ownActiveWrites = new Set();
  const refreshJournal = () => {
    journal = experiment ? pendingExperimentWrites(storage).map((entry) => ({
      ...entry, uncertain: !entry.confirmed && (entry.uncertain || !ownActiveWrites.has(entry.id)),
    })) : [];
  };
  refreshJournal();

  const verifyEu = async () => {
    if (!euEnabled) throw transportError("EU activation is not approved for this release");
    const result = await probeExperimentProxy({ fetchImpl, timeoutMs: probeTimeoutMs });
    if (!result.usable) throw transportError("EU transport is read-only; local changes remain on this device");
  };
  const pendingRoute = () => {
    refreshJournal();
    const pending = journal.filter(entry => !entry.confirmed);
    if (!pending.length) return null;
    const modes = new Set(pending.map(entry => entry.mode));
    if (modes.size !== 1 || !["direct", "eu"].includes([...modes][0])) {
      throw Object.assign(transportError("Unconfirmed writes have no single verified route; select a route for reconciliation"), { isAmbiguousMutation: true });
    }
    return [...modes][0];
  };
  const chooseAutomatically = async () => {
    const pinned = pendingRoute();
    if (pinned === "eu") await verifyEu();
    else {
      try { await probeDirectExperimentRoute({ fetchImpl, timeoutMs: probeTimeoutMs }); }
      catch (error) {
        if (!error.mayTryAlternateRoute || pinned || pendingRoute()) throw error;
        await verifyEu();
        const appeared = pendingRoute();
        if (appeared && appeared !== "eu") throw Object.assign(transportError("A pending write appeared during route selection; automatic switching was stopped"), { isAmbiguousMutation: true });
        mode = "eu";
        return;
      }
    }
    const chosen = pinned || "direct";
    const appeared = pendingRoute();
    if (appeared && appeared !== chosen) throw Object.assign(transportError("Pending writes require a different route; automatic switching was stopped"), { isAmbiguousMutation: true });
    mode = chosen;
  };
  const prepare = () => {
    if (ready) return Promise.resolve();
    if (!readiness) readiness = (automatic ? chooseAutomatically() : verifyEu()).then(() => {
      ready = true;
    }).catch((error) => {
      // A failed preparation made no business request. An explicit later sync
      // may probe again after connectivity returns; a selected route stays pinned.
      readiness = null;
      throw error.isTransportUnavailable ? error : transportError("API transport unavailable; local data is unchanged");
    });
    return readiness;
  };
  const apiUrl = (path) => {
    validateApiPath(path);
    if (!ready) throw transportError("API transport is not verified");
    return `${mode === "eu" ? EU_EXPERIMENT_API_BASE : canonical}${path}`;
  };
  const assertWritable = (path, method, recovery = null, cancellation = null) => {
    validateApiPath(path);
    refreshJournal();
    const causal = recovery?.type === "list" && recovery.protocol === "causal-v1" && recovery.actorId;
    const accessMetadata = value => value?.type === "access" && value.protocol === "access-v1"
      && value.environment === "bike-packing-experiment" && typeof value.actorId === "string" && value.actorId
      && typeof value.listId === "string" && value.listId && ["access.grant", "access.revoke", "access.accept"].includes(value.kind)
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.operationId)
      && /^[a-f0-9]{64}$/.test(value.payloadDigest);
    const accessPath = value => /^\/bike-packing\/access-operations(?:\/[0-9a-f-]{36}\/cancel)?$/.test(value);
    const access = accessMetadata(recovery) && accessPath(path) && method === "POST";
    const adminMetadata = value => value?.type === "admin-template" && value.protocol === "admin-template-v1"
      && value.environment === "bike-packing-experiment" && typeof value.actorId === "string" && value.actorId
      && /^public-(demo-state|shared-layout-)/.test(value.listId) && typeof value.itemKey === "string"
      && ["template.create", "template.copy", "template.save", "template.metadata", "template.publication", "template.archive", "template.delete"].includes(value.kind)
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.operationId)
      && /^[a-f0-9]{64}$/.test(value.payloadDigest);
    const adminPath = value => /^\/bike-packing\/admin\/template-operations(?:\/[0-9a-f-]{36}\/cancel)?$/.test(value);
    const admin = adminMetadata(recovery) && adminPath(path) && method === "POST";
    const ownAdmin = entry => (causal || access || admin) && entry.method === "POST" && adminPath(entry.path)
      && adminMetadata(entry.recovery) && entry.id === entry.recovery.operationId && entry.recovery.actorId === recovery.actorId;
    const adminPeer = entry => admin && entry.recovery?.actorId === recovery.actorId
      && (entry.recovery.type === "list" && entry.recovery.protocol === "causal-v1"
        || entry.method === "POST" && accessPath(entry.path) && accessMetadata(entry.recovery) && entry.id === entry.recovery.operationId);
    const ownAccess = entry => (causal || access) && entry.method === "POST" && accessPath(entry.path)
      && accessMetadata(entry.recovery) && entry.id === entry.recovery.operationId && entry.recovery.actorId === recovery.actorId;
    // These handlers serialize against the owner's data head on the server.
    // An exact pending-data dependency guards grants; revocation can deny a
    // future grant even while its photo files are still awaiting confirmation.
    const accessPeer = entry => access && entry.recovery?.actorId === recovery.actorId
      && (entry.recovery.type === "list" && entry.recovery.protocol === "causal-v1"
        || entry.recovery.type === "photo-stage" && entry.recovery.protocol === "staging-v1");
    // Cancelling a frozen form/import can fence its owner even if one of its own
    // stage ACKs is unknown. This marker is local transport metadata; the
    // queue forbids dispatch/resume of a business write from such an entry.
    // Every unrelated stage/legacy write remains a barrier.
    const imports = ["publicImport", "serverImport", "guestImport", "archiveImport"].filter(key => Object.hasOwn(recovery?.body || {}, key));
    const imported = imports.length === 1 ? recovery.body[imports[0]] : null;
    const importFiles = imported && (imports[0] === "archiveImport" ? imported.version === 2
      : (["publicImport", "serverImport"].includes(imports[0]) ? [1, 2].includes(imported.version) : imported.version === 1)
        && imported.operationId === recovery.operationId) ? imported.files : null;
    const ownCancelledStage = entry => causal && recovery.cancellationOnly === true && method === "POST"
      && entry.path === `/bike-packing/lists/${encodeURIComponent(recovery.listId)}/photo-assets` && entry.method === "POST"
      && entry.recovery?.type === "photo-stage" && entry.recovery.protocol === "staging-v1"
      && entry.recovery.actorId === recovery.actorId && entry.recovery.listId === recovery.listId
      && entry.recovery.actionOperationId === recovery.operationId && entry.recovery.operationId === entry.id
      && (path === `/bike-packing/lists/${encodeURIComponent(recovery.listId)}/photos/mutate`
      && recovery.kind === "photos.mutate" && recovery.body?.action === "form"
      && Array.isArray(recovery.body.changes) && recovery.body.changes.some(change => change.action === "attach"
        && change.assetId === entry.id && change.photoId === entry.recovery.photoId
        && change.entityType === entry.recovery.entityType && change.entityId === entry.recovery.entityId
        && change.entityType === recovery.body.entityType && change.entityId === recovery.body.entityId)
      || path === `/bike-packing/lists/${encodeURIComponent(recovery.listId)}/import` && recovery.kind === "list.import"
      && Array.isArray(importFiles)
      && importFiles.some(file => file.assetId === entry.id && file.photoId === entry.recovery.photoId
        && file.entityType === entry.recovery.entityType && file.entityId === entry.recovery.entityId
        && /^[a-f0-9]{64}$/.test(file.file?.hash) && file.file.hash === entry.recovery.fileHash
        && (file.thumb?.hash || file.file.hash) === entry.recovery.thumbHash));
    // This in-memory permission is derived from the frozen admin save. It can
    // only fence that save on its cancellation URL, never upload/attach a file
    // or acknowledge the separate stage journal's still-unknown outcome.
    const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
      && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
    const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
    const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    const adminPhotoCancellation = admin && recovery.kind === "template.save"
      && path === `/bike-packing/admin/template-operations/${recovery.operationId}/cancel`
      && exact(cancellation, ["operationId", "payloadDigest", "assets"])
      && cancellation.operationId === recovery.operationId && cancellation.payloadDigest === recovery.payloadDigest
      && Array.isArray(cancellation.assets) && cancellation.assets.length > 0 && cancellation.assets.length <= 50
      && Object.keys(cancellation.assets).length === cancellation.assets.length
      && cancellation.assets.every(asset => exact(asset, ["assetId", "assetDigest"]) && uuid(asset.assetId)
        && asset.assetId !== recovery.operationId && hash(asset.assetDigest))
      && new Set(cancellation.assets.map(asset => asset.assetId)).size === cancellation.assets.length;
    const ownCancelledAdminStage = entry => adminPhotoCancellation && entry.mode === mode && entry.method === "POST"
      && entry.path === "/bike-packing/admin/template-photo-assets"
      && exact(entry.recovery, ["type", "protocol", "environment", "actorId", "listId", "itemKey", "operationId", "actionOperationId", "assetDigest", "intentHash"])
      && entry.recovery.type === "admin-template-photo-stage" && entry.recovery.protocol === "admin-template-photo-stage-v1"
      && ["environment", "actorId", "listId", "itemKey"].every(key => entry.recovery[key] === recovery[key])
      && entry.recovery.actionOperationId === recovery.operationId && entry.recovery.operationId === entry.id && hash(entry.recovery.intentHash)
      && cancellation.assets.some(asset => asset.assetId === entry.id && asset.assetDigest === entry.recovery.assetDigest);
    if (journal.some((entry) => entry.uncertain && !(causal && entry.recovery?.type === "list"
      && entry.recovery.protocol === "causal-v1" && entry.recovery.actorId === recovery.actorId)
      && !ownCancelledStage(entry) && !ownCancelledAdminStage(entry)
      && !ownAccess(entry) && !accessPeer(entry) && !ownAdmin(entry) && !adminPeer(entry)) && !isReadOnlyRequest(path, method)) {
      const error = transportError("Previous write has an unknown outcome; reconcile server state before retrying");
      error.isAmbiguousMutation = true;
      throw error;
    }
  };
  const beginWrite = async (path, method = "GET", body = null, recovery = null, cancellation = null) => {
    if (automatic && !ready) throw transportError("API transport is not verified; write was not sent");
    assertWritable(path, method, recovery, cancellation);
    if (!experiment || isReadOnlyRequest(path, method)) return null;
    if (!locks?.request) throw transportError("Cross-tab write lock unavailable; write was not sent");
    const identity = await photoWriteIdentity(path, method, body);
    return locks.request(EXPERIMENT_WRITE_LOCK, () => {
      // Atomic across tabs, including direct and EU. No network/await in this
      // critical section; independent photos in this page can upload concurrently.
      assertWritable(path, method, recovery, cancellation);
      if (identity && journal.some((entry) => entry.identity === identity)) {
        const error = transportError("Photo operation was already sent; reconcile before replay");
        error.isAmbiguousMutation = true;
        error.isDuplicateOperation = true;
        throw error;
      }
      const id = recovery?.operationId || globalThis.crypto.randomUUID();
      if (journal.some((entry) => entry.id === id)) throw transportError("Operation ID already exists; write was not sent");
      const entry = { id, path, method: String(method).toUpperCase(), mode, identity, createdAt: new Date().toISOString(), uncertain: false,
        ...(recovery ? { recovery } : {}) };
      try {
        if (!storage) throw new Error("Storage unavailable");
        storage.setItem(`${AMBIGUOUS_WRITE_KEY}:${id}`, JSON.stringify(entry));
      } catch { throw transportError("Cannot persist request journal; write was not sent"); }
      ownActiveWrites.add(id);
      journal.push(entry);
      return id;
    });
  };
  const confirmWrite = (id, { committed = true, receipt = null } = {}) => {
    if (!id) return;
    refreshJournal();
    const entry = journal.find((entry) => entry.id === id);
    if (entry?.recovery && committed && !receipt) return false;
    ownActiveWrites.delete(id);
    try {
      // Persist protected results before a caller applies them to local state.
      // A restarted queue must recover the same ID, not blindly send again.
      if (committed && (entry?.identity || ["list", "photo-stage", "access", "admin-template", "admin-template-photo-stage"].includes(entry?.recovery?.type))) {
        storage.setItem(`${AMBIGUOUS_WRITE_KEY}:${id}`, JSON.stringify({ ...entry, confirmed: true, uncertain: false,
          ...(entry?.recovery?.type === "list" ? { recovery: { ...entry.recovery, body: undefined } } : {}),
          ...(receipt ? { receipt } : {}) }));
      } else storage.removeItem(`${AMBIGUOUS_WRITE_KEY}:${id}`);
    } catch { /* Persisted intent remains a barrier if acknowledgement cannot be saved. */ }
    refreshJournal();
    return !journal.some((entry) => entry.id === id && !entry.confirmed);
  };
  const noteFailure = (error, path, method = "GET", id = null) => {
    if (!experiment || isReadOnlyRequest(path, method) || error?.isTransportUnavailable
      || [401, 403].includes(Number(error?.status))) return error;
    if (error?.isNetworkError || !error?.status || Number(error.status) >= 500 || Number(error.status) === 408
      || (Number(error.status) >= 200 && Number(error.status) < 400)) {
      const entry = journal.find((entry) => entry.id === id);
      ownActiveWrites.delete(id);
      if (entry) entry.uncertain = true;
      try { if (entry) storage.setItem(`${AMBIGUOUS_WRITE_KEY}:${id}`, JSON.stringify(entry)); } catch { /* Intent already persisted. */ }
      error.isAmbiguousMutation = true;
      error.uncertainWriteId = id;
    } else confirmWrite(id, { committed: false });
    return error;
  };
  const reconcile = (id) => {
    refreshJournal();
    if (!id || !journal.some((entry) => entry.id === id && entry.uncertain)) return false;
    // Reserved for an explicit terminal-operation audit. Hash existence alone
    // cannot prove that this request completed; no automatic caller is shipped.
    confirmWrite(id);
    return !journal.some((entry) => entry.id === id && entry.uncertain);
  };
  const photoPath = (source) => {
    if (!experiment || typeof source !== "string") return null;
    try {
      const url = new URL(source, `${EXPERIMENT_API_BASE}/`);
      const allowed = [new URL(EXPERIMENT_API_BASE).origin, "https://api.vniipo-help.ru", new URL(EU_EXPERIMENT_API_BASE).origin];
      if (!allowed.includes(url.origin) || url.username || url.password) return null;
      const prefix = url.origin === new URL(EU_EXPERIMENT_API_BASE).origin ? "/experiment/letters-vniipo/api" : "/letters-vniipo/api";
      if (!url.pathname.startsWith(`${prefix}/bike-packing/`)) return null;
      const suffix = `${url.pathname.slice(prefix.length)}${url.search}`;
      // Only binary photo routes; external/catalog URLs and auth never enter here.
      if (!/\/photos\/[^/]+\/(file|thumb)$/.test(url.pathname)) return null;
      return validateApiPath(suffix);
    } catch { return null; }
  };
  const photoUrl = async (source) => {
    const path = photoPath(source);
    if (!path) return source;
    await prepare();
    return apiUrl(path);
  };
  return Object.freeze({
    get mode() { return mode; },
    get ready() { return ready; },
    selection: requestedMode, automatic, experiment, prepare, apiUrl, assertWritable, beginWrite, confirmWrite, noteFailure, reconcile, photoUrl,
    get uncertainWrite() { refreshJournal(); return journal.find((entry) => entry.uncertain) || null; },
    get writes() { refreshJournal(); return journal.map((entry) => ({ ...entry })); },
    async fetchPhoto(source, options = {}) {
      const target = await photoUrl(source);
      return fetchImpl(target, { ...options, ...(mode === "eu" && photoPath(source) ? { redirect: "error" } : {}) });
    },
  });
}

export const experimentTransport = createExperimentTransport();
export const transportPhotoFetch = (...args) => experimentTransport.fetchPhoto(...args);
