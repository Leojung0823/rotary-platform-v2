#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack

result_dir="$(mktemp -d "${TMPDIR:-/tmp}/rotary-v12-invitation-create.XXXXXX")"
first_result="$result_dir/first.txt"
second_result="$result_dir/second.txt"
container="$(v12_container)"

cleanup() {
  v12_psql_file "$V12_ROOT/tests/invitation_concurrency_cleanup.sql" >/dev/null 2>&1 || true
  rm -f "$first_result" "$second_result"
  rmdir "$result_dir" 2>/dev/null || true
}
trap cleanup EXIT

v12_psql_file "$V12_ROOT/tests/invitation_concurrency_cleanup.sql" >/dev/null
v12_psql_file "$V12_ROOT/tests/invitation_concurrency_setup.sql" >/dev/null

create_sql() {
  local invitation_id="$1"
  local token_hash_byte="$2"
  local nonce="$3"
  local request_id="$4"
  local marker="${5:-}"
  printf '%s' "BEGIN;
SELECT coalesce(invitation_error_code, 'SUCCESS') || ':' || invitation_id::text
  || ':' || invitation_is_replay::text
FROM public.create_membership_invitation(
  '$invitation_id', '83000000-0000-4000-8000-000000000003',
  decode(repeat('$token_hash_byte', 32), 'hex'), 1::smallint, 1::smallint,
  '$nonce', date_trunc('second', clock_timestamp()),
  date_trunc('second', clock_timestamp() + interval '1 day'),
  'manual_link', NULL, 'concurrent-create-same-key',
  decode(repeat('a1', 32), 'hex'),
  '85000000-0000-4000-8000-000000000002', '$request_id'
);
${marker:+SELECT '$marker'; SELECT pg_sleep(0.8);}
COMMIT;"
}

docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "$(create_sql \
    '84000000-0000-4000-8000-000000000002' \
    'a6' \
    'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ' \
    '85100000-0000-4000-8000-000000000009' \
    'create_create_lock')" > "$first_result" &
first_pid=$!

for _ in {1..100}; do
  active="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SELECT count(*) FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND query LIKE '%create_create_lock%'
          AND wait_event = 'PgSleep';")"
  [[ "$active" == "1" ]] && break
  sleep 0.05
done
[[ "${active:-0}" == "1" ]] || v12_fail "timed out waiting for concurrent Create lock"

docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "$(create_sql \
    '84000000-0000-4000-8000-000000000003' \
    'a7' \
    'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' \
    '85100000-0000-4000-8000-000000000010')" > "$second_result" &
second_pid=$!

wait "$first_pid"
wait "$second_pid"

actual="$(rg --no-filename '^SUCCESS:84000000-0000-4000-8000-000000000002:(true|false)$' \
  "$first_result" "$second_result" | sort)"
expected=$'SUCCESS:84000000-0000-4000-8000-000000000002:false\nSUCCESS:84000000-0000-4000-8000-000000000002:true'
[[ "$actual" == "$expected" ]] ||
  v12_fail "same-key concurrent Create did not return one authoritative Invitation"

state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SELECT count(*)::text || ':' || min(invitation_status) || ':'
        || bool_and(invitation_accepted_at IS NULL AND invitation_consumed_at IS NULL)::text
      FROM public.invitations
      WHERE invitation_membership_id = '83000000-0000-4000-8000-000000000003';")"
[[ "$state" == "1:pending:true" ]] ||
  v12_fail "same-key Create persisted an invalid or final-accepted state: $state"

printf 'Concurrent same-key Invitation Create verification passed without final acceptance behavior.\n'
