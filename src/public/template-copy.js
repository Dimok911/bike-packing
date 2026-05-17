export const TEMPLATE_COPY_TITLE = "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0432 \u0441\u0432\u043e\u044e \u0443\u043a\u043b\u0430\u0434\u043a\u0443";
export const TEMPLATE_COPY_ICON_HTML = '<span aria-hidden="true">\u29c9</span>';

export const SHARED_ITEM_COPY_PICKER_MODE = "shared-item-copy";
export const SHARED_CONTAINER_COPY_PICKER_MODE = "shared-container-copy";

export function isContainerPickerCopyMode(mode) {
  return ["item-copy", "container-copy", SHARED_ITEM_COPY_PICKER_MODE, SHARED_CONTAINER_COPY_PICKER_MODE].includes(mode);
}

export function isContainerPickerItemCopyMode(mode) {
  return mode === "item-copy" || mode === SHARED_ITEM_COPY_PICKER_MODE;
}

export function isContainerPickerContainerCopyMode(mode) {
  return mode === "container-copy" || mode === SHARED_CONTAINER_COPY_PICKER_MODE;
}

export function collapsedDefaultsForTemplateContainers(containers, previous = {}, rootContainerIds = []) {
  const rootIds = new Set(rootContainerIds);
  const defaults = Object.fromEntries(Object.keys(containers || {}).map((id) => [id, !rootIds.has(id)]));
  rootIds.forEach((id) => {
    defaults[id] = false;
  });
  return {
    ...defaults,
    ...previous
  };
}

export function shouldShowTemplateAddButton(isReadonlyTemplate) {
  return !isReadonlyTemplate;
}
