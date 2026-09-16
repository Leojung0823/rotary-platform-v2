#!/usr/bin/env bash
set -euo pipefail

base_ref="${GITHUB_BASE_REF:-feat/supabase-core-baseline}"
git fetch origin "$base_ref" --quiet

# 1. No two migrations may claim the same version number.
#
# Supabase keys supabase_migrations.schema_migrations on the version alone, not
# the filename, so two files sharing a number are the same migration as far as
# the database is concerned: the first applies and the second dies on a
# duplicate primary key, taking the release with it and leaving the database
# half-migrated. That is exactly what happened on 2026-09-14, when two agents
# working the same day both reached for 20260914000400.
#
# This is checked over the whole directory rather than the diff, because the
# collision is a property of the tree, and the branch that completes the pair is
# usually not the branch that looks wrong.
#
# The directory is overridable for one reason: the test that proves this check
# fires has to put a colliding file somewhere. It used to put it in the real
# supabase/migrations and delete it again -- and vitest runs test files in
# parallel, so anything else enumerating that directory could list the fixture
# and then fail to open it. That surfaced as an intermittent ENOENT in whichever
# unrelated guard happened to be reading migrations at the time. Only this check
# is overridable; the history checks below are about this repository's git
# history and stay pointed at the real tree.
migrations_dir="${MIGRATION_COLLISION_DIR:-supabase/migrations}"
duplicates="$(
  find "$migrations_dir" -name '*.sql' -type f -print0 2>/dev/null \
    | xargs -0 -n1 basename 2>/dev/null \
    | sed -E 's/^([0-9]+)_.*/\1/' \
    | sort \
    | uniq -d
)"
if [[ -n "$duplicates" ]]; then
  echo "Two migrations cannot share a version number; Supabase keys on the number alone:"
  while IFS= read -r version; do
    [[ -z "$version" ]] && continue
    find "$migrations_dir" -name "${version}_*.sql" -type f | sed 's/^/  /'
  done <<< "$duplicates"
  echo "Renumber one of them to a version later than every migration already on main."
  exit 1
fi

# 2. A migration that is already on the base branch may not be modified or
# deleted -- with one exception, below.
violations=""
while IFS=$'\t' read -r status old new; do
  [[ -z "$status" ]] && continue
  [[ "$status" == "A" ]] && continue

  # The exception: renumbering a file purely to escape a collision. Permitted
  # only when the content is byte-identical (R100) and the version it is leaving
  # is still claimed by a different migration -- that is, the rename exists to
  # break a tie rather than to rewrite history. Anything else, including a
  # rename that also edits the file, is still refused.
  if [[ "$status" == "R100" && -n "${new:-}" ]]; then
    old_version="$(basename "$old" | sed -E 's/^([0-9]+)_.*/\1/')"
    still_claimed="$(find supabase/migrations -name "${old_version}_*.sql" -type f | head -1)"
    if [[ -n "$still_claimed" ]]; then
      echo "Allowing collision renumber: $old -> $new (version $old_version is still used by $(basename "$still_claimed"))"
      continue
    fi
  fi

  violations+="$status	$old	${new:-}"$'\n'
done < <(git diff --name-status "origin/$base_ref"...HEAD -- supabase/migrations)

if [[ -n "$violations" ]]; then
  echo "Historical migrations must not be modified, renamed, or deleted:"
  printf '%s' "$violations"
  exit 1
fi

echo "Migration history guard passed; feature migrations are forward-only."
