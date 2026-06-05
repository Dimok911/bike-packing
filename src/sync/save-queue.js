export function mergeRemoteSaveOptions(previous = null, next = {}) {
  if (!previous) return { ...next };
  return {
    ...previous,
    ...next,
    notify: Boolean(previous.notify || next.notify),
    forceOverwrite: Boolean(previous.forceOverwrite || next.forceOverwrite),
    preferServerOnConflict: Boolean(previous.preferServerOnConflict || next.preferServerOnConflict),
    retryForceConflict: previous.retryForceConflict === false || next.retryForceConflict === false ? false : true,
    preferredLayout: next.preferredLayout || previous.preferredLayout || null
  };
}

export function createQueuedRemoteSave(runSave) {
  let running = null;
  let queuedOptions = null;

  return async function queuedRemoteSave(options = {}) {
    const reentrant = options?._reentrant === true;
    const cleanOptions = { ...options };
    delete cleanOptions._reentrant;

    if (reentrant) return runSave(cleanOptions);

    if (running) {
      queuedOptions = mergeRemoteSaveOptions(queuedOptions, cleanOptions);
      return running;
    }

    running = (async () => {
      let currentOptions = cleanOptions;
      try {
        while (currentOptions) {
          const runOptions = currentOptions;
          currentOptions = null;
          await runSave(runOptions);
          if (queuedOptions) {
            currentOptions = queuedOptions;
            queuedOptions = null;
          }
        }
      } finally {
        running = null;
      }
    })();

    return running;
  };
}
