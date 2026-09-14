#!/usr/bin/env bash
set -euo pipefail

base_ref="${GITHUB_BASE_REF:-feat/supabase-core-baseline}"
git fetch origin "$base_ref" --quiet

# A migration that has reached a deployed database is immutable.  The one
# narrow exception below is for a migration that was merged with a colliding
# timestamp but was rejected before it could be applied to staging.  Keep
# every approved repair explicit and path-for-path; do not turn this into a
# general rename allowance.
repair_allowlist="scripts/migration-history-repair-allowlist.txt"
is_allowed_repair() {
  local old_path="$1"
  local new_path="$2"
  [[ -f "$repair_allowlist" ]] || return 1
  grep -Fqx "$old_path -> $new_path" "$repair_allowlist"
}

violations=()
while IFS=$'\t' read -r status old_path new_path; do
  [[ -z "$status" ]] && continue
  case "$status" in
    A)
      ;;
    R*)
      if ! is_allowed_repair "$old_path" "$new_path"; then
        violations+=("$status\t$old_path\t$new_path")
      fi
      ;;
    *)
      violations+=("$status\t$old_path")
      ;;
  esac
done < <(git diff --name-status --find-renames "origin/$base_ref"...HEAD -- supabase/migrations)

if (( ${#violations[@]} > 0 )); then
  echo "Historical migrations must not be modified, renamed, or deleted:"
  printf '%b\n' "${violations[@]}"
  exit 1
fi
echo "Migration history guard passed; feature migrations are forward-only."
