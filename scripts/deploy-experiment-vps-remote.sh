#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
trap 'printf "DEPLOY_FAILED mode=%s line=%s\n" "$mode" "$LINENO" >&2' ERR
release_id="${2:-}"
[[ "$release_id" =~ ^v[0-9A-Za-z._-]+-[0-9a-f]{10}-[0-9]{8}T[0-9]{6}Z$ ]]

parent=/var/www
live=$parent/experiment
shared_parent=$parent/experiment-shared
shared_assets=$shared_parent/assets
upload=$parent/.experiment-upload-$release_id
stage=$parent/experiment-stage-$release_id
assets_stage=$shared_parent/assets-stage-$release_id
backup=$parent/experiment-backup-before-$release_id
assets_backup=$shared_parent/assets-rollback-$release_id
migration_old=$shared_parent/assets-migration-$release_id
failed=$parent/experiment-failed-$release_id
assets_failed=$shared_parent/assets-failed-$release_id

assert_release_paths() {
  [[ "$upload" == /var/www/.experiment-upload-* ]]
  [[ "$stage" == /var/www/experiment-stage-* ]]
  [[ "$assets_stage" == /var/www/experiment-shared/assets-stage-* ]]
}

list_files() {
  local root=$1 follow_links=$2
  if [[ "$follow_links" == yes ]]; then
    find -L "$root" -type f -printf '%P\n'
  else
    find "$root" -type f -printf '%P\n'
  fi
}

sum_bytes() {
  local root=$1 follow_links=$2
  if [[ "$follow_links" == yes ]]; then
    find -L "$root" -type f -printf '%s\n'
  else
    find "$root" -type f -printf '%s\n'
  fi | awk '{ total += $1 } END { print total + 0 }'
}

verify_tree() {
  local root=$1 manifest=$2 paths=$3 expected_count=$4 expected_bytes=$5 follow_links=${6:-yes} actual_paths
  actual_paths=$upload/actual.$RANDOM.paths
  list_files "$root" "$follow_links" | LC_ALL=C sort > "$actual_paths"
  cmp -s "$paths" "$actual_paths"
  [[ $(wc -l < "$actual_paths") -eq "$expected_count" ]]
  [[ $(sum_bytes "$root" "$follow_links") -eq "$expected_bytes" ]]
  (cd "$root" && sha256sum -c --quiet "$manifest")
  rm -f -- "$actual_paths"
}

