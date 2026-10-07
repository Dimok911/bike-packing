"""Create off-host recovery archive and restore every entry before cleanup."""
import hashlib, json, sys, zipfile
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1]).resolve()
archive = Path(sys.argv[2]).resolve()
manifest_bytes = (root / 'prepared-cleanup.json').read_bytes()
manifest = json.loads(manifest_bytes)
def digest(data):
    return hashlib.sha256(data).hexdigest().upper()
def checked_path(base, relative):
    parts = PurePosixPath(relative).parts
    if not parts or relative.startswith('/') or any(p in ('..', '.') for p in parts) or '\\' in relative:
        raise ValueError('Unsafe archive path')
    target = base.joinpath(*parts).resolve()
    if not target.is_relative_to(base.resolve()):
        raise ValueError('Archive path escaped destination')
    return target
archive.parent.mkdir(parents=True, exist_ok=True)
# Exclusive creation: never overwrite the only recoverable archive.
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
    for entry in manifest['files']:
        source = checked_path(root / 'candidate-backup', entry['path'])
        data = source.read_bytes()
        if len(data) != entry['bytes'] or digest(data) != entry['sha256']:
            raise ValueError('Source hash mismatch')
        out.writestr(entry['path'], data)
restore = root / 'candidate-restore-drill'
restore.mkdir(exist_ok=True)
verified = 0
with zipfile.ZipFile(archive, 'r') as saved:
    expected = {f['path']: f for f in manifest['files']}
    if len(saved.namelist()) != len(expected) or set(saved.namelist()) != set(expected):
        raise ValueError('Archive entry set differs from manifest')
    for name in saved.namelist():
        target = checked_path(restore, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(saved.read(name))
        actual = target.read_bytes()
        if len(actual) != expected[name]['bytes'] or digest(actual) != expected[name]['sha256']:
            raise ValueError('Restored file hash mismatch')
        verified += 1
record = dict(manifestSha256=digest(manifest_bytes), files=len(manifest['files']), verifiedRestoredFiles=verified, archivePath=str(archive), archiveSha256=digest(archive.read_bytes()), archiveBytes=archive.stat().st_size, originalBytes=manifest['bytes'], resticUsed=False)
(root / 'archive-verification.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
archive.with_suffix('.manifest.json').write_bytes(manifest_bytes)
archive.with_suffix('.verification.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record, indent=2))
