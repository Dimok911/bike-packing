#!/usr/bin/env bash
set -Eeuo pipefail

# Exercise the candidate and its installed includes against a synthetic local
# upstream. No request from this fixture can reach Auth, the API, or a database.
candidate=${1:?candidate config required}
[[ -f "$candidate" && ! -L "$candidate" ]]
[[ -z $(ss -Hln 'sport = :18449 or sport = :18089 or sport = :18090') ]]
run=$(mktemp -d /root/bikepacking-eu-fixture-XXXXXXXX)
cleanup() {
  if [[ -f "$run/nginx.pid" ]]; then
    nginx -p "$run/" -c "$run/nginx.conf" -s quit
    for attempt in {1..40}; do [[ ! -e "$run/nginx.pid" ]] && break; sleep 0.1; done
    [[ ! -e "$run/nginx.pid" ]]
  fi
  echo "FIXTURE_EVIDENCE=$run"
}
trap cleanup EXIT

sed -e 's/listen 80;/listen 127.0.0.1:18090;/' \
    -e 's/listen 443 ssl;/listen 127.0.0.1:18449 ssl;/' \
    -e "s@access_log /var/log/nginx/vniipo-domain-access.log@access_log $run/proxy-access.log@" \
    -e 's@proxy_pass https://90\.156\.128\.115@proxy_pass http://127.0.0.1:18089@g' \
    "$candidate" > "$run/server.conf"
# Fail closed if a future candidate introduces any upstream we did not replace.
[[ $(grep -c 'listen 127.0.0.1:' "$run/server.conf") -eq 2 ]]
! grep -E '^[[:space:]]*listen ' "$run/server.conf" | grep -vq 'listen 127.0.0.1:'
grep -q 'proxy_pass http://127.0.0.1:18089' "$run/server.conf"
! grep -E '^[[:space:]]*proxy_pass ' "$run/server.conf" | grep -vq 'proxy_pass http://127.0.0.1:18089[;/]'

cat > "$run/upstream.conf" <<EOF
server {
  listen 127.0.0.1:18089;
  access_log $run/upstream-access.log vniipo_safe;
  default_type text/plain;
  add_header Set-Cookie "vniipo_fixture=fixture-session; Domain=.vniipo-help.ru; Path=/; HttpOnly; Secure; SameSite=Lax" always;
  add_header Access-Control-Allow-Origin \$http_origin always;
  add_header Access-Control-Allow-Credentials true always;
  add_header Access-Control-Allow-Methods "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS" always;
  add_header Access-Control-Allow-Headers content-type always;
  if (\$request_method = OPTIONS) { return 204; }
  location = /unexpected-sink { return 418; }
EOF
for code in 301 302 303 307 308; do
  printf '  location = /experiment/letters-vniipo/api/redirect/%s { return %s http://127.0.0.1:18089/unexpected-sink; }\n' "$code" "$code" >> "$run/upstream.conf"
done
cat >> "$run/upstream.conf" <<'EOF'
  location / { return 200 "$host|$http_origin|$http_cookie|$http_forwarded|$http_x_forwarded_host|$http_x_forwarded_proto|$http_x_real_ip|$http_x_forwarded_for|$request_method|$uri|$args"; }
}
EOF
cat > "$run/nginx.conf" <<EOF
pid $run/nginx.pid;
error_log $run/error.log;
events {}
http {
  include /etc/nginx/mime.types;
  include /etc/nginx/conf.d/00-vniipo-proxy-common.conf;
  include $run/upstream.conf;
  include $run/server.conf;
}
EOF
nginx -p "$run/" -c "$run/nginx.conf" -t
nginx -p "$run/" -c "$run/nginx.conf"
base=https://api-eu.vniipo-help.ru:18449
prefix=/experiment/letters-vniipo/api
origin=https://experiment.vniipo-help.ru
check() {
  local expected=$1 path=$2 label=$3 code
  shift 3
  code=$(curl --silent --show-error --max-time 10 --noproxy '*' \
    --resolve api-eu.vniipo-help.ru:18449:127.0.0.1 \
    --dump-header "$run/$label.headers" --output "$run/$label.body" \
    --write-out '%{http_code}' "$@" "$base$path")
  [[ "$code" == "$expected" ]] || { echo "FAIL $label expected=$expected actual=$code"; return 1; }
  echo "PASS $label $code"
}
header() { tr -d '\r' < "$run/$1.headers" | grep -Fxi -- "$2" > /dev/null; }
assert_no_upstream() {
  local before
  before=$(wc -l < "$run/upstream-access.log")
  check "$@"
  [[ $(wc -l < "$run/upstream-access.log") -eq "$before" ]]
}

