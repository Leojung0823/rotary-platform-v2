#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
[[ -f "$V12_GENERATED_TYPES" ]] ||
  v12_fail "generated types are missing; run npm run db:v12:types"

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/rotary-v12-types-check.XXXXXX")"
readonly temporary_root
trap 'rm -rf -- "$temporary_root"' EXIT

canonicalize_eof_newline() {
  local source="$1"
  local destination="$2"
  perl -0pe 's/\n*\z/\n/' "$source" > "$destination"
}

run_eof_newline_regression_fixtures() {
  local fixture_root="$V12_ROOT/scripts/fixtures/types-check"
  local canonical_fixture="$temporary_root/fixture-canonical.ts"
  local extra_newline_source="$temporary_root/fixture-extra-newline-source.ts"
  local extra_newline_fixture="$temporary_root/fixture-extra-newline-canonical.ts"
  local content_drift_fixture="$temporary_root/fixture-content-drift.ts"

  canonicalize_eof_newline "$fixture_root/checked-in-single-eof.ts" "$canonical_fixture"
  cp "$fixture_root/checked-in-single-eof.ts" "$extra_newline_source"
  printf '\n' >> "$extra_newline_source"
  canonicalize_eof_newline "$extra_newline_source" "$extra_newline_fixture"
  if ! cmp -s "$canonical_fixture" "$extra_newline_fixture"; then
    v12_fail "EOF newline regression fixture did not canonicalize trailing blank lines"
  fi

  canonicalize_eof_newline "$fixture_root/generated-content-drift.ts" "$content_drift_fixture"
  if cmp -s "$canonical_fixture" "$content_drift_fixture"; then
    v12_fail "EOF newline regression fixture did not reject a non-EOF content difference"
  fi
}

run_eof_newline_regression_fixtures

temporary_types="$temporary_root/generated.ts"
temporary_checked_in="$temporary_root/checked-in-canonical.ts"
temporary_generated="$temporary_root/generated-canonical.ts"
supabase gen types typescript \
  --local \
  --workdir "$V12_ROOT" \
  --schema public > "$temporary_types"
canonicalize_eof_newline "$V12_GENERATED_TYPES" "$temporary_checked_in"
canonicalize_eof_newline "$temporary_types" "$temporary_generated"
if [[ "${V12_TYPES_CHECK_NEGATIVE:-}" == "non-eof-content-drift" ]]; then
  perl -0pi -e 's/export type Json/export type JsonDrift/' "$temporary_generated"
elif [[ -n "${V12_TYPES_CHECK_NEGATIVE:-}" ]]; then
  v12_fail "unknown generated-types failure-injection mode"
fi
if ! cmp -s "$temporary_checked_in" "$temporary_generated"; then
  diff -u "$temporary_checked_in" "$temporary_generated" || true
  v12_fail "generated database types have drifted"
fi
printf 'Generated database types match the V1.2 schema.\n'
