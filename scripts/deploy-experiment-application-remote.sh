#!/usr/bin/env bash
set -euo pipefail
mode=${1:-}; release_id=${2:-}
trap 'printf "APPLICATION_DEPLOY_FAILED mode=%s line=%s\n" "$mode" "$LINENO" >&2' ERR
[[ "$release_id" =~ ^v[0-9A-Za-z._-]+-[0-9a-f]{10}-[0-9]{8}T[0-9]{6}Z$ ]]
parent=/var/www
live=$parent/experiment
assets=$parent/experiment-shared/assets
upload=$parent/.experiment-upload-$release_id
stage=$parent/experiment-stage-$release_id
backup=$parent/experiment-backup-before-$release_id
failed=$parent/experiment-failed-$release_id
exec 9>"$parent/.experiment-application-deploy.lock"
flock -x 9

# This entry point never creates, renames, copies, links or deletes the shared
# asset directory or any file inside it. Only a new release's symlink is created.
assert_assets() {
  [[ -d "$assets" && ! -L "$assets" && -L "$live/assets" ]] || return 1
  [[ $(readlink -f "$live/assets") == "$assets" ]] || return 1
  if [[ -f "$upload/assets.identity" ]]; then
    [[ $(stat -c '%d:%i' "$assets") == "$(cat "$upload/assets.identity")" ]] || return 1
  fi
  (cd "$assets" && sha256sum -c --quiet "$upload/assets.sha256")
}

verify_baseline() {
  assert_assets || return 1
  find -L "$live" -type f -printf '%P\n' | LC_ALL=C sort > "$upload/current.paths" || return 1
  cmp -s "$upload/baseline.paths" "$upload/current.paths" || return 1
  (cd "$live" && sha256sum -c --quiet "$upload/baseline.sha256")
}

verify_application() {
  local root=$1 count=$2 bytes=$3
  [[ -L "$root/assets" && $(readlink -f "$root/assets") == "$assets" ]] || return 1
  find "$root" -type f -printf '%P\n' | LC_ALL=C sort > "$upload/current.paths" || return 1
  cmp -s "$upload/frontend.paths" "$upload/current.paths" || return 1
  [[ $(wc -l < "$upload/current.paths") -eq "$count" ]] || return 1
  [[ $(find "$root" -type f -printf '%s\n' | awk '{n+=$1} END {print n+0}') -eq "$bytes" ]] || return 1
  (cd "$root" && sha256sum -c --quiet "$upload/frontend.sha256") || return 1
  assert_assets
}

read_counts() {
  read -r frontend_count frontend_bytes < "$upload/verified-counts"
  [[ "$frontend_count" =~ ^[0-9]+$ && "$frontend_bytes" =~ ^[0-9]+$ ]]
}

restore_baseline() {
  [[ -d "$backup" && -d "$live" && ! -e "$failed" ]]
  read_counts
  # Do not replace a different release deployed by another operator after us.
  verify_application "$live" "$frontend_count" "$frontend_bytes"
  mv -- "$live" "$failed"
  if ! mv -- "$backup" "$live"; then
    mv -- "$failed" "$live"
    return 1
  fi
  verify_baseline
}

case "$mode" in
  stage)
    frontend_count=$3; frontend_bytes=$4
    [[ "$frontend_count" =~ ^[0-9]+$ && "$frontend_bytes" =~ ^[0-9]+$ ]]
    [[ "$frontend_count" -gt 0 && "$frontend_count" -le 1000 && "$frontend_bytes" -le 104857600 ]]
    [[ -d "$live" && -d "$upload" && ! -e "$stage" && ! -e "$backup" && ! -e "$failed" ]]
    LC_ALL=C sort -o "$upload/frontend.paths" "$upload/frontend.paths"
    LC_ALL=C sort -o "$upload/baseline.paths" "$upload/baseline.paths"
    # No images, arbitrary paths, links or directories may enter the archive.
    while IFS= read -r file; do
      [[ "$file" =~ ^(index\.(html|php)|app\.js|styles\.css|sw\.js|manifest\.webmanifest|release-contract\.json|chunks/[A-Za-z0-9._-]+\.js)$ ]]
    done < "$upload/frontend.paths"
    tar -tf "$upload/frontend.tar" | LC_ALL=C sort > "$upload/archive.paths"
    cmp -s "$upload/frontend.paths" "$upload/archive.paths"
    tar -tvf "$upload/frontend.tar" | awk 'substr($0,1,1)!="-" {bad=1} END {exit bad}'
    verify_baseline
    stat -c '%d:%i' "$assets" > "$upload/assets.identity"
    printf '%s %s\n' "$frontend_count" "$frontend_bytes" > "$upload/verified-counts"
    mkdir -- "$stage"
    tar -xf "$upload/frontend.tar" -C "$stage" --no-same-owner --no-same-permissions
    ln -s "$assets" "$stage/assets"
    verify_application "$stage" "$frontend_count" "$frontend_bytes"
    echo APPLICATION_STAGE_VERIFIED
    ;;
  activate)
    [[ -d "$stage" && ! -e "$backup" && ! -e "$failed" ]]
    read_counts
    verify_baseline
    verify_application "$stage" "$frontend_count" "$frontend_bytes"
    mv -- "$live" "$backup"
    if ! mv -- "$stage" "$live"; then
      mv -- "$backup" "$live"
      exit 51
    fi
    if ! verify_application "$live" "$frontend_count" "$frontend_bytes"; then
      mv -- "$live" "$failed"
      mv -- "$backup" "$live"
      exit 52
    fi
    echo APPLICATION_ACTIVATED
    ;;
  rollback)
    restore_baseline
    echo APPLICATION_ROLLED_BACK
    ;;
  abort)
    # Includes activation whose SSH response was lost: restore the known old
    # application only when the live application is still our exact release.
    if [[ -d "$backup" ]]; then restore_baseline; fi
    [[ ! -L "$stage" && ! -L "$upload" ]]
    rm -rf -- "$stage" "$upload"
    echo APPLICATION_ABORTED
    ;;
  cleanup|cleanup-rollback)
    assert_assets
    [[ ! -L "$upload" ]]
    rm -rf -- "$upload"
    echo APPLICATION_CLEANED
    ;;
  *) exit 64 ;;
esac
