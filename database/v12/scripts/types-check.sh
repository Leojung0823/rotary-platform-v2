#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
[[ -f "$V12_GENERATED_TYPES" ]] ||
  v12_fail "generated types are missing; run npm run db:v12:types"

temporary_types="$(mktemp "${TMPDIR:-/tmp}/rotary-v12-types-check.XXXXXX")"
trap 'rm -f "$temporary_types"' EXIT
supabase gen types typescript \
  --local \
  --workdir "$V12_ROOT" \
  --schema public > "$temporary_types"
if ! cmp -s "$temporary_types" "$V12_GENERATED_TYPES"; then
  diff -u "$V12_GENERATED_TYPES" "$temporary_types" || true
  v12_fail "generated database types have drifted"
fi
printf 'Generated database types match the V1.2 schema.\n'
