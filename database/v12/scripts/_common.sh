#!/usr/bin/env bash
set -Eeuo pipefail

V12_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY_ROOT="$(cd "$V12_ROOT/../.." && pwd)"
V12_CONFIG="$V12_ROOT/supabase/config.toml"
V12_PROJECT_ID="rotary-platform-v12"
V12_DB_PORT="55322"
V12_GENERATED_TYPES="$V12_ROOT/generated/database.types.ts"
export SUPABASE_TELEMETRY_DISABLED=true

DOCKER_DESKTOP_BIN="/Applications/Docker.app/Contents/Resources/bin"
if [[ -d "$DOCKER_DESKTOP_BIN" ]]; then
  export PATH="$DOCKER_DESKTOP_BIN:$PATH"
fi

v12_fail() {
  printf 'V1.2 database guard: %s\n' "$1" >&2
  return 1
}

v12_require_no_args() {
  if [[ "$#" -ne 0 ]]; then
    v12_fail "this wrapper accepts no target, URL, project, or passthrough arguments"
  fi
}

v12_config_value() {
  local section="$1"
  local key="$2"
  awk -v section="[$section]" -v key="$key" '
    /^\[/ { active = ($0 == section) }
    active && $1 == key && $2 == "=" {
      value = $3
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' "$V12_CONFIG"
}

v12_assert_config() {
  [[ -f "$V12_CONFIG" ]] || v12_fail "missing $V12_CONFIG"

  local project_id
  project_id="$(sed -n 's/^project_id = "\([^"]*\)"/\1/p' "$V12_CONFIG")"
  [[ "$project_id" == "$V12_PROJECT_ID" ]] ||
    v12_fail "unexpected project_id: ${project_id:-missing}"

  local section key expected actual
  while read -r section key expected; do
    actual="$(v12_config_value "$section" "$key")"
    [[ "$actual" == "$expected" ]] ||
      v12_fail "[$section].$key must be $expected, got ${actual:-missing}"
  done <<'PORTS'
api port 55321
db port 55322
db shadow_port 55320
studio port 55323
inbucket port 55324
inbucket smtp_port 55325
inbucket pop3_port 55326
edge_runtime inspector_port 8183
analytics port 55327
PORTS

  local function_name verify_jwt
  for function_name in \
    create-membership-invitation \
    resend-membership-invitation \
    validate-membership-invitation
  do
    verify_jwt="$(v12_config_value "functions.$function_name" "verify_jwt")"
    [[ "$verify_jwt" == "true" ]] ||
      v12_fail "[functions.$function_name].verify_jwt must be true"
  done

  local legacy_project_id
  legacy_project_id="$(sed -n 's/^project_id = "\([^"]*\)"/\1/p' "$REPOSITORY_ROOT/supabase/config.toml")"
  [[ "$legacy_project_id" != "$V12_PROJECT_ID" ]] ||
    v12_fail "V1.2 and Legacy project_id must differ"

  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    v12_fail "SUPABASE_ACCESS_TOKEN must be unset for local V1.2 commands"
  fi
  if [[ -f "$V12_ROOT/supabase/.temp/project-ref" ]]; then
    v12_fail "linked project state is forbidden in the V1.2 workdir"
  fi
}

v12_container() {
  local container="supabase_db_${V12_PROJECT_ID}"
  if ! docker ps --format '{{.Names}}' | rg -Fxq "$container"; then
    v12_fail "local container $container is not running; run npm run db:v12:start"
  fi
  printf '%s\n' "$container"
}

v12_assert_local_stack() {
  v12_assert_config
  local container
  container="$(v12_container)"
  local port_mapping
  port_mapping="$(docker ps --filter "name=^/${container}$" --format '{{.Ports}}')"
  [[ "$port_mapping" == *":${V12_DB_PORT}->5432/tcp"* ]] ||
    v12_fail "database container is not bound to fixed local port $V12_DB_PORT"
}

v12_psql_file() {
  local sql_file="$1"
  docker exec -i "$(v12_container)" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$sql_file"
}

v12_psql_command() {
  local sql="$1"
  docker exec "$(v12_container)" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql"
}