cookie='vniipo_fixture=fixture-session; another_fixture=unchanged'
check 200 "$prefix/bike-packing/lists?fixture=1" cookie-forwarding \
  -H "Origin: $origin" -H "Cookie: $cookie" \
  -H 'Forwarded: for=attacker;host=attacker' -H 'X-Forwarded-Host: attacker' \
  -H 'X-Forwarded-Proto: http' -H 'X-Real-IP: 192.0.2.1' -H 'X-Forwarded-For: 192.0.2.1'
[[ $(cat "$run/cookie-forwarding.body") == "api.vniipo-help.ru|$origin|$cookie|||https|127.0.0.1|127.0.0.1|GET|$prefix/bike-packing/lists|fixture=1" ]]
header cookie-forwarding 'Set-Cookie: vniipo_fixture=fixture-session; Domain=.vniipo-help.ru; Path=/; HttpOnly; Secure; SameSite=Lax'
header cookie-forwarding "Access-Control-Allow-Origin: $origin"
header cookie-forwarding 'Access-Control-Allow-Credentials: true'

check 200 "$prefix/auth/me" canonical-auth-cookie -H "Origin: $origin" -H "Cookie: $cookie"
[[ $(cat "$run/canonical-auth-cookie.body") == "api.vniipo-help.ru|$origin|$cookie|||https|127.0.0.1|127.0.0.1|GET|$prefix/auth/me|" ]]
check 200 /auth/me existing-auth-cookie -H "Origin: $origin" -H "Cookie: $cookie"
[[ $(cat "$run/existing-auth-cookie.body") == "api.vniipo-help.ru|$origin|$cookie|||https|127.0.0.1|127.0.0.1|GET|/auth/me|" ]]
check 200 /letters-vniipo/api/bike-packing/capabilities legacy-anonymous -H "Origin: $origin" -H "Cookie: $cookie"
[[ $(cat "$run/legacy-anonymous.body") == "api.vniipo-help.ru|$origin||||https|127.0.0.1|127.0.0.1|GET|$prefix/bike-packing/capabilities|" ]]
! grep -qi '^Set-Cookie:' "$run/legacy-anonymous.headers"

check 200 "$prefix/bike-packing/capabilities" capability-headers -H "Origin: $origin"
header capability-headers 'X-Vniipo-Proxy-Target: bike-packing-experiment'
header capability-headers 'X-Vniipo-Proxy-Write-Gate: enabled'
header capability-headers "Access-Control-Allow-Origin: $origin"
header capability-headers 'Access-Control-Allow-Credentials: true'
header capability-headers 'Access-Control-Expose-Headers: X-Vniipo-Proxy-Target, X-Vniipo-Proxy-Write-Gate'
check 204 "$prefix/bike-packing/lists" valid-preflight -X OPTIONS -H "Origin: $origin" \
  -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'
header valid-preflight "Access-Control-Allow-Origin: $origin"
header valid-preflight 'Access-Control-Allow-Credentials: true'

assert_no_upstream 403 "$prefix/bike-packing/lists" foreign-origin -X POST -H 'Origin: https://foreign.example' --data '{}'
assert_no_upstream 403 "$prefix/bike-packing/lists" missing-origin -X POST --data '{}'
assert_no_upstream 403 "$prefix/bike-packing/lists" null-origin -X POST -H 'Origin: null' --data '{}'
assert_no_upstream 403 "$prefix/bike-packing/lists" unsafe-method -X OPTIONS -H "Origin: $origin" -H 'Access-Control-Request-Method: CONNECT'
assert_no_upstream 403 "$prefix/bike-packing/lists" unsafe-header -X OPTIONS -H "Origin: $origin" \
  -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization'
assert_no_upstream 403 "$prefix/auth/verify-magic-link" verify-get
assert_no_upstream 403 "$prefix/auth/verify-magic-link" verify-head -I
assert_no_upstream 404 "$prefix/auth/internal/session" internal
assert_no_upstream 404 /letters-vniipo/api/bike-packing/lists old-writer -X POST -H "Origin: $origin" --data '{}'

for method in GET POST; do
  for code in 301 302 303 307 308; do
    label="redirect-$method-$code"
    check 502 "$prefix/redirect/$code" "$label" -X "$method" -H "Origin: $origin"
    grep -q '"error":"upstream_redirect_rejected"' "$run/$label.body"
    ! grep -qi '^Location:' "$run/$label.headers"
  done
done
! grep -q '/unexpected-sink' "$run/upstream-access.log"
echo FRANKFURT_CANDIDATE_LOCAL_FIXTURE_PASSED
