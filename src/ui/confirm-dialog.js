import { escapeHtml } from "../utils/html.js";

export function isDestructiveConfirmAction(okText, tone = "") {
  return tone === "danger" || /удал|сброс|разобрать|выйти/i.test(okText);
}

export function confirmMessageHtml({ text, highlightText = "", highlightCount = "", tone = "" }) {
  if (!highlightText) return escapeHtml(text);
  const highlightClass = `confirm-highlight confirm-${tone || "safe"}`;
  const countHtml = highlightCount
    ? `<strong class="confirm-highlight-count">${escapeHtml(highlightCount)}</strong>`
    : "";
  return `${escapeHtml(text)}<span class="${highlightClass}">${countHtml}${escapeHtml(highlightText)}</span>`;
}

export function createConfirmDialogController({ refs, openModalDialog }) {
  function setConfirmButtonOrder() {
    const footer = refs.confirmCancelBtn?.parentElement;
    if (!footer) return;
    footer.insertBefore(refs.confirmOkBtn, refs.confirmCancelBtn);
  }

  function askConfirmDialog({ title, text, okText, cancelText = "Отмена", highlightText = "", highlightCount = "", tone = "" }) {
    const isDestructiveAction = isDestructiveConfirmAction(okText, tone);
    refs.confirmTitle.textContent = title;
    refs.confirmText.innerHTML = confirmMessageHtml({ text, highlightText, highlightCount, tone });
    refs.confirmCancelBtn.textContent = cancelText;
    refs.confirmOkBtn.textContent = okText;
    refs.confirmCancelBtn.classList.remove("danger-action");
    refs.confirmOkBtn.classList.toggle("danger-action", isDestructiveAction);
    refs.confirmDialog.classList.toggle("danger-confirm-dialog", isDestructiveAction);
    setConfirmButtonOrder();
    refs.confirmDialog.returnValue = "";
    return new Promise((resolve) => {
      const cleanup = () => {
        refs.confirmDialog.removeEventListener("close", handleClose);
        refs.confirmCancelBtn.onclick = null;
        refs.confirmOkBtn.onclick = null;
        refs.confirmCancelBtn.classList.remove("danger-action");
        refs.confirmOkBtn.classList.remove("danger-action");
        refs.confirmDialog.classList.remove("danger-confirm-dialog");
        setConfirmButtonOrder();
      };
      const handleClose = () => {
        const confirmed = refs.confirmDialog.returnValue === "default";
        cleanup();
        resolve(confirmed);
      };
      refs.confirmCancelBtn.onclick = (event) => {
        event.preventDefault();
        refs.confirmDialog.close("cancel");
      };
      refs.confirmOkBtn.onclick = (event) => {
        event.preventDefault();
        refs.confirmDialog.close("default");
      };
      refs.confirmDialog.addEventListener("close", handleClose);
      openModalDialog(refs.confirmDialog);
    });
  }

  function askUnsavedChangesDialog() {
    refs.confirmTitle.textContent = "Есть несохранённые изменения";
    refs.confirmText.textContent = "Сохранить изменения перед закрытием?";
    refs.confirmCancelBtn.textContent = "Закрыть без сохранения";
    refs.confirmOkBtn.textContent = "Сохранить";
    refs.confirmCancelBtn.classList.add("danger-action");
    refs.confirmOkBtn.classList.remove("danger-action");
    refs.confirmDialog.classList.remove("danger-confirm-dialog");
    setConfirmButtonOrder();
    refs.confirmDialog.returnValue = "";

    return new Promise((resolve) => {
      const closeBtn = refs.confirmCloseBtn || refs.confirmDialog.querySelector("header .icon-button");
      const cleanup = () => {
        refs.confirmDialog.removeEventListener("close", handleClose);
        refs.confirmCancelBtn.onclick = null;
        refs.confirmOkBtn.onclick = null;
        closeBtn?.removeEventListener("click", keepEditing);
        refs.confirmCancelBtn.classList.remove("danger-action");
        refs.confirmOkBtn.classList.remove("danger-action");
        refs.confirmDialog.classList.remove("danger-confirm-dialog");
        setConfirmButtonOrder();
      };
      const handleClose = () => {
        const value = refs.confirmDialog.returnValue;
        cleanup();
        if (value === "save") {
          resolve("save");
        } else if (value === "discard") {
          resolve("discard");
        } else {
          resolve("keep");
        }
      };
      const keepEditing = (event) => {
        event.preventDefault();
        refs.confirmDialog.close("keep");
      };
      refs.confirmCancelBtn.onclick = (event) => {
        event.preventDefault();
        refs.confirmDialog.close("discard");
      };
      refs.confirmOkBtn.onclick = (event) => {
        event.preventDefault();
        refs.confirmDialog.close("save");
      };
      closeBtn?.addEventListener("click", keepEditing);
      refs.confirmDialog.addEventListener("close", handleClose);
      openModalDialog(refs.confirmDialog);
    });
  }

  function openConfirmDialog({ title, text, okText, highlightText = "", highlightCount = "", tone = "", onConfirm }) {
    askConfirmDialog({ title, text, okText, highlightText, highlightCount, tone }).then((confirmed) => {
      if (!confirmed) return;
      onConfirm();
    });
  }

  return {
    askConfirmDialog,
    askUnsavedChangesDialog,
    openConfirmDialog
  };
}
