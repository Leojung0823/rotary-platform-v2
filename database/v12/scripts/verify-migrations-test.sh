#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"

test_root="$(mktemp -d "${TMPDIR:-/tmp}/rotary-v12-migration-test.XXXXXX")"
fixture_root="$test_root/repository"
trap 'rm -rf "$test_root"' EXIT

mkdir -p "$fixture_root/database" "$fixture_root/supabase"
cp -R "$V12_ROOT" "$fixture_root/database/v12"
cp "$REPOSITORY_ROOT/supabase/config.toml" "$fixture_root/supabase/config.toml"
cp -R "$REPOSITORY_ROOT/supabase/migrations" "$fixture_root/supabase/migrations"

command -v rg >/dev/null 2>&1 || v12_fail "ripgrep is required for V1.2 migration verification"
run_fixture_verify() {
  bash "$fixture_root/database/v12/scripts/verify-migrations.sh"
}

run_fixture_verify

legacy_migration="$fixture_root/supabase/migrations/20260722000100_core_identity_and_club_access.sql"
printf '\n-- deliberately modified by verifier regression test\n' >> "$legacy_migration"
if run_fixture_verify; then
  v12_fail "modified copied Legacy migration unexpectedly passed checksum verification"
fi
cp "$REPOSITORY_ROOT/supabase/migrations/20260722000100_core_identity_and_club_access.sql" "$legacy_migration"

printf 'supabase/migrations/9999_v12_not_real.sql\n' >> "$fixture_root/database/v12/schema/manifest.txt"
if run_fixture_verify; then
  v12_fail "manifest mismatch unexpectedly passed verification"
fi

printf 'V1.2 migration verifier regression checks passed.\n'
