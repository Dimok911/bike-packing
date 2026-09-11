"""Server-side, manifest-bound staging of the Experiment API only.

No database restore and no retirement of receipts. Activation failure after a
new writer has started is deliberately forward-only: the caller closes the
Experiment ingress and keeps this receipt-aware runtime available for recovery.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

audit = Path(__file__).resolve().parent
manifest = json.loads((audit / "api-release-manifest.json").read_text())
sha = manifest["commit"]
assert re.fullmatch(r"[0-9a-f]{40}", sha)
base = Path("/opt/bikepacking-api-experiment")
current = base / "current"
old = base / "releases" / manifest["expectedCurrentCommit"]
assert re.fullmatch(r"[0-9a-f]{40}", old.name)
release = base / "releases" / sha
assert release != old
backup = Path("/root/backups/bikepacking-experiment") / ("before-causal-" + sha)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args, **kwargs):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **kwargs)
    if result.returncode:
        # Keep diagnostics server-side: dependency tools must not expose env.
        (audit / "last-command-error.log").write_bytes(result.stdout)
        raise RuntimeError(f"{args[0]} failed; inspect private audit log")
    return result.stdout.decode()


def request(path, port=4318):
    try:
        response = urllib.request.urlopen("http://127.0.0.1:" + str(port) + path, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.loads(response.read())


def ready(port):
    for _ in range(60):
        try:
            status, body = request("/healthz", port)
            if status == 200 and body.get("mode") == "bike-packing":
                return body
        except Exception:
            pass
        time.sleep(.25)
    raise RuntimeError("Experiment API did not become ready")


def assert_capabilities(port):
    status, result = request("/letters-vniipo/api/bike-packing/capabilities", port)
    assert status == 200
    assert result["apiCompatibilityVersion"] == manifest["apiCompatibilityVersion"]
    assert set(manifest["requiredCapabilities"]) <= set(result["capabilities"])


def assert_baseline():
    assert current.resolve() == old, "Experiment API baseline changed"
    assert Path("/opt/vniipo-auth/current").resolve().name == manifest["sharedAuthCommit"]
    assert digest(old / "package-lock.json") == manifest["dependencyLockSha256"]


def assert_staged_source():
    archive_path = audit / "api-source.tar"
    assert digest(archive_path) == manifest["sourceArchiveSha256"]
    with tarfile.open(archive_path) as archive:
        for member in archive.getmembers():
            assert not member.name.startswith("/") and ".." not in Path(member.name).parts
            assert member.isfile() or member.isdir()
            if member.isfile():
                assert digest(release / member.name) == hashlib.sha256(archive.extractfile(member).read()).hexdigest()


def health_without_clock(port):
    status, data = request("/healthz", port)
    assert status == 200
    data.pop("time", None)
    return data


mode = sys.argv[1]
if mode == "stage":
    assert_baseline()
    assert not release.exists(), "Release directory exists; inspect it before retrying"
    assert not backup.exists(), "Release backup exists; inspect it before retrying"
    archive_path = audit / "api-source.tar"
    assert digest(archive_path) == manifest["sourceArchiveSha256"]
    assert not run(["ss", "-Hln", "sport = :4318"]).strip(), "Staging port is occupied"
    backup.mkdir(parents=True, mode=0o700)
    for name in ["ecosystem.config.cjs"]:
        shutil.copy2(base / name, backup / name)
    for name in [".env", "package-lock.json"]:
        shutil.copy2(old / name, backup / name)
    (backup / "production-health.json").write_text(json.dumps(health_without_clock(4311), sort_keys=True))
    run(["bikepacking-experiment-backup"])
    shutil.copy2(backup.parent / "latest.sql.gz", backup / "before.sql.gz")
    run(["gzip", "-t", str(backup / "before.sql.gz")])
    release.mkdir(mode=0o700)
    with tarfile.open(archive_path) as archive:
        members = archive.getmembers()
        for member in members:
            assert not member.name.startswith("/") and ".." not in Path(member.name).parts
            assert member.isfile() or member.isdir()
        archive.extractall(release)
        for member in members:
            if member.isfile():
                assert digest(release / member.name) == hashlib.sha256(archive.extractfile(member).read()).hexdigest()
    assert digest(release / "package-lock.json") == manifest["dependencyLockSha256"]
    (release / "node_modules").symlink_to(old / "node_modules", target_is_directory=True)
    env_text = (old / ".env").read_text()
    assert re.search(r'''(?m)^BIKE_PACKING_DB_DATABASE=["']?bikepacking_experiment["']?\s*$''', env_text)
    assert re.search(r'''(?m)^BIKE_PACKING_DB_USER=["']?bikepacking_experiment_api["']?\s*$''', env_text)
    for key, value in manifest["environment"].items():
        assert re.fullmatch(r"BIKE_PACKING_[A-Z_]+", key) and value in ["0", "1"]
        env_text = re.sub(r"(?m)^" + key + r"=.*(?:\n|$)", "", env_text)
        env_text = env_text.rstrip() + "\n" + key + "=" + value + "\n"
    (release / ".env").write_text(env_text)
    os.chmod(release / ".env", 0o600)
    for entry in manifest["migrations"]:
        relative = entry["path"]
        assert relative.startswith("docs/migrations/") and ".." not in Path(relative).parts
        migration = release / relative
        assert digest(migration) == entry["sha256"]
        sql = migration.read_text()
        assert not re.search(r"(?im)^\s*(?:USE\b|CREATE\s+DATABASE\b|DROP\s+DATABASE\b|TRUNCATE\b)", sql)
        run(["mysql", "--database=bikepacking_experiment", "--default-character-set=utf8mb4"], input=sql.encode())
    if manifest.get("grantPhotoTriggerInspection"):
        # MySQL only exposes these trigger definitions to a user with TRIGGER.
        # Scope the required metadata visibility to this one Experiment table.
        run(["mysql", "--database=bikepacking_experiment"], input=(
            "GRANT TRIGGER ON bikepacking_experiment.bike_packing_photos "
            "TO 'bikepacking_experiment_api'@'127.0.0.1';\n").encode())
    schema_probe = '''
await import('./src/lib/load-env.js');
const mysql = (await import('mysql2/promise')).default;
const { assertTemplatePhotoTombstoneSchema } = await import('./src/lib/bike-packing-template-photo-tombstones.js');
const env = process.env;
if (env.BIKE_PACKING_DB_DATABASE !== 'bikepacking_experiment' || env.BIKE_PACKING_DB_USER !== 'bikepacking_experiment_api') throw Error('Wrong staged DB identity');
const db = await mysql.createConnection({ host: env.BIKE_PACKING_DB_HOST, port: Number(env.BIKE_PACKING_DB_PORT || 3306),
  user: env.BIKE_PACKING_DB_USER, password: env.BIKE_PACKING_DB_PASSWORD, database: env.BIKE_PACKING_DB_DATABASE });
try {
  const tables = JSON.parse(process.argv[2]);
  for (const table of tables) {
    if (!/^bike_packing_[a-z_]+$/.test(table)) throw Error('Unexpected schema table');
    await db.query('SELECT 1 FROM `' + table + '` LIMIT 0');
  }
  await db.beginTransaction();
  await db.query('SELECT 1 FROM bike_packing_photos LIMIT 0');
  await assertTemplatePhotoTombstoneSchema(db);
  await db.rollback();
  console.log('STAGED_SERVICE_USER_SCHEMA_VERIFIED');
} finally { await db.end(); }
'''
    run(["node", "--input-type=module", "-", json.dumps(manifest["requiredTables"])], cwd=release, input=schema_probe.encode())
    run(["node", "--check", "server.mjs"], cwd=release)
    env = os.environ.copy()
    env.update({"PERSONAL_TAGS_SERVER_PORT": "4318", "PERSONAL_TAGS_SERVER_HOST": "127.0.0.1", "VNIIPO_SERVICE_MODE": "bike-packing"})
    with (audit / "candidate-api.log").open("wb") as log:
        process = subprocess.Popen(["node", "server.mjs"], cwd=release, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            ready(4318)
            assert_capabilities(4318)
            assert request("/letters-vniipo/api/bike-packing/lists")[0] == 401
            assert health_without_clock(4311) == json.loads((backup / "production-health.json").read_text())
            (audit / "stage-verified.json").write_text(json.dumps({"commit": sha, "backup": str(backup),
                "databaseRestored": False, "manifestSha256": digest(audit / "api-release-manifest.json"),
                "environmentSha256": digest(release / ".env")}))
        finally:
            process.terminate()
            process.wait(timeout=15)
    print("EXPERIMENT_API_STAGE_VERIFIED", sha)
elif mode == "activate":
    assert_baseline()
    staged = json.loads((audit / "stage-verified.json").read_text())
    assert staged["commit"] == sha
    assert staged["manifestSha256"] == digest(audit / "api-release-manifest.json")
    assert staged["environmentSha256"] == digest(release / ".env")
    assert_staged_source()
    guard = json.loads((audit / "ingress-closed.json").read_text())
    assert guard["drained"] is True
    assert digest(Path(guard["canonicalPath"])) == guard["canonicalSha256"]
    assert digest(Path(guard["guardPath"])) == guard["guardSha256"]
    probe = run(["curl", "--silent", "--show-error", "--max-time", "10", "--resolve",
        "api.vniipo-help.ru:443:127.0.0.1", "-X", "POST", "-H", "Origin: https://experiment.vniipo-help.ru",
        "-H", "Content-Type: application/json", "--data", "{}",
        "https://api.vniipo-help.ru/experiment/letters-vniipo/api/bike-packing/lists"])
    assert json.loads(probe).get("code") == "experiment_release_write_paused"
    temporary = base / (".current-" + sha)
    assert not temporary.exists() and not temporary.is_symlink()
    temporary.symlink_to(release)
    os.replace(temporary, current)
    # Do not automatically revive the old writer if subsequent checks fail.
    # The caller's preinstalled Experiment-only ingress guard controls writes.
    run(["pm2", "restart", str(base / "ecosystem.config.cjs"), "--only", "bikepacking-api-experiment", "--update-env"])
    ready(4312)
    assert_capabilities(4312)
    pid = run(["pm2", "pid", "bikepacking-api-experiment"]).strip()
    assert Path("/proc/" + pid + "/cwd").resolve() == release
    assert health_without_clock(4311) == json.loads((backup / "production-health.json").read_text())
    (audit / "activated.json").write_text(json.dumps({"commit": sha, "pid": pid, "backup": str(backup)}))
    print("EXPERIMENT_API_ACTIVATED", sha)
else:
    raise RuntimeError("Only stage or activate is supported; no destructive rollback")
