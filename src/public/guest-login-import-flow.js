export async function runGuestLoginHandoffImport(candidate, {
  clearGuestStorage = () => {},
  consumeHandoff = () => {},
  importLayouts = () => [],
  onImportEmpty = () => {},
  onImportPending = () => {},
  onImported = () => {},
  onImportSucceeded = () => {},
  persistImport = async () => false,
  persistImportBeforeCleanup = async () => false
} = {}) {
  if (!candidate?.sourceState || !Array.isArray(candidate.layouts) || !candidate.layouts.length) {
    return { handled: false, status: "missing-candidate", importedLayoutIds: [] };
  }
  const importedLayoutIds = importLayouts(candidate);
  if (!importedLayoutIds.length) {
    consumeHandoff();
    onImportEmpty();
    return { handled: true, status: "empty-import", importedLayoutIds: [] };
  }

  consumeHandoff();
  onImported(importedLayoutIds);
  const saved = await persistImportBeforeCleanup(importedLayoutIds, {
    persistImport,
    clearGuestStorage
  });
  if (!saved) {
    onImportPending(importedLayoutIds);
    return { handled: true, status: "pending-save", importedLayoutIds };
  }
  onImportSucceeded(importedLayoutIds);
  return { handled: true, status: "imported", importedLayoutIds };
}

export function createGuestLoginHandoffCoordinator({
  getCandidate = () => null,
  runImport = async () => ({ handled: false, status: "missing-candidate", importedLayoutIds: [] })
} = {}) {
  let handledForSession = false;
  let offerInFlight = null;

  async function offer() {
    if (handledForSession) {
      return { handled: false, status: "already-handled", importedLayoutIds: [] };
    }
    if (offerInFlight) return offerInFlight;
    const candidate = getCandidate();
    if (!candidate) {
      return { handled: false, status: "missing-candidate", importedLayoutIds: [] };
    }
    handledForSession = true;
    offerInFlight = Promise.resolve(runImport(candidate)).finally(() => {
      offerInFlight = null;
    });
    return offerInFlight;
  }

  return { offer };
}
