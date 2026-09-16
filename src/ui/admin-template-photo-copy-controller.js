const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

// One unchanged picker selection keeps its input identity through quota or an
// uncertain capture. The app owns permanent IDs allocated for that input.
export function createAdminTemplatePhotoCopyController({ getSelection, getSession = () => null, submit, onBusy = () => {}, onError = () => {}, onDurable = () => {} }) {
  const attempts = new Map(); let running = null, session;
  return Object.freeze({
    busy: () => Boolean(running),
    async save() {
      if (running) return running.promise;
      const selection = getSelection(); if (!selection) return false;
      const opened = getSession();
      if (session !== opened) { attempts.clear(); session = opened; }
      const signature = JSON.stringify(selection);
      let attempt = attempts.get(signature);
      if (!attempt) { attempt = { input: freeze(clone(selection)), durable: false, promise: null }; attempts.set(signature, attempt); }
      const current = () => getSession() === opened && JSON.stringify(getSelection()) === signature;
      onBusy(true); running = attempt;
      attempt.promise = Promise.resolve().then(() => submit(attempt.input, { isCurrent: current,
        onDurable: value => { attempt.durable = true; attempts.delete(signature); onDurable(value); } }))
        .catch(error => { onError(error); return false; })
        .finally(() => { if (running === attempt) running = null; onBusy(false); });
      return attempt.promise;
    }
  });
}
