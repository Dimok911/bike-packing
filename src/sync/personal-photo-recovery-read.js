const fields = ["environment", "actorId", "listId", "scopeKey"];
const sameOwner = (context, binding) => context?.scope === "personal"
  && Boolean(context.generation) && fields.every(key => context[key] === binding[key]);
const superseded = () => Object.assign(Error("Укладка изменилась во время проверки. Проверка сохранённых действий будет повторена."),
  { code: "photo-recovery-superseded" });
const contextChanged = error => error?.isPersonalSelectionContextChanged === true
  || error?.code === "context-changed" && error.isPersonalPhotoStorageBlocked === true
  || error?.code === "photo-recovery-context" && error.isPersonalPhotoRecoveryBlocked === true
  || error?.code === "photo-recovery-superseded";

// Retry only a cancelled read of this same editor. A storage/corruption error
// must retain its original meaning even when an edit happened at the same time.
// The callback is read-only: neither dispatch nor completion belongs here.
export async function readPersonalPhotoRecoveryInCurrentContext({ binding, getContext, read }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const initial = { ...getContext() };
    if (!sameOwner(initial, binding)) throw superseded();
    try {
      const result = await read();
      const current = getContext();
      if (!sameOwner(current, binding) || current.generation !== initial.generation) throw superseded();
      return result;
    } catch (error) {
      const current = getContext();
      if (!contextChanged(error)) throw error;
      if (!sameOwner(current, binding)) throw superseded();
      if (current.generation === initial.generation) throw error;
      if (attempt === 2) throw superseded();
    }
  }
}
