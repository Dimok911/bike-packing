import { assertRemotePreparationReceipt, assertRemotePreparationNativeSettlement } from "./personal-public-preparation-resolution-protocol.js";

export const assertServerPreparationReceipt = (entry, proof) => assertRemotePreparationReceipt(entry, proof, "serverImport");
export const assertServerPreparationNativeSettlement = (entry, settlement) => assertRemotePreparationNativeSettlement(entry, settlement, "serverImport");
