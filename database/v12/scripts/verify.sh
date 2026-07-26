#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
"$V12_ROOT/scripts/verify-migrations.sh"
"$V12_ROOT/scripts/reset.sh"
"$V12_ROOT/scripts/seed-verify.sh"
"$V12_ROOT/scripts/test.sh"
"$V12_ROOT/scripts/invitation-create-concurrency-test.sh"
"$V12_ROOT/scripts/invitation-rpc-boundary-test.sh"
"$V12_ROOT/scripts/invitation-constraint-test.sh"
"$V12_ROOT/scripts/decision-contract-test.sh"
"$V12_ROOT/scripts/invitation-edge-recovery-test.sh"

(
  cd "$REPOSITORY_ROOT"
  npm run db:v12:invitation:edge:test
)

for verification in "$V12_ROOT"/verification/*.sql; do
  printf 'Running %s\n' "${verification#$REPOSITORY_ROOT/}"
  v12_psql_file "$verification"
done

"$V12_ROOT/scripts/lint.sh"
"$V12_ROOT/scripts/types-check.sh"
"$V12_ROOT/scripts/security-scan.sh"
printf 'V1.2 database and Invitation Core verification passed.\n'
