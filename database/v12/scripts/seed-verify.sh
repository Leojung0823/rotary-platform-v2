#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
"$V12_ROOT/scripts/seed.sh"
v12_psql_file "$V12_ROOT/verification/seed_verification.sql"
"$V12_ROOT/scripts/seed.sh"
v12_psql_file "$V12_ROOT/verification/seed_verification.sql"
printf 'V1.2 seed rerun and version verification passed.\n'
