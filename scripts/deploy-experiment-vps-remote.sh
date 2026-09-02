#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
release_id="${2:-}"
[[ "$release_id" =~ ^v[0-9A-Za-z._-]+-[0-9a-f]{10}-[0-9]{8}T[0-9]{6}Z$ ]]

parent=/var/www
live=$parent/experiment
shared_parent=$parent/experiment-shared
catalog=$shared_parent/manufacturer-catalog
upload=$parent/.experiment-upload-$release_id
stage=$parent/experiment-stage-$release_id
catalog_stage=$shared_parent/manufacturer-catalog-stage-$release_id
backup=$parent/experiment-backup-before-$release_id
catalog_backup=$shared_parent/manufacturer-catalog-rollback-$release_id
migration_old=$shared_parent/manufacturer-catalog-migration-$release_id
failed=$parent/experiment-failed-$release_id
catalog_failed=$shared_parent/manufacturer-catalog-failed-$release_id

assert_release_paths() {
  [[ "$upload" == /var/www/.experiment-upload-* ]]
  [[ "$stage" == /var/www/experiment-stage-* ]]
  [[ "$catalog_stage" == /var/www/experiment-shared/manufacturer-catalog-stage-* ]]
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
    frontend_count=$3; frontend_bytes=$4; catalog_count=$5; catalog_bytes=$6
    [[ "$frontend_count" =~ ^[0-9]+$ && "$frontend_bytes" =~ ^[0-9]+$ ]]
    [[ "$catalog_count" =~ ^[0-9]+$ && "$catalog_bytes" =~ ^[0-9]+$ ]]
    [[ -d "$live" && -d "$upload" && ! -e "$stage" && ! -e "$catalog_stage" ]]
    mkdir -p -- "$shared_parent"
    if [[ ! -e "$catalog" ]]; then
      [[ -d "$live/assets/manufacturer-catalog" ]]
      mkdir -- "$catalog"
      cp -al "$live/assets/manufacturer-catalog/." "$catalog/"
      touch "$upload/catalog-created"
    fi
    [[ -d "$catalog" && ! -L "$catalog" ]]
    mkdir -- "$catalog_stage"
    cp -al "$catalog/." "$catalog_stage/"
    LC_ALL=C sort -o "$upload/catalog.paths" "$upload/catalog.paths"
    unlink_changed "$catalog_stage" "$upload/catalog.changed"
    tar -xf "$upload/catalog.tar" -C "$catalog_stage"
    remove_extra_files "$catalog_stage" "$upload/catalog.paths"
    verify_tree "$catalog_stage" "$upload/catalog.sha256" "$upload/catalog.paths" "$catalog_count" "$catalog_bytes"

    mkdir -- "$stage"
    cp -al "$live/." "$stage/"
    rm -rf -- "$stage/assets/manufacturer-catalog"
    ln -s "$catalog" "$stage/assets/manufacturer-catalog"
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
    [[ -d "$live" && -d "$stage" && -d "$catalog" && -d "$catalog_stage" ]]
    [[ ! -e "$backup" && ! -e "$catalog_backup" && ! -e "$migration_old" ]]
    LC_ALL=C sort -o "$upload/all.paths" "$upload/all.paths"
    if [[ -d "$live/assets/manufacturer-catalog" && ! -L "$live/assets/manufacturer-catalog" ]]; then
      mv "$live/assets/manufacturer-catalog" "$migration_old"
      ln -s "$catalog" "$live/assets/manufacturer-catalog"
    fi
    [[ -L "$live/assets/manufacturer-catalog" ]]
    mv "$catalog" "$catalog_backup"
    if ! mv "$catalog_stage" "$catalog"; then
      mv "$catalog_backup" "$catalog"
      exit 51
    fi
    if ! verify_tree "$stage" "$upload/all.sha256" "$upload/all.paths" "$all_count" "$all_bytes"; then
      mv "$catalog" "$catalog_failed"
      mv "$catalog_backup" "$catalog"
      exit 52
    fi
    mv "$live" "$backup"
    if ! mv "$stage" "$live"; then
      mv "$backup" "$live"
      mv "$catalog" "$catalog_failed"
      mv "$catalog_backup" "$catalog"
      exit 53
    fi
    echo ACTIVATED
    ;;
  rollback)
    [[ -d "$live" && -d "$backup" && -d "$catalog" && -d "$catalog_backup" ]]
    [[ ! -e "$failed" && ! -e "$catalog_failed" ]]
    mv "$live" "$failed"
    mv "$backup" "$live"
    mv "$catalog" "$catalog_failed"
    mv "$catalog_backup" "$catalog"
    echo ROLLED_BACK
    ;;
  abort)
    assert_release_paths
    if [[ -e "$migration_old" && -L "$live/assets/manufacturer-catalog" ]]; then
      rm -- "$live/assets/manufacturer-catalog"
      mv "$migration_old" "$live/assets/manufacturer-catalog"
    fi
    rm -rf -- "$stage" "$catalog_stage" "$catalog_failed"
    if [[ -e "$upload/catalog-created" && -d "$catalog" && ! -L "$live/assets/manufacturer-catalog" ]]; then
      rm -rf -- "$catalog"
    fi
    rm -rf -- "$upload"
    echo ABORTED
    ;;
  cleanup-rollback)
    assert_release_paths
    rm -rf -- "$catalog_failed" "$migration_old" "$upload"
    echo ROLLBACK_CLEANED
    ;;
  cleanup)
    assert_release_paths
    [[ -d "$live" && -L "$live/assets/manufacturer-catalog" ]]
    rm -rf -- "$catalog_backup" "$migration_old" "$upload"
    echo CLEANED
    ;;
  *) exit 64 ;;
esac
