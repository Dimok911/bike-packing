import { personalArchiveJson } from "./personal-archive-import-protocol.js";

// The legacy editor adds this migration marker even to an empty arrangement.
// If that is the ONLY difference from the confirmed base, save it as its own
// ordinary causal action before freezing a guest import. Never sneak a base
// repair into the guest compiler or accept other unconfirmed business edits.
export function personalGuestBaseNeedsPreparation(base, current) {
  if (personalArchiveJson(base) === personalArchiveJson(current)) return false;
  const projected = structuredClone(current);
  for (const [id, layout] of Object.entries(projected.layouts || {})) {
    if (base.layouts?.[id]?.arrangement && !Object.hasOwn(base.layouts[id].arrangement, "itemQuantityMigrationVersion")
      && layout.arrangement?.itemQuantityMigrationVersion === 3) delete layout.arrangement.itemQuantityMigrationVersion;
  }
  if (personalArchiveJson(base) !== personalArchiveJson(projected)) {
    throw Error("Личный редактор отличается от подтверждённой версии. Сначала сохраните личные изменения; гостевой источник сохранён.");
  }
  return true;
}
