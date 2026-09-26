// Stable stored value; offered even before the user creates a dictionary.
export const REQUIRES_CHARGE_CATEGORY = "Требует заряда";
export const NEEDS_REPAIR_CATEGORY = "Нужна починка";

export function builtinCategoryAction(value) {
  const label = String(value || "").trim().toLowerCase();
  if (["требует заряда", "needs charging"].includes(label)) return "charge";
  if (["нужна починка", "needs repair"].includes(label)) return "repair";
  return "";
}

export function isBuiltinCategory(value) {
  return Boolean(builtinCategoryAction(value));
}

export function withBuiltinCategories(values = []) {
  const result = [...values];
  for (const [action, label] of [["repair", NEEDS_REPAIR_CATEGORY], ["charge", REQUIRES_CHARGE_CATEGORY]]) {
    if (!result.some((value) => builtinCategoryAction(value) === action)) result.push(label);
  }
  return result;
}
