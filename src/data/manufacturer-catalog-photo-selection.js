const urls = (snapshot = {}) => [...new Set((Array.isArray(snapshot?.sourceImageUrls) ? snapshot?.sourceImageUrls : [snapshot?.sourceImageUrl]).filter(value => { try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; } }))];
export function catalogPhotoSelection(change, selectedUrls) {
  const before = urls(change.before), after = urls(change.after);
  const availableUrls = [...new Set([...after, ...before])];
  const exception = change.manualPhotoException;
  const defaults = change.type === 'missing' ? [] : [...after.filter(url => !exception?.excludedUrls?.includes(url)), ...before.filter(url => exception?.retainedUrls?.includes(url))];
  const selected = selectedUrls ?? change.photoSelection?.selectedUrls ?? defaults;
  return { availableUrls, selectedUrls: availableUrls.filter(url => selected.includes(url)) };
}
export function catalogPhotoSelectionMatches(selection, change) {
  const offered = catalogPhotoSelection(change).availableUrls;
  return Array.isArray(selection?.availableUrls) && JSON.stringify(selection.availableUrls) === JSON.stringify(offered)
    && Array.isArray(selection.selectedUrls) && new Set(selection.selectedUrls).size === selection.selectedUrls.length
    && selection.selectedUrls.every(url => offered.includes(url));
}
