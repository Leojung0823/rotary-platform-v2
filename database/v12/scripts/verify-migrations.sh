#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_config

canonical_root="$V12_ROOT/supabase/migrations"
manifest="$V12_ROOT/schema/manifest.txt"
legacy_checksums="$V12_ROOT/verification/legacy_migration_checksums.sha256"
[[ -d "$canonical_root" ]] || v12_fail "canonical migration root is missing"
[[ -f "$manifest" ]] || v12_fail "canonical schema manifest is missing"

actual_manifest="$(mktemp "${TMPDIR:-/tmp}/rotary-v12-migrations.XXXXXX")"
trap 'rm -f "$actual_manifest"' EXIT

migration_count=0
previous_version=-1
while IFS= read -r migration; do
  filename="${migration##*/}"
  if [[ ! "$filename" =~ ^([0-9]{4})_v12_[a-z0-9_]+\.sql$ ]]; then
    v12_fail "invalid migration filename: $filename"
  fi
  version=$((10#${BASH_REMATCH[1]}))
  if ((version <= previous_version)); then
    v12_fail "migration versions must be strictly increasing"
  fi
  previous_version=$version
  migration_count=$((migration_count + 1))

  rg -q '^BEGIN;$' "$migration" || v12_fail "$filename is missing BEGIN envelope"
  rg -q "^SET TIME ZONE 'UTC';$" "$migration" || v12_fail "$filename is missing UTC envelope"
  [[ "$(tail -n 1 "$migration")" == "COMMIT;" ]] || v12_fail "$filename is missing final COMMIT"
  if find "$V12_ROOT" -type f -name "$filename" ! -path "$migration" -print -quit | rg -q '.'; then
    v12_fail "duplicate canonical migration SQL source found: $filename"
  fi
  printf 'supabase/migrations/%s\n' "$filename" >> "$actual_manifest"
done < <(find "$canonical_root" -maxdepth 1 -type f -name '*.sql' -print | sort)

((migration_count > 0)) || v12_fail "no canonical V1.2 migrations found"
diff -u "$manifest" "$actual_manifest" || v12_fail "schema manifest does not match migration order"

if find "$V12_ROOT/migrations" -type f -name '*.sql' -print -quit 2>/dev/null | rg -q '.'; then
  v12_fail "database/v12/migrations is obsolete; SQL must exist only in the workdir migration root"
fi
(
  cd "$REPOSITORY_ROOT"
  shasum -a 256 -c "$legacy_checksums"
)
printf 'V1.2 migration naming, ordering, manifest, envelope, uniqueness, and Legacy checksums passed.\n'
