export function assertDeletionFile(file, allowed) {
  const p = file?.path;
  if (typeof p !== 'string' || /[\\\x00-\x20%:]/.test(p) || p.split('/').some(s => !s || s === '.' || s === '..')) throw Error('Unsafe deletion path');
  if (!/^bike-packing(?:[-.]backup(?:-before|-pre)?-v\d+[-A-Za-z0-9_.]*|\.previous-v\d+[-A-Za-z0-9_.]*)\//.test(p) || /experiment/i.test(p)) throw Error('Protected root');
  const relative = p.slice(p.indexOf('/') + 1);
  if (!/^(?:app\.js|styles\.css|index\.html|index\.php|sw\.js|release-contract\.json|manifest\.webmanifest|assets\/(?:index-[A-Za-z0-9_-]+\.(?:js|css)|manifest-[A-Za-z0-9_-]+\.webmanifest))$/.test(relative)) throw Error('Not an application release file');
  if (!allowed.has(p) || file.bytes !== allowed.get(p)) throw Error('File not in reviewed manifest');
  if (!/^[A-Fa-f0-9]{64}$/.test(file.sha256)) throw Error('Missing file hash');
  return p;
}
export function assertUnchangedRoot(files, freshFiles, links, root) {
  const expected = files.filter(f => f.path.startsWith(root + '/')).map(f => [f.path, f.bytes]).sort();
  const actual = freshFiles.filter(f => f.path.startsWith(root + '/')).map(f => [f.path, f.bytes]).sort();
  if (!expected.length || JSON.stringify(expected) !== JSON.stringify(actual) || links.some(p => p.startsWith(root + '/'))) throw Error('Root contents changed or linked');
}

export function resumeCleanup(files, remoteFiles, links, previous) {
  const known = new Map(files.map(f => [f.path, f]));
  const remote = new Map(remoteFiles.map(f => [f.path, f]));
  if (!Array.isArray(previous?.deleted) || !previous.deleted.length) throw Error('No verified previous progress');
  for (const f of previous.deleted) {
    const expected = known.get(f.path);
    if (!expected || expected.bytes !== f.bytes || expected.sha256 !== f.sha256 || remote.has(f.path)) throw Error('Previous progress does not match manifest/hosting');
  }
  const remaining = files.filter(f => remote.has(f.path));
  const missing = files.filter(f => !remote.has(f.path));
  for (const root of new Set(files.map(f => f.path.split('/')[0]))) {
    const present = remaining.filter(f => f.path.startsWith(root + '/'));
    if (present.length) assertUnchangedRoot(present, remoteFiles, links, root);
    else if (remoteFiles.some(f => f.path.startsWith(root + '/')) || links.some(p => p.startsWith(root + '/'))) throw Error('Completed directory changed');
  }
  return { remaining, missing };
}
