#!/usr/bin/env bash
# Read-only diagnostics on the disposable Linux CI runner. Never dump process
# environments, command arguments or browser memory into the artifact.
set -u
printf 'Captured UTC: '
date -u --iso-8601=seconds
printf '\nKernel: '
uname -srmo
printf '\nMemory:\n'
free -b
printf '\nRunner cgroup:\n'
cat /proc/self/cgroup
for metric in current max peak events; do
  printf '\nRoot cgroup memory.%s:\n' "$metric"
  cat "/sys/fs/cgroup/memory.$metric" 2>&1 || true
done
printf '\nBrowser process names and RSS (KiB):\n'
ps -eo pid,ppid,comm,rss | awk 'NR == 1 || /WebKit|WebProcess|MiniBrowser|WPE/'
printf '\nKernel browser crash / memory events since smoke started:\n'
timeout 15s sudo -n journalctl -k --no-pager --since "${BIKE_BROWSER_SMOKE_STARTED:-today}" 2>&1 \
  | awk 'BEGIN { IGNORECASE=1 } /webkit|webprocess|MiniBrowser|segfault|trap|oom|out of memory|killed process|permission|denied|no journal/ { print }' || true
