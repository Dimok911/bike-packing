// A delayed initial focus must not steal input after the user already selected
// another field. Capture the focus *after* opening the dialog, not at callback time.
export function focusDialogInputWhenUnchanged(dialog, input, {
  documentRef = globalThis.document,
  requestFrame = callback => requestAnimationFrame(callback)
} = {}) {
  const initialFocus = documentRef.activeElement;
  requestFrame(() => {
    if (dialog.open && documentRef.activeElement === initialFocus) input.focus({ preventScroll: true });
  });
}
