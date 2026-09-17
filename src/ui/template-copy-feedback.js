// A visible status belongs to the form, not to a short-lived toast. It does
// not own the operation and closing the form does not cancel the request.
export function createTemplateCopyFeedback({ dialog, button, text = (ru, en) => ru }) {
  let status = dialog.querySelector('[data-template-copy-status]');
  if (!status) {
    status = dialog.ownerDocument.createElement('p');
    status.dataset.templateCopyStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    button.parentElement.before(status);
  }
  const originalLabel = button.textContent;
  dialog.querySelector('[data-template-copy-recovery]')?.remove();
  const notice = text(' Не обновляйте страницу до завершения. Закрытие формы не отменяет копирование.',
    ' Keep this page open until completion. Closing the form does not cancel the copy.');
  status.textContent = text('Подготавливаю копирование…', 'Preparing the copy…') + notice;
  button.textContent = text('Копирование…', 'Copying…');
  button.setAttribute('aria-busy', 'true');
  return {
    progress({ phase, completed, total }) {
      status.textContent = (phase === 'confirming'
        ? text('Фотографии готовы. Жду подтверждения копии сервером…', 'Photos ready. Waiting for the server to confirm the copy…')
        : text(`Копирование фотографий: ${completed} из ${total}.`, `Copying photos: ${completed} of ${total}.`)) + notice;
    },
    error(error) {
      status.textContent = text('Копирование не завершено: ', 'Copy not completed: ') + error.message
        + (error.code ? ` (${error.code})` : '');
      if (typeof error.recoverCopy === 'function') {
        status.textContent += text(` Сохранённая попытка: «${error.savedCopyTitle}».`, `Saved attempt: “${error.savedCopyTitle}”.`);
        const recovery = dialog.ownerDocument.createElement('button');
        recovery.type = 'button';
        recovery.dataset.templateCopyRecovery = '';
        recovery.textContent = text('Завершить или отменить копирование', 'Complete or cancel copying');
        recovery.addEventListener('click', async () => {
          recovery.disabled = true;
          try { await error.recoverCopy(); }
          catch (failure) { status.textContent = failure.message; }
          finally { recovery.disabled = false; }
        });
        status.after(recovery);
      }
    },
    complete() { status.remove(); dialog.querySelector('[data-template-copy-recovery]')?.remove(); },
    finish() {
      button.textContent = originalLabel;
      button.removeAttribute('aria-busy');
    }
  };
}
