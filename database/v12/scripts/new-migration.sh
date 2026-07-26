#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

if [[ "$#" -ne 1 || ! "$1" =~ ^[a-z][a-z0-9_]*$ ]]; then
  printf 'Usage: npm run db:v12:migration:new -- <lowercase_snake_case_scope>\n' >&2
  exit 1
fi

v12_assert_config
migration_root="$V12_ROOT/supabase/migrations"
scope="$1"
highest=0
while IFS= read -r path; do
  filename="${path##*/}"
  version="${filename%%_*}"
  if [[ "$version" =~ ^[0-9]{4}$ ]] && ((10#$version > highest)); then
    highest=$((10#$version))
  fi
done < <(find "$migration_root" -maxdepth 1 -type f -name '*.sql' -print | sort)

next=$((highest + 1))
printf -v next_version '%04d' "$next"
target="$migration_root/${next_version}_v12_${scope}.sql"
if [[ -e "$target" ]]; then
  v12_fail "migration already exists: $target"
fi

cat > "$target" <<'SQL'
BEGIN;
SET TIME ZONE 'UTC';
SET search_path = public, extensions, pg_catalog;

COMMIT;
SQL
printf '%s\n' "supabase/migrations/${target##*/}" >> "$V12_ROOT/schema/manifest.txt"
printf 'Created %s and updated schema/manifest.txt\n' "${target#$REPOSITORY_ROOT/}"
