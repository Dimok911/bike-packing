import {
  createSharedInputLayoutController,
  createSharedInputNormalizer,
  sharedConvertLatinToRuLayout,
  sharedConvertRuToLatinLayout,
  sharedIsExternalTextInsertion,
  sharedShouldEnableInputLayout
} from "./shared-input-layout.js";

export const DESKTOP_INPUT_LAYOUT_MUTE_ICONS = Object.freeze({
  disable: "⏸",
  enable: "▶"
});

export const DEFAULT_DESKTOP_INPUT_LAYOUT_SELECTOR = [
  "#searchInput",
  "#categoryFilterSearch",
  "#itemCategorySearch",
  "#rootContainerCategorySearch",
  "#itemName",
  "#rootContainerName",
  "#itemColor",
  "#rootContainerColor",
  "#itemNote",
  "#rootContainerNote",
  "#layoutEditName",
  "#layoutEditNotes",
  "#layoutName",
  "#addToContainerSearch",
  "#newSubcontainerName",
  "#layoutRootSearch",
  "#categoryInput",
  "#locationInput",
  "[data-new-category-input]",
  "[data-dictionary-edit-input]"
].join(",");

export const convertLatinToRuLayout = sharedConvertLatinToRuLayout;
export const convertRuToLatinLayout = sharedConvertRuToLatinLayout;
export const createDesktopInputNormalizer = createSharedInputNormalizer;
export const isExternalTextInsertion = sharedIsExternalTextInsertion;
export const shouldEnableDesktopInputLayout = sharedShouldEnableInputLayout;

export const createDesktopInputLayoutController = ({
  desktopMediaQuery = "(min-width: 769px) and (hover: hover) and (pointer: fine)",
  documentRef = document,
  getLanguage = () => documentRef.documentElement?.lang || "",
  selector = DEFAULT_DESKTOP_INPUT_LAYOUT_SELECTOR,
  translate = (key) => key,
  windowRef = window
} = {}) => createSharedInputLayoutController({
  desktopMediaQuery,
  documentRef,
  getLanguage,
  selector,
  translate,
  windowRef
});
