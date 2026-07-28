#!/usr/bin/env bash
set -euo pipefail

database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
npx supabase db reset --local
npx supabase db lint --local

run_sql() {
  local file="$1"
  if command -v psql >/dev/null 2>&1; then
    psql "$database_url" -v ON_ERROR_STOP=1 -f "$file"
  else
    local db_container
    db_container="$(docker ps --format '{{.Names}}' | grep '^supabase_db_rotary-platform-v2$' | head -n 1)"
    if [[ -z "$db_container" ]]; then
      echo "Local psql is unavailable and the Supabase database container was not found."
      exit 1
    fi
    docker exec -i "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$file"
  fi
}

run_sql supabase/verification/core_identity_baseline.sql
run_sql supabase/verification/provisioning_security.sql
run_sql supabase/verification/operator_expiry_consistency.sql
run_sql supabase/verification/invitation_selection.sql
run_sql supabase/verification/v03_identity_admin.sql
