"""Activate an Auth-only module graph against the exact published BP2 baseline."""
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,time,urllib.request
artifact=pathlib.Path(sys.argv[1]).resolve()
assert str(artifact).startswith('/tmp/bp2-auth-runtime-')
manifest=json.loads((artifact/'manifest.json').read_text());assert manifest['scope']=='bp2-auth-runtime-adapter'
sha=(artifact/'RELEASE_COMMIT').read_text().strip();assert len(sha)==40 and all(c in '0123456789abcdef' for c in sha)
tag=manifest['tag'];assert len(tag)==12 and all(c in '0123456789abcdef' for c in tag)
assert manifest['factory']['outsideFactoryUnchanged'] and manifest['stylesUnchanged']
app=pathlib.Path('/var/www/bp2-personal-20261010')
baseline={f['path']:f for f in manifest['baseline']['files']}
mutable={'index.html','sw.js'}
assert {f['path'] for f in manifest['files'] if f['path'] in baseline}==mutable
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def safe(root,name):
    p=root/name
    assert not pathlib.Path(name).is_absolute() and '..' not in pathlib.Path(name).parts
    assert p.resolve().is_relative_to(root) and not p.is_symlink()
    return p
def verify_baseline():
    for f in baseline.values():assert digest(safe(app,f['path']))==f['sha256'],'Concurrent BP2 change: '+f['path']
def atomic(target,data):
    tmp=target.with_name(target.name+'.authha-stage-'+sha[:12]);assert not tmp.exists()
    tmp.write_bytes(data);tmp.chmod(0o644);os.replace(tmp,target)
backup=pathlib.Path('/root/backups/bikepacking-experiment')/('auth-runtime-'+sha[:12])
with open('/run/lock/bp2-auth-entry.lock','w') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    verify_baseline()
    for f in manifest['files']:
        assert digest(safe(artifact,f['path']))==f['sha256']
        if f['path'] not in mutable:assert not safe(app,f['path']).exists()
    backup.mkdir(mode=0o700,exist_ok=False)
    for name in mutable:shutil.copy2(app/name,backup/name)
    (backup/'manifest.json').write_text(json.dumps(manifest))
    switched=False
    try:
        for f in manifest['files']:
            if f['path'] in mutable:continue
            target=safe(app,f['path']);target.parent.mkdir(parents=True,exist_ok=True);atomic(target,(artifact/f['path']).read_bytes())
        verify_baseline()
        # New URLs are in place before either entry or SW can reference them.
        switched=True
        atomic(app/'index.html',(artifact/'index.html').read_bytes())
        atomic(app/'sw.js',(artifact/'sw.js').read_bytes())
        for f in manifest['files']:
            public='https://experiment.vniipo-help.ru/bp2-personal/'+f['path']
            data=urllib.request.urlopen(public,timeout=20).read();assert hashlib.sha256(data).hexdigest()==f['sha256']
        for f in baseline.values():
            if f['path'] not in mutable:assert digest(app/f['path'])==f['sha256']
        report={'revision':sha,'tag':tag,'backup':str(backup),'files':manifest['files'],'oldModulesPreserved':True,'stylesUnchanged':True,'httpsHashesVerified':True,'requiresReloadForAlreadyOpenTabs':True}
        (backup/'success.json').write_text(json.dumps(report));print(json.dumps(report))
    except BaseException:
        if switched:
            for name in mutable:
                expected=next(f['sha256'] for f in manifest['files'] if f['path']==name)
                assert digest(app/name) in [expected,baseline[name]['sha256']],'Concurrent change; refusing destructive rollback'
                atomic(app/name,(backup/name).read_bytes())
        (backup/'rolled-back').write_text('Previous entry/SW restored; old and new modules retained for open tabs')
        raise
