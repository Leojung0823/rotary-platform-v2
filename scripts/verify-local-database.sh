#!/usr/bin/env bash
set -euo pipefail

config_file="supabase/config.toml"
project_id="$(sed -nE 's/^project_id = "([^"]+)"$/\1/p' "$config_file" | head -n 1)"
db_port="$(awk '
  /^\[db\]$/ { in_db = 1; next }
  /^\[/ { in_db = 0 }
  in_db && $1 == "port" && $2 == "=" { print $3; exit }
' "$config_file")"
if [[ -z "$project_id" || -z "$db_port" ]]; then
  echo "Could not read Supabase project_id or db.port from $config_file."
  exit 1
fi

database_url="postgresql://postgres:postgres@127.0.0.1:${db_port}/postgres"
if command -v supabase >/dev/null 2>&1; then
  supabase db reset --local
  supabase db lint --local
else
  npx supabase db reset --local
  npx supabase db lint --local
fi

run_sql() {
  local file="$1"
  if command -v psql >/dev/null 2>&1; then
    psql "$database_url" -v ON_ERROR_STOP=1 -f "$file"
  else
    local db_container
    db_container="$(docker ps --format '{{.Names}}' | grep -F -x "supabase_db_${project_id}" || true)"
    if [[ -z "$db_container" ]]; then
      echo "Local psql is unavailable and the Supabase database container was not found."
      exit 1
    fi
    docker exec -i "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$file"
  fi
}

while IFS= read -r file || [[ -n "$file" ]]; do
  [[ -z "$file" || "$file" == \#* ]] && continue
  [[ -f "$file" ]] || { echo "Database verification file not found: $file"; exit 1; }
  echo "Verifying $file"
  run_sql "$file"
done < scripts/database-verification-files.txt
