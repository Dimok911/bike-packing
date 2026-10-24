"""Publish only the dedicated entry, preserving the hash-verified BP2 app."""
import fcntl,hashlib,json,pathlib,shutil,subprocess,sys,time,urllib.request
artifact=pathlib.Path(sys.argv[1]).resolve();assert str(artifact).startswith('/tmp/bp2-auth-entry-')
manifest=json.loads((artifact/'manifest.json').read_text());assert manifest['scope']=='bp2-independent-auth-entry'
expected={'bp2-auth-entry.html','bp2-auth-entry/entry.js','bp2-auth-entry/styles.css'}
assert {f['path'] for f in manifest['files']}==expected
sha=(artifact/'RELEASE_COMMIT').read_text().strip();assert len(sha)==40 and all(c in '0123456789abcdef' for c in sha)
baseline=json.loads((artifact/'baseline.json').read_text());app=pathlib.Path('/var/www/bp2-personal-20261010')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify_main():
 for f in baseline['files']:
  p=app/f['path'];assert p.resolve().is_relative_to(app) and not p.is_symlink();assert digest(p)==f['sha256'],'Main app changed concurrently'
verify_main()
for f in manifest['files']:assert digest(artifact/f['path'])==f['sha256']
root=pathlib.Path('/var/www/bp2-auth-entry-'+sha[:12]);assert not root.exists()
cfg=pathlib.Path('/etc/nginx/sites-enabled/experiment.vniipo-help.ru').resolve();before=cfg.read_text()
assert '/bp2-auth-entry' not in before
anchor='    # Selected owner-only BP2 working client';assert before.count(anchor)==1
backup=pathlib.Path('/root/backups/bikepacking-experiment')/('auth-entry-'+sha[:12]);backup.mkdir(mode=0o700,exist_ok=False)
(backup/'nginx.before').write_text(before)
with open('/run/lock/bp2-auth-entry.lock','w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 root.mkdir(mode=0o755);(root/'bp2-auth-entry').mkdir(mode=0o755)
 for f in manifest['files']:
  p=root/f['path'];shutil.copyfile(artifact/f['path'],p);p.chmod(0o644)
 route=f'''    # Independent BP2 confirmation; main app is unchanged.
    location = /bp2-auth-entry.html {{
        root {root};
        try_files $uri =404;
        access_log off;
        add_header Cache-Control "no-store" always;
        add_header Referrer-Policy "no-referrer" always;
    }}
    location ^~ /bp2-auth-entry/ {{
        root {root};
        try_files $uri =404;
        add_header Cache-Control "no-store" always;
        add_header X-Content-Type-Options nosniff always;
    }}
'''
 try:
  assert cfg.read_text()==before;verify_main();cfg.write_text(before.replace(anchor,route+anchor))
  subprocess.run(['nginx','-t'],check=True,capture_output=True);subprocess.run(['systemctl','reload','nginx'],check=True)
  for i in range(15):
   try:
    for f in manifest['files']:
     data=urllib.request.urlopen('https://experiment.vniipo-help.ru/'+f['path'],timeout=15).read()
     assert hashlib.sha256(data).hexdigest()==f['sha256']
    break
   except Exception:
    if i==14:raise
    time.sleep(1)
  verify_main();result={'revision':sha,'root':str(root),'rollback':str(backup),'mainUnchanged':True,'mainFilesVerified':len(baseline['files']),'entryFiles':manifest['files']}
  (backup/'success.json').write_text(json.dumps(result));print(json.dumps(result))
 except BaseException:
  cfg.write_text(before);subprocess.run(['nginx','-t'],check=True,capture_output=True);subprocess.run(['systemctl','reload','nginx'],check=True)
  (backup/'rolled-back').write_text('Previous routes restored; main application untouched')
  raise
