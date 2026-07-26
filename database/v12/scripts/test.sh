#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack

cleanup_test_schema() {
  v12_psql_command 'DROP SCHEMA IF EXISTS v12_test CASCADE;' >/dev/null 2>&1 || true
}
trap cleanup_test_schema EXIT

v12_psql_file "$V12_ROOT/tests/bootstrap.sql" >/dev/null
v12_psql_file "$V12_ROOT/shared/test_assertions.sql" >/dev/null
v12_psql_file "$V12_ROOT/shared/test_fixtures.sql" >/dev/null
supabase db test --local --workdir "$V12_ROOT" "$V12_ROOT"/tests/*.test.sql
