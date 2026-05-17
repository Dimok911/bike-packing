export const SORT_MODES = ["asc", "desc", "none"];

export function normalizeSortMode(value) {
  return SORT_MODES.includes(value) ? value : "asc";
}
