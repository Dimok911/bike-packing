export function shouldShowContainerPickerLayoutSelect({
  copyMode = false,
  newItemPlacementMode = false,
  optionCount = 0
} = {}) {
  return optionCount > 0 && (copyMode || newItemPlacementMode);
}
