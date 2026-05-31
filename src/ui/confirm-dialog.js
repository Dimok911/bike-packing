import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";

function localizedText(en, ru) {
  return currentDocumentLanguage() === "en" ? en : ru;
}

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
    if (refs.confirmAlternateBtn) footer.insertBefore(refs.confirmAlternateBtn, refs.confirmCancelBtn);
  }

  function askConfirmDialog({
    title,
    text,
    okText,
    cancelText = localizedText("Cancel", "Отмена"),
    alternateText = "",
    highlightText = "",
    highlightCount = "",
    tone = "",
    onOk = null,
    onCancel = null
  }) {
    const isDestructiveAction = isDestructiveConfirmAction(okText, tone);
    const closeBtn = refs.confirmCloseBtn || refs.confirmDialog.querySelector("header .icon-button");
    refs.confirmTitle.textContent = title;
    refs.confirmText.innerHTML = confirmMessageHtml({ text, highlightText, highlightCount, tone });
    refs.confirmCancelBtn.textContent = cancelText;
    refs.confirmOkBtn.textContent = okText;
    if (refs.confirmAlternateBtn) {
      refs.confirmAlternateBtn.textContent = alternateText || "";
      refs.confirmAlternateBtn.hidden = !alternateText;
    }
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
        closeBtn?.removeEventListener("click", handleCloseButton);
        if (refs.confirmAlternateBtn) {
          refs.confirmAlternateBtn.onclick = null;
          refs.confirmAlternateBtn.hidden = true;
          refs.confirmAlternateBtn.textContent = "";
        }
        refs.confirmCancelBtn.classList.remove("danger-action");
        refs.confirmOkBtn.classList.remove("danger-action");
        refs.confirmDialog.classList.remove("danger-confirm-dialog");
        setConfirmButtonOrder();
      };
      const handleClose = () => {
        const value = refs.confirmDialog.returnValue;
        const confirmed = value === "close" ? null : value === "alternate" ? "alternate" : value === "default";
        cleanup();
        resolve(confirmed);
      };
      const handleCloseButton = (event) => {
        event.preventDefault();
        refs.confirmDialog.close("close");
      };
      const runAction = (action) => {
        try {
          action?.();
        } catch {
          // Confirmation side effects must not prevent the dialog from closing.
        }
      };
      refs.confirmCancelBtn.onclick = (event) => {
        event.preventDefault();
        runAction(onCancel);
        refs.confirmDialog.close("cancel");
      };
      refs.confirmOkBtn.onclick = (event) => {
        event.preventDefault();
        runAction(onOk);
        refs.confirmDialog.close("default");
      };
      if (refs.confirmAlternateBtn) {
        refs.confirmAlternateBtn.onclick = (event) => {
          event.preventDefault();
          refs.confirmDialog.close("alternate");
        };
      }
      closeBtn?.addEventListener("click", handleCloseButton);
      refs.confirmDialog.addEventListener("close", handleClose);
      openModalDialog(refs.confirmDialog);
    });
  }

  function askUnsavedChangesDialog() {
    refs.confirmTitle.textContent = localizedText("You have unsaved changes", "Есть несохранённые изменения");
    refs.confirmText.textContent = localizedText("Save changes before closing?", "Сохранить изменения перед закрытием?");
    refs.confirmCancelBtn.textContent = localizedText("Close without saving", "Закрыть без сохранения");
    refs.confirmOkBtn.textContent = localizedText("Save", "Сохранить");
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
