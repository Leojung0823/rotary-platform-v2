#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
  comparison_ref="origin/$GITHUB_BASE_REF"
  if ! git show-ref --verify --quiet "refs/remotes/$comparison_ref"; then
    git fetch origin "$GITHUB_BASE_REF" --quiet
  fi
else
  comparison_ref=""
  for candidate in \
    origin/feat/supabase-core-baseline \
    origin/main \
    origin/feat/supabase-issue-3
  do
    if git rev-parse --verify --quiet "$candidate^{commit}" >/dev/null; then
      comparison_ref="$candidate"
      break
    fi
  done
  if [[ -z "$comparison_ref" ]]; then
    echo "Migration history guard could not resolve a verified comparison ref." >&2
    exit 1
  fi
fi

if ! git merge-base --is-ancestor "$comparison_ref" HEAD; then
  echo "Migration history comparison ref is not an ancestor of HEAD: $comparison_ref" >&2
  exit 1
fi

violations="$(git diff --name-status "$comparison_ref"...HEAD -- supabase/migrations | awk '$1 != "A" { print }')"
if [[ -n "$violations" ]]; then
  echo "Historical migrations must not be modified, renamed, or deleted:"
  echo "$violations"
  exit 1
fi
echo "Migration history guard passed; feature migrations are forward-only."
