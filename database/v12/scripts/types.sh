#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
mkdir -p "$(dirname "$V12_GENERATED_TYPES")"
temporary_types="$(mktemp "${TMPDIR:-/tmp}/rotary-v12-types.XXXXXX")"
trap 'rm -f "$temporary_types"' EXIT
supabase gen types typescript \
  --local \
  --workdir "$V12_ROOT" \
  --schema public > "$temporary_types"
mv "$temporary_types" "$V12_GENERATED_TYPES"
trap - EXIT
printf 'Generated %s\n' "${V12_GENERATED_TYPES#$REPOSITORY_ROOT/}"
