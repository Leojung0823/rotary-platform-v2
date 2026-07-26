#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
for seed in "$V12_ROOT"/seed/*.sql; do
  printf 'Applying %s\n' "${seed#$REPOSITORY_ROOT/}"
  v12_psql_file "$seed"
done
