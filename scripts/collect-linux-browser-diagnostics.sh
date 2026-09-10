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
printf '\nRunner service and ancestor cgroup memory:\n'
node --input-type=module -e 'import { readLinuxCgroupMemory } from "./tests/fixtures/browser-lifecycle.js"; console.log(JSON.stringify(readLinuxCgroupMemory(), null, 2));' || true
printf '\nBrowser process names and RSS (KiB):\n'
ps -eo pid,ppid,comm,rss | awk 'NR == 1 || /WebKit|WebProcess|MiniBrowser|WPE/'
printf '\nKernel browser crash / memory events since smoke started:\n'
kernel_events="$(timeout 15s sudo -n journalctl -k --no-pager --since "${BIKE_BROWSER_SMOKE_STARTED:-today}" 2>&1 \
  | awk 'BEGIN { IGNORECASE=1 } /webkit|webprocess|MiniBrowser|segfault|trap|oom|out of memory|killed process|permission|denied|no journal/ { print }' || true)"
printf '%s\n' "$kernel_events"

# Resolve only offsets explicitly reported by this kernel, against the installed
# Playwright library. No core dumps, process attachment or system changes.
offsets="$(printf '%s' "$kernel_events" | node --input-type=module -e '
  let input = ""; for await (const chunk of process.stdin) input += chunk;
  const offsets = [...input.matchAll(/in libWPEWebKit[^\s\[]*\[([a-f0-9]{1,12}),/g)].map(match => match[1]);
  console.log([...new Set(offsets)].slice(0, 4).join("\n"));
' 2>/dev/null)"
if [[ -n "$offsets" ]]; then
  webkit_root="$(node --input-type=module -e 'import { webkit } from "playwright"; import path from "node:path"; console.log(path.dirname(webkit.executablePath()));' 2>/dev/null)"
  if [[ -d "$webkit_root" ]]; then
    printf '\nInstalled WebKit symbols at reported crash offsets:\n'
    while IFS= read -r browser_library; do
      printf '\nLibrary: %s\n' "$browser_library"
      if command -v readelf >/dev/null; then timeout 5s readelf -n "$browser_library" | awk '/Build ID:/ { print }' || true; fi
      while IFS= read -r offset; do
        [[ "$offset" =~ ^[a-f0-9]{1,12}$ ]] || continue
        printf '\nKernel library offset: 0x%s\n' "$offset"
        if command -v addr2line >/dev/null; then timeout 5s addr2line -f -C -i -e "$browser_library" "0x$offset" || true; fi
        if command -v objdump >/dev/null; then
          offset_number=$((16#$offset))
          range_start=$((offset_number > 64 ? offset_number - 64 : 0))
          timeout 5s objdump -dC --start-address="$range_start" --stop-address="$((offset_number + 64))" "$browser_library" || true
        fi
      done <<< "$offsets"
    done < <(find "$webkit_root" -maxdepth 5 -type f -name 'libWPEWebKit*.so*' -print | head -n 2)
  fi
fi
