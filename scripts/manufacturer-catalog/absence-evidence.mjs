import { manufacturerIdForEntry } from "../../src/data/manufacturer-catalog-scan.js";

// A collection disappearing, being truncated, or changing its filters is not
// evidence of a product's removal. Only an explicit 404/410 on its page is.
export async function verifyCatalogAbsences({ approved, scanned, sources, errors, fetchText }) {
  const found = new Set(scanned.map((entry) => entry.id));
  const checked = new Map();
  for (const entry of approved) {
    const brand = manufacturerIdForEntry(entry);
    const source = sources.find((item) => item.id === brand);
    if (!source || errors[brand]?.length || found.has(entry.id)) continue;
    let result = checked.get(entry.sourceUrl);
    if (!result) {
      try {
        await fetchText(entry.sourceUrl, 1, null, source.acceptLanguage);
        result = "The source page still responds; discovery or variant matching requires review";
      } catch (error) {
        result = [404, 410].includes(error.httpStatus) ? "absent" : `Absence could not be verified: ${error.message}`;
      }
      checked.set(entry.sourceUrl, result);
    }
    if (result !== "absent") errors[brand].push(`${entry.id}: ${result}`);
  }
}
