// Keep existing synchronous stores synchronous; an asynchronous store must
// finish its durable write before the prepared candidate can replace the UI.
export function commitPreparedPersonalChange({ persist, isCurrent, apply, onError }) {
  const finish = (saved, crossedAsyncBoundary) => {
    if (saved === false) throw new Error("Не удалось сохранить действие. Изменения не применены.");
    if (crossedAsyncBoundary && !isCurrent()) throw new Error("Список изменился во время сохранения. Записанное действие осталось в исходном списке; текущий экран не изменён.");
    return apply();
  };
  try {
    const result = persist();
    // Synchronous legacy capture can establish the initial list ID itself.
    // No event can switch editors between that capture and its application.
    return result?.then ? Promise.resolve(result).then(saved => finish(saved, true)).catch(onError) : finish(result, false);
  } catch (error) { return onError(error); }
}
