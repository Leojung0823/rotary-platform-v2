#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack

container="$(v12_container)"
validate_call="SELECT * FROM public.validate_membership_invitation(
  '99000000-0000-4000-8000-000000000001'::uuid,
  decode(repeat('00', 32), 'hex'), 1::smallint, 1::smallint,
  clock_timestamp() - interval '1 second',
  clock_timestamp() + interval '1 day',
  'rpc-boundary-test', decode(repeat('01', 32), 'hex'),
  '99000000-0000-4000-8000-000000000099'::uuid,
  '99000000-0000-4000-8000-000000000098'::uuid
);"
private_call="SELECT * FROM v12_invitation.validate_token_snapshot(
  '99000000-0000-4000-8000-000000000001'::uuid,
  decode(repeat('00', 32), 'hex'), 1::smallint, 1::smallint,
  clock_timestamp() - interval '1 second',
  clock_timestamp() + interval '1 day'
);"

expect_denied() {
  local role="$1"
  local sql="$2"
  local label="$3"
  if docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; $sql" >/dev/null 2>&1; then
    v12_fail "$label unexpectedly succeeded"
  fi
}

expect_denied anon "$validate_call" "anon direct Public Validate RPC"
expect_denied authenticated "$validate_call" \
  "authenticated direct Public Validate RPC with a forged actor UUID"
expect_denied authenticated "$private_call" \
  "authenticated direct private validation helper"
expect_denied service_role "$private_call" \
  "service_role direct private validation helper"

public_acl="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc AS function_record
    CROSS JOIN LATERAL aclexplode(
      coalesce(function_record.proacl, acldefault('f', function_record.proowner))
    ) AS privilege
    WHERE function_record.oid IN (
      'public.validate_membership_invitation(uuid,bytea,smallint,smallint,timestamptz,timestamptz,text,bytea,uuid,uuid)'::regprocedure,
      'v12_invitation.validate_token_snapshot(uuid,bytea,smallint,smallint,timestamptz,timestamptz)'::regprocedure
    )
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  );")"
[[ "$public_acl" == "f" ]] || v12_fail "PUBLIC retains an Invitation function Execute grant"

before_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  SELECT count(*)::text || ':'
    || count(*) FILTER (WHERE invitation_status = 'accepted')::text || ':'
    || count(*) FILTER (WHERE invitation_consumed_at IS NOT NULL)::text
  FROM public.invitations;")"

service_result="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET ROLE service_role; $validate_call" | tail -n 1)"
[[ "$service_result" == *"INVITATION_NOT_FOUND"* ]] ||
  v12_fail "trusted service role did not reach the safe Public Validate contract"

after_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  SELECT count(*)::text || ':'
    || count(*) FILTER (WHERE invitation_status = 'accepted')::text || ':'
    || count(*) FILTER (WHERE invitation_consumed_at IS NOT NULL)::text
  FROM public.invitations;")"
[[ "$after_state" == "$before_state" ]] ||
  v12_fail "direct Public Validate RPC changed Invitation/accepted/consumed state"

printf 'Invitation RPC role boundary and direct-call non-mutation verification passed.\n'
