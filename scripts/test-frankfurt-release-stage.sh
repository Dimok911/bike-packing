#!/usr/bin/env bash
set -Eeuo pipefail
candidate=${1:?candidate config required}
[[ -f "$candidate" && ! -L "$candidate" ]]
[[ -z $(ss -Hln 'sport = :18448 or sport = :18088') ]]
run=$(mktemp -d /root/bikepacking-eu-loopback-XXXXXXXX)
cleanup() {
  if [[ -f "$run/nginx.pid" ]]; then
    nginx -p "$run/" -c "$run/nginx.conf" -s quit
    for attempt in {1..40}; do [[ ! -e "$run/nginx.pid" ]] && break; sleep 0.1; done
    [[ ! -e "$run/nginx.pid" ]]
  fi
  echo "LOOPBACK_EVIDENCE=$run"
}
trap cleanup EXIT
sed -e 's/listen 80;/listen 127.0.0.1:18088;/' \
    -e 's/listen 443 ssl;/listen 127.0.0.1:18448 ssl;/' \
    -e "s@access_log /var/log/nginx/vniipo-domain-access.log@access_log $run/access.log@" \
    "$candidate" > "$run/server.conf"
cat > "$run/nginx.conf" <<EOF
pid $run/nginx.pid;
error_log $run/error.log;
events {}
http {
  include /etc/nginx/mime.types;
  include /etc/nginx/conf.d/00-vniipo-proxy-common.conf;
  include $run/server.conf;
}
EOF
nginx -p "$run/" -c "$run/nginx.conf" -t
nginx -p "$run/" -c "$run/nginx.conf"
base=https://api-eu.vniipo-help.ru:18448
prefix=/experiment/letters-vniipo/api
check() {
  local expected=$1 path=$2 label=$3
  shift 3
  local code
  code=$(curl --silent --show-error --max-time 15 --resolve api-eu.vniipo-help.ru:18448:127.0.0.1 \
    --dump-header "$run/$label.headers" --output "$run/$label.body" --write-out '%{http_code}' "$@" "$base$path")
  [[ "$code" == "$expected" ]] || { echo "FAIL $label expected=$expected actual=$code"; return 1; }
  echo "PASS $label $code"
}
check 200 "$prefix/bike-packing/capabilities" capabilities -H 'Origin: https://experiment.vniipo-help.ru'
grep -qi '^X-Vniipo-Proxy-Target: bike-packing-experiment' "$run/capabilities.headers"
grep -qi '^X-Vniipo-Proxy-Write-Gate: enabled' "$run/capabilities.headers"
grep -qi '^Access-Control-Allow-Origin: https://experiment.vniipo-help.ru' "$run/capabilities.headers"
grep -qi '^Access-Control-Allow-Credentials: true' "$run/capabilities.headers"
check 200 "$prefix/auth/me" anonymous-auth -H 'Origin: https://experiment.vniipo-help.ru'
check 401 "$prefix/bike-packing/lists" private-read -H 'Origin: https://experiment.vniipo-help.ru'
check 401 "$prefix/bike-packing/lists" unauthenticated-write -X POST -H 'Origin: https://experiment.vniipo-help.ru' -H 'Content-Type: application/json' --data '{}'
check 403 "$prefix/bike-packing/lists" missing-origin -X POST --data '{}'
check 403 "$prefix/bike-packing/lists" foreign-origin -X POST -H 'Origin: https://foreign.example' --data '{}'
check 204 "$prefix/bike-packing/lists" preflight -X OPTIONS -H 'Origin: https://experiment.vniipo-help.ru' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'
check 403 "$prefix/bike-packing/lists" foreign-header -X OPTIONS -H 'Origin: https://experiment.vniipo-help.ru' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization'
check 403 "$prefix/auth/verify-magic-link" verify-get
check 403 "$prefix/auth/verify-magic-link" verify-head -I
check 404 "$prefix/auth/internal/session" internal
check 404 /letters-vniipo/api/bike-packing/lists old-writer -X POST -H 'Origin: https://experiment.vniipo-help.ru' --data '{}'
echo FRANKFURT_LOOPBACK_GUARDS_PASSED