remove_extra_files() {
  local root=$1 expected=$2 actual=$upload/remove-extra.$RANDOM.paths
  find "$root" -type f -printf '%P\n' | LC_ALL=C sort > "$actual"
  comm -23 "$actual" "$expected" | while IFS= read -r path; do
    [[ -n "$path" && "$path" != /* && "$path" != ../* && "$path" != */../* ]]
    rm -f -- "$root/$path"
  done
  rm -f -- "$actual"
}

unlink_changed() {
  local root=$1 changed=$2
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    [[ "$path" != /* && "$path" != ../* && "$path" != */../* ]]
    rm -f -- "$root/$path"
  done < "$changed"
}

case "$mode" in
  stage)
    assert_release_paths
    frontend_count=$3; frontend_bytes=$4; assets_count=$5; assets_bytes=$6
    [[ "$frontend_count" =~ ^[0-9]+$ && "$frontend_bytes" =~ ^[0-9]+$ ]]
    [[ "$assets_count" =~ ^[0-9]+$ && "$assets_bytes" =~ ^[0-9]+$ ]]
    [[ -d "$live" && -d "$upload" && ! -e "$stage" && ! -e "$assets_stage" ]]
    mkdir -p -- "$shared_parent"
    if [[ ! -e "$shared_assets" ]]; then
      [[ -d "$live/assets" ]]
      mkdir -- "$shared_assets"
      cp -al "$live/assets/." "$shared_assets/"
      touch "$upload/assets-created"
    fi
    [[ -d "$shared_assets" && ! -L "$shared_assets" ]]
    mkdir -- "$assets_stage"
    cp -al "$shared_assets/." "$assets_stage/"
    LC_ALL=C sort -o "$upload/assets.paths" "$upload/assets.paths"
    unlink_changed "$assets_stage" "$upload/assets.changed"
    tar -xf "$upload/assets.tar" -C "$assets_stage"
    remove_extra_files "$assets_stage" "$upload/assets.paths"
    verify_tree "$assets_stage" "$upload/assets.sha256" "$upload/assets.paths" "$assets_count" "$assets_bytes"

    mkdir -- "$stage"
    cp -al "$live/." "$stage/"
    rm -rf -- "$stage/assets"
    ln -s "$shared_assets" "$stage/assets"
    LC_ALL=C sort -o "$upload/frontend.paths" "$upload/frontend.paths"
    unlink_changed "$stage" "$upload/frontend.changed"
    tar -xf "$upload/frontend.tar" -C "$stage"
    remove_extra_files "$stage" "$upload/frontend.paths"
    verify_tree "$stage" "$upload/frontend.sha256" "$upload/frontend.paths" "$frontend_count" "$frontend_bytes" no
    echo STAGE_VERIFIED
    ;;
  activate)
    assert_release_paths
    all_count=$3; all_bytes=$4
    [[ "$all_count" =~ ^[0-9]+$ && "$all_bytes" =~ ^[0-9]+$ ]]
    [[ -d "$live" && -d "$stage" && -d "$shared_assets" && -d "$assets_stage" ]]
    [[ ! -e "$backup" && ! -e "$assets_backup" && ! -e "$migration_old" ]]
    LC_ALL=C sort -o "$upload/all.paths" "$upload/all.paths"
    if [[ -d "$live/assets" && ! -L "$live/assets" ]]; then
      mv "$live/assets" "$migration_old"
      ln -s "$shared_assets" "$live/assets"
    fi
    [[ -L "$live/assets" ]]
    mv "$shared_assets" "$assets_backup"
    if ! mv "$assets_stage" "$shared_assets"; then
      mv "$assets_backup" "$shared_assets"
      exit 51
    fi
    if ! verify_tree "$stage" "$upload/all.sha256" "$upload/all.paths" "$all_count" "$all_bytes"; then
      mv "$shared_assets" "$assets_failed"
      mv "$assets_backup" "$shared_assets"
      exit 52
    fi
    mv "$live" "$backup"
    if ! mv "$stage" "$live"; then
      mv "$backup" "$live"
      mv "$shared_assets" "$assets_failed"
      mv "$assets_backup" "$shared_assets"
      exit 53
    fi
    echo ACTIVATED
    ;;
  rollback)
    [[ -d "$live" && -d "$backup" && -d "$shared_assets" && -d "$assets_backup" ]]
    [[ ! -e "$failed" && ! -e "$assets_failed" ]]
    mv "$live" "$failed"
    mv "$backup" "$live"
    mv "$shared_assets" "$assets_failed"
    mv "$assets_backup" "$shared_assets"
    echo ROLLED_BACK
    ;;
  abort)
    assert_release_paths
    if [[ -e "$migration_old" && -L "$live/assets" ]]; then
      rm -- "$live/assets"
      mv "$migration_old" "$live/assets"
    fi
    rm -rf -- "$stage" "$assets_stage" "$assets_failed"
    if [[ -e "$upload/assets-created" && -d "$shared_assets" && ! -L "$live/assets" ]]; then
      rm -rf -- "$shared_assets"
    fi
    rm -rf -- "$upload"
    echo ABORTED
    ;;
  cleanup-rollback)
    assert_release_paths
    rm -rf -- "$assets_failed" "$migration_old" "$upload"
    echo ROLLBACK_CLEANED
    ;;
  cleanup)
    assert_release_paths
    [[ -d "$live" && -L "$live/assets" ]]
    rm -rf -- "$assets_backup" "$migration_old" "$upload"
    echo CLEANED
    ;;
  *) exit 64 ;;
esac
