#!/usr/bin/env bash
set -euo pipefail

base_ref="${GITHUB_BASE_REF:-feat/supabase-core-baseline}"
git fetch origin "$base_ref" --quiet
violations="$(git diff --name-status "origin/$base_ref"...HEAD -- supabase/migrations | awk '$1 != "A" { print }')"
if [[ -n "$violations" ]]; then
  echo "Historical migrations must not be modified, renamed, or deleted:"
  echo "$violations"
  exit 1
fi
echo "Migration history guard passed; feature migrations are forward-only."
