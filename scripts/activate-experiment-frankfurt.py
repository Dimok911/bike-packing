#!/usr/bin/env python3
"""Activate ONE Frankfurt virtual host; never deploy RU/API/auth/database files.

Copy this helper, the candidate and a manifest into one private server directory.
Manifest schema (no additional keys):
  {"schemaVersion": 1, "candidateFile": "experiment-frankfurt-domain.conf",
   "candidateSha256": "<64 lowercase hex>",
   "expectedBaselineSha256": "8c2cf05631e1de9d34c1d4036f79e93f24a9b7e796ad9a7a8f5a2d728d53b7ff",
   "apiCompatibilityVersion": "2026-08-30.catalog-review-v1",
   "requiredCapabilities": [<all 18 cohort capabilities below; common caps may be added>]}

Offline validation (no root, HTTP, subprocess or nginx mutation):
  python3 activate-experiment-frankfurt.py check --manifest ./frankfurt-release-manifest.json \
    --expected-manifest-sha256 <reviewed manifest SHA256>
Explicit activation on Frankfurt as root:
  sudo python3 activate-experiment-frankfurt.py activate --manifest ./frankfurt-release-manifest.json \
    --expected-manifest-sha256 <same reviewed manifest SHA256>

Only /etc/nginx/sites-available/vniipo-frankfurt-domain is replaced. Private,
fsynced backups/audit remain under /root/backups/bikepacking-frankfurt. A failed
activation restores the exact saved read-only config, validates/reloads nginx,
and checks public read-only mode/headers/POST denial. A concurrent unrelated
change is never overwritten; an unverified rollback exits 2 for manual review.
SIGINT/SIGTERM trigger rollback; SIGKILL/power loss cannot be handled. Preserve
the backup if interrupted. No credentials, cookies, email or verify POST are
used. The only POST is an empty anonymous list request that must be denied.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import ssl
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

TARGET = Path("/etc/nginx/sites-available/vniipo-frankfurt-domain")
BACKUPS = Path("/root/backups/bikepacking-frankfurt")
BASELINE_SHA256 = "8c2cf05631e1de9d34c1d4036f79e93f24a9b7e796ad9a7a8f5a2d728d53b7ff"
COMPATIBILITY = "2026-08-30.catalog-review-v1"
EU = "https://api-eu.vniipo-help.ru"
RU = "https://api.vniipo-help.ru"
ORIGIN = "https://experiment.vniipo-help.ru"
PREFIX = "/experiment/letters-vniipo/api"
CAPABILITIES = PREFIX + "/bike-packing/capabilities"
LISTS = PREFIX + "/bike-packing/lists"
COHORT = frozenset("""
personalListCausalOperationsV1 personalListOperationCancellationV1
personalListInitialMigrationV1 personalStagedPhotoAssetsV1
personalStagedPhotoCancellationV1 personalCausalPhotoPublicationV1
personalCausalPhotoOwnerStateV1 personalCausalPhotoFormV1
personalCausalPhotoItemFormContextV1 personalCausalPhotoContainerFormContextV1
adminTemplateCausalOperationsV1 adminTemplatePhotoAppendV1 adminTemplatePhotoEditV1
adminTemplateCopyV1 adminTemplateSourceSaveV1 adminTemplatePersonalSourceSaveV1
adminTemplatePendingSourceV1 adminTemplatePendingPersonalSourceV1
""".split())


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON field")
        result[key] = value
    return result


def regular_bytes(path, limit=1024 * 1024):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode), "Input/target must be a regular non-symlink file")
    require(info.st_size <= limit, "Input/target too large")
    data = path.read_bytes()
    require(len(data) <= limit, "Input/target grew beyond limit")
    return data, info


def load_manifest(path, expected_sha):
    require(re.fullmatch(r"[0-9a-f]{64}", expected_sha) is not None, "Invalid manifest SHA256")
    data, _ = regular_bytes(path)
    require(sha256(data) == expected_sha, "Manifest SHA256 mismatch")
    manifest = json.loads(data.decode("utf-8-sig"), object_pairs_hook=unique_object)
    keys = {"schemaVersion", "candidateFile", "candidateSha256", "expectedBaselineSha256",
            "apiCompatibilityVersion", "requiredCapabilities"}
    require(isinstance(manifest, dict) and set(manifest) == keys, "Unexpected manifest shape")
    require(type(manifest["schemaVersion"]) is int and manifest["schemaVersion"] == 1,
            "Unsupported manifest version")
    name = manifest["candidateFile"]
    require(isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*\.conf", name),
            "Candidate must be a .conf basename beside manifest")
    require(manifest["expectedBaselineSha256"] == BASELINE_SHA256, "Unapproved baseline")
    require(manifest["apiCompatibilityVersion"] == COMPATIBILITY, "Unexpected API compatibility")
    caps = manifest["requiredCapabilities"]
    require(isinstance(caps, list) and all(isinstance(cap, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9]+", cap)
                                        for cap in caps), "Invalid required capabilities")
    require(len(caps) == len(set(caps)) and COHORT <= set(caps), "Missing/duplicate cohort capability")
    require(isinstance(manifest["candidateSha256"], str) and
            re.fullmatch(r"[0-9a-f]{64}", manifest["candidateSha256"]), "Invalid candidate SHA256")
    candidate, _ = regular_bytes(path.parent / name)
    require(sha256(candidate) == manifest["candidateSha256"], "Candidate SHA256 mismatch")
    require(sha256(candidate) != BASELINE_SHA256, "Candidate is the read-only baseline")
    return manifest, candidate, data


def fsync_directory(path):
    descriptor = os.open(str(path), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def private_write(path, data):
    descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    fsync_directory(path.parent)


class Audit:
    def __init__(self, directory):
        self.directory = directory
        self.sequence = 0
        self.best_effort = False

    def write(self, name, data):
        try:
            private_write(self.directory / name, data)
        except OSError:
            if not self.best_effort:
                raise

    def record(self, event, **fields):
        self.sequence += 1
        self.write("%03d-%s.json" % (self.sequence, event),
                   json.dumps({"event": event, **fields}, sort_keys=True).encode())

    def command(self, arguments):
        result = subprocess.run(arguments, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=30, check=False)
        self.sequence += 1
        self.write("%03d-command.log" % self.sequence, result.stdout)
        require(result.returncode == 0, "nginx validation/reload failed; see private command log")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class Probes:
    def __init__(self, audit):
        self.audit = audit
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()))

    def request(self, label, base, path, expected, method="GET", origin=ORIGIN, headers=None,
                timeout=15, record=True):
        require(base in (RU, EU) and path.startswith("/") and "?" not in path,
                "Unexpected probe target")
        request_headers = {"Origin": origin, "Accept": "application/json", "Cache-Control": "no-cache"}
        request_headers.update(headers or {})
        data = b"{}" if method == "POST" else None
        if data is not None:
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(base + path, data=data, headers=request_headers, method=method)
        try:
            response = self.opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read(1024 * 1024 + 1)
            status = response.status
            response_headers = response.headers
        require(len(body) <= 1024 * 1024, "Oversized probe response")
        if record:
            self.audit.record(label, method=method, url=base + path, status=status, bodySha256=sha256(body))
        allowed = expected if isinstance(expected, tuple) else (expected,)
        require(status in allowed, label + ": unexpected HTTP status " + str(status))
        require(response_headers.get_all("Set-Cookie") is None, label + ": unexpected anonymous cookie")
        return response_headers, body


def header(headers, name):
    values = headers.get_all(name) or []
    require(len(values) == 1, "Missing/duplicate response header: " + name)
    return values[0].strip()


def cors(headers):
    require(header(headers, "Access-Control-Allow-Origin") == ORIGIN, "CORS origin mismatch")
    require(header(headers, "Access-Control-Allow-Credentials").lower() == "true", "CORS credentials missing")


def json_body(body):
    return json.loads(body.decode("utf-8"), object_pairs_hook=unique_object)


def wait_for_mode(probes, expected_mode):
    """Only retry the public health GET while nginx retires old workers."""
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            _, body = probes.request("readiness", EU, "/healthz", 200,
                                     timeout=max(0.01, deadline - time.monotonic()), record=False)
            payload = json_body(body)
            if isinstance(payload, dict) and payload.get("ok") is True and payload.get("mode") == expected_mode:
                return
        except (RuntimeError, OSError, urllib.error.URLError, ValueError):
            pass
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.2, remaining))
    raise RuntimeError("Public nginx health did not reach expected mode: " + expected_mode)


def capability_probe(probes, manifest, base):
    headers, body = probes.request("capabilities-" + ("eu" if base == EU else "ru"), base, CAPABILITIES, 200)
    cors(headers)
    cache_control = ",".join(headers.get_all("Cache-Control") or []).lower()
    require("no-store" in {part.strip() for part in cache_control.split(",")}, "Capabilities response may be cached")
    if base == EU:
        require(header(headers, "X-Vniipo-Proxy-Target") == "bike-packing-experiment", "EU target mismatch")
        require(header(headers, "X-Vniipo-Proxy-Write-Gate") == "enabled", "EU write gate is not enabled")
        exposed = {entry.strip().lower() for entry in ",".join(headers.get_all("Access-Control-Expose-Headers") or []).split(",")}
        require({"x-vniipo-proxy-target", "x-vniipo-proxy-write-gate"} <= exposed, "EU descriptor not exposed")
    payload = json_body(body)
    require(isinstance(payload, dict) and payload.get("apiCompatibilityVersion") == manifest["apiCompatibilityVersion"],
            "API compatibility mismatch")
    capabilities = payload.get("capabilities")
    require(isinstance(capabilities, list) and all(isinstance(cap, str) for cap in capabilities),
            "Invalid capabilities response")
    require(len(capabilities) == len(set(capabilities)), "Duplicate advertised capability")
    require(set(manifest["requiredCapabilities"]) <= set(capabilities), "Required capability missing")
    return payload["apiCompatibilityVersion"], sorted(capabilities)


def verify_readonly(probes):
    _, body = probes.request("readonly-health", EU, "/healthz", 200)
    payload = json_body(body)
    require(isinstance(payload, dict) and payload.get("ok") is True and
            payload.get("mode") == "experiment-read-only-preflight", "Read-only health mode mismatch")
    headers, _ = probes.request("readonly-capabilities", EU, CAPABILITIES, (200, 409))
    require(header(headers, "X-Vniipo-Proxy-Target") == "bike-packing-experiment", "Read-only target mismatch")
    require(header(headers, "X-Vniipo-Proxy-Write-Gate") == "read-only", "Read-only gate mismatch")
    probes.request("readonly-write-denied", EU, LISTS, 403, method="POST")


def verify_enabled(probes, manifest):
    _, body = probes.request("enabled-health", EU, "/healthz", 200)
    require(json_body(body).get("mode") == "experiment-manual-route-v1", "Enabled health mode mismatch")
    require(capability_probe(probes, manifest, RU) == capability_probe(probes, manifest, EU),
            "Public RU/EU capability sets differ")
    headers, body = probes.request("anonymous-auth", EU, PREFIX + "/auth/me", 200)
    cors(headers)
    payload = json_body(body)
    require(isinstance(payload, dict) and payload.get("ok") is True and
            "user" in payload and payload["user"] is None, "Auth probe is not anonymous")
    for method in ("GET", "POST"):
        headers, _ = probes.request("anonymous-lists-" + method.lower(), EU, LISTS, 401, method=method)
        cors(headers)
    headers, _ = probes.request("foreign-origin", EU, LISTS, 403, method="POST", origin="https://foreign.invalid")
    require(not headers.get_all("Access-Control-Allow-Origin"), "Foreign Origin was granted CORS")
    headers, _ = probes.request("preflight", EU, LISTS, 204, method="OPTIONS", headers={
        "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    cors(headers)
    require("POST" in {value.strip() for value in header(headers, "Access-Control-Allow-Methods").split(",")},
            "POST preflight unavailable")
    require("content-type" in {value.strip().lower() for value in header(headers, "Access-Control-Allow-Headers").split(",")},
            "JSON preflight unavailable")
    probes.request("verify-get-denied", EU, PREFIX + "/auth/verify-magic-link", 403)
    probes.request("internal-denied", EU, PREFIX + "/auth/internal/session", 404)


def replace_target(data, expected_current_hash, original_info):
    current, info = regular_bytes(TARGET)
    require(sha256(current) == expected_current_hash, "EU target changed concurrently; refusing overwrite")
    require(info.st_uid == original_info.st_uid and info.st_gid == original_info.st_gid and
            stat.S_IMODE(info.st_mode) == stat.S_IMODE(original_info.st_mode), "EU target permissions changed")
    descriptor, filename = tempfile.mkstemp(prefix=".vniipo-frankfurt-", dir=str(TARGET.parent))
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fchown(output.fileno(), original_info.st_uid, original_info.st_gid)
            os.fchmod(output.fileno(), stat.S_IMODE(original_info.st_mode))
            os.fsync(output.fileno())
        # Recheck after durable temporary write, immediately before the rename.
        require(sha256(regular_bytes(TARGET)[0]) == expected_current_hash, "EU target changed before rename")
        os.replace(filename, TARGET)
        fsync_directory(TARGET.parent)
        require(sha256(regular_bytes(TARGET)[0]) == sha256(data), "EU config readback mismatch")
    finally:
        if os.path.exists(filename):
            os.unlink(filename)


def activate(manifest, candidate, manifest_bytes):
    require(sys.platform.startswith("linux") and os.geteuid() == 0, "Activation requires Linux root on Frankfurt")
    import fcntl
    lock_fd = os.open("/run/lock/vniipo-experiment-frankfurt.lock",
                      os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "w", encoding="ascii") as lock:
        lock_info = os.fstat(lock.fileno())
        require(stat.S_ISREG(lock_info.st_mode) and lock_info.st_uid == 0 and
                lock_info.st_nlink == 1 and not lock_info.st_mode & 0o077, "Unsafe activation lock")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original, original_info = regular_bytes(TARGET)
        require(sha256(original) == BASELINE_SHA256, "Live baseline SHA256 mismatch; nothing changed")
        require(original_info.st_uid == 0 and not original_info.st_mode & 0o022, "Unsafe target ownership/mode")
        BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
        require(not BACKUPS.is_symlink() and BACKUPS.stat().st_uid == 0 and
                stat.S_IMODE(BACKUPS.stat().st_mode) == 0o700, "Backup root is not private")
        backup = Path(tempfile.mkdtemp(prefix=time.strftime("%Y%m%dT%H%M%SZ-", time.gmtime()), dir=str(BACKUPS)))
        os.chmod(backup, 0o700)
        private_write(backup / "baseline.conf", original)
        private_write(backup / "candidate.conf", candidate)
        private_write(backup / "manifest.json", manifest_bytes)
        audit = Audit(backup)
        audit.record("baseline", sha256=BASELINE_SHA256, uid=original_info.st_uid,
                     gid=original_info.st_gid, mode=stat.S_IMODE(original_info.st_mode))
        probes = Probes(audit)
        audit.command(["/usr/sbin/nginx", "-t"])
        verify_readonly(probes)
        capability_probe(probes, manifest, RU)  # Reject an unready API before opening EU.
        mutation_started = False
        old_handlers = {}

        def interrupted(signum, _frame):
            raise RuntimeError("Activation interrupted by signal " + str(signum))

        for signum in (signal.SIGINT, signal.SIGTERM):
            old_handlers[signum] = signal.signal(signum, interrupted)
        try:
            mutation_started = True  # Includes failures immediately after atomic rename.
            replace_target(candidate, BASELINE_SHA256, original_info)
            audit.command(["/usr/sbin/nginx", "-t"])
            audit.command(["/usr/bin/systemctl", "reload", "nginx"])
            wait_for_mode(probes, "experiment-manual-route-v1")
            verify_enabled(probes, manifest)
            require(sha256(regular_bytes(TARGET)[0]) == manifest["candidateSha256"], "Config changed during verification")
            audit.record("activated", candidateSha256=manifest["candidateSha256"])
            print(json.dumps({"status": "activated", "backup": str(backup), "candidateSha256": manifest["candidateSha256"]}))
            return 0
        except BaseException as failure:
            # A second TERM must not interrupt restoration halfway through.
            for signum in old_handlers:
                signal.signal(signum, signal.SIG_IGN)
            audit.best_effort = True  # Full audit storage must never prevent config restoration.
            audit.record("activation-failed", error=str(failure))
            if mutation_started:
                try:
                    saved, _ = regular_bytes(backup / "baseline.conf")
                    require(sha256(saved) == BASELINE_SHA256, "Saved baseline corrupted")
                    current_hash = sha256(regular_bytes(TARGET)[0])
                    require(current_hash in (BASELINE_SHA256, manifest["candidateSha256"]),
                            "Concurrent EU config change: automatic rollback will not overwrite it")
                    replace_target(saved, current_hash, original_info)
                    audit.command(["/usr/sbin/nginx", "-t"])
                    audit.command(["/usr/bin/systemctl", "reload", "nginx"])
                    wait_for_mode(probes, "experiment-read-only-preflight")
                    verify_readonly(probes)
                    require(sha256(regular_bytes(TARGET)[0]) == BASELINE_SHA256, "Restored baseline changed")
                    audit.record("rollback-verified", sha256=BASELINE_SHA256)
                except BaseException as rollback_error:
                    audit.record("rollback-unverified", error=str(rollback_error))
                    print(json.dumps({"status": "rollback-unverified", "backup": str(backup)}), file=sys.stderr)
                    return 2
            print(json.dumps({"status": "failed-rollback-verified", "backup": str(backup)}), file=sys.stderr)
            return 1
        finally:
            for signum, handler in old_handlers.items():
                signal.signal(signum, handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("check", "activate"))
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--expected-manifest-sha256", required=True)
    args = parser.parse_args()
    try:
        manifest, candidate, manifest_bytes = load_manifest(args.manifest.absolute(), args.expected_manifest_sha256)
        if args.mode == "check":
            print(json.dumps({"status": "inputs-verified", "candidateSha256": manifest["candidateSha256"],
                              "requiredCapabilities": len(manifest["requiredCapabilities"])}))
            return 0
        return activate(manifest, candidate, manifest_bytes)
    except Exception as error:
        print(json.dumps({"status": "failed", "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
