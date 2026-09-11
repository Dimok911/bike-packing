"""Close/open only Experiment business writes, leaving Auth and Production intact."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

audit = Path(__file__).resolve().parent
canonical = Path("/etc/nginx/snippets/bikepacking-experiment-canonical.conf")
guard = Path("/etc/nginx/snippets/bikepacking-experiment-causal-write-gate.conf")
saved = audit / "canonical-before-write-gate.conf"
state_file = audit / "ingress-closed.json"
include = "    include /etc/nginx/snippets/bikepacking-experiment-causal-write-gate.conf;\n"
anchor = "location ^~ /experiment/letters-vniipo/api/ {\n"
closed = '''# Temporary Experiment business-write pause. Auth routes stay separate.
default_type application/json;
if ($request_method !~ ^(GET|HEAD|OPTIONS)$) {
    return 503 '{"ok":false,"code":"experiment_release_write_paused","message":"Обновление Experiment: запись временно приостановлена."}';
}
'''
opened = "# Experiment v1608 candidate verified; business writes enabled.\n"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT).decode()


def workers():
    rows = run(["ps", "-C", "nginx", "-o", "pid=,args="]).splitlines()
    return {row.split()[0] for row in rows if "worker process" in row}


def apply(value):
    guard.write_text(value)
    run(["nginx", "-t"])
    run(["systemctl", "reload", "nginx"])


mode = sys.argv[1]
if mode == "close":
    expected = sys.argv[2]
    assert digest(canonical) == expected, "Canonical Experiment config changed"
    text = canonical.read_text()
    assert text.count(anchor) == 1 and include not in text
    assert not guard.exists() and not saved.exists()
    previous_workers = workers()
    saved.write_bytes(canonical.read_bytes())
    guard.write_text(closed)
    canonical.write_text(text.replace(anchor, anchor + include))
    try:
        run(["nginx", "-t"])
    except Exception:
        canonical.write_bytes(saved.read_bytes())
        guard.unlink()
        raise
    run(["systemctl", "reload", "nginx"])
    # No old worker may continue an already accepted legacy write during API switch.
    deadline = time.monotonic() + 120
    while previous_workers & workers():
        if time.monotonic() >= deadline:
            raise RuntimeError("Write ingress is closed; previous workers have not drained. Do not switch API.")
        time.sleep(.5)
    state_file.write_text(json.dumps({"drained": True, "canonicalPath": str(canonical),
        "canonicalSha256": digest(canonical), "guardPath": str(guard), "guardSha256": digest(guard)}))
    print("EXPERIMENT_WRITE_INGRESS_CLOSED_AND_DRAINED")
elif mode in ["open", "reclose"]:
    state = json.loads(state_file.read_text())
    assert digest(canonical) == state["canonicalSha256"]
    assert guard.read_text() in [closed, opened]
    apply(opened if mode == "open" else closed)
    print("EXPERIMENT_WRITE_INGRESS_" + ("OPEN" if mode == "open" else "CLOSED"))
else:
    raise RuntimeError("Expected close, open or reclose")
