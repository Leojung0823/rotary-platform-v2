#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack

test_file="$V12_ROOT/tests/013_invitation_constraints.test.sql"
if [[ "${V12_CONSTRAINT_TEST_NEGATIVE:-}" == "accepted-null-expectation" ]]; then
  injected_test="$(mktemp "${TMPDIR:-/tmp}/rotary-v12-constraint-injection.XXXXXX.test.sql")"
  trap 'rm -f "$injected_test"' EXIT
  cp "$test_file" "$injected_test"
  perl -0pi -e \
    "s/'23514', NULL, 'Database rejects accepted with accepted_at null'/'00000', NULL, 'Database rejects accepted with accepted_at null'/" \
    "$injected_test"
  supabase db test --local --workdir "$V12_ROOT" "$injected_test"
elif [[ -n "${V12_CONSTRAINT_TEST_NEGATIVE:-}" ]]; then
  v12_fail "unknown Invitation constraint failure-injection mode"
else
  supabase db test --local --workdir "$V12_ROOT" "$test_file"
fi
