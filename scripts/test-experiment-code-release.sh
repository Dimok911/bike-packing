#!/usr/bin/env bash
set -euo pipefail
fixture=$(mktemp -d /tmp/bike-code-release-test-XXXXXXXX)
case "$fixture" in /tmp/bike-code-release-test-*) ;; *) exit 1 ;; esac
trap 'rm -rf -- "$fixture"' EXIT
release=v1607-0123456789-20260911T000000Z
parent=$fixture/var/www
live=$parent/experiment
assets=$parent/experiment-shared/assets
upload=$parent/.experiment-upload-$release
mkdir -p "$live" "$assets" "$upload" "$fixture/new"
printf 'unchanged-photo' > "$assets/photo.jpg"
printf 'old-app' > "$live/app.js"
printf 'new-app' > "$fixture/new/app.js"
ln -s "$assets" "$live/assets"
before=$(stat -c '%i' "$assets/photo.jpg")
sed "s|/var/www|$parent|g" scripts/deploy-experiment-vps-remote.sh > "$fixture/deploy.sh"
printf 'app.js\n' > "$upload/frontend.paths"
cp "$upload/frontend.paths" "$upload/frontend.changed"
: > "$upload/assets.changed"
(cd "$fixture/new" && sha256sum app.js) > "$upload/frontend.sha256"
tar -cf "$upload/frontend.tar" -C "$fixture/new" app.js
bash "$fixture/deploy.sh" code-stage "$release" 1 7
[[ $(cat "$live/app.js") == old-app ]]
[[ $(stat -c '%i' "$assets/photo.jpg") == "$before" ]]
bash "$fixture/deploy.sh" code-activate "$release" 1 7
[[ $(cat "$live/app.js") == new-app ]]
[[ $(readlink "$live/assets") == "$assets" ]]
bash "$fixture/deploy.sh" code-rollback "$release"
[[ $(cat "$live/app.js") == old-app ]]
[[ $(cat "$assets/photo.jpg") == unchanged-photo ]]
[[ $(stat -c '%i' "$assets/photo.jpg") == "$before" ]]
printf 'Code stage, activation and rollback preserve photograph bytes and inode.\n'
