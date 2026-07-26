#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
command -v jq >/dev/null || v12_fail "jq is required for the live Edge integration test"

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/rotary-v12-edge-recovery.XXXXXX")"
serve_pid=""

cleanup() {
  if [[ -n "$serve_pid" ]] && kill -0 "$serve_pid" 2>/dev/null; then
    kill "$serve_pid" 2>/dev/null || true
    wait "$serve_pid" 2>/dev/null || true
  fi
  rm -rf "$temporary_root"
  if docker ps --format '{{.Names}}' | rg -Fxq "supabase_db_${V12_PROJECT_ID}"; then
    supabase db reset --local --workdir "$V12_ROOT" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'printf "Live Edge recovery test failed at script line %s.\n" "$LINENO" >&2' ERR

status_json="$(supabase status --workdir "$V12_ROOT" -o json 2>/dev/null || true)"
api_url="$(jq -er '.API_URL' <<< "$status_json")"
anon_key="$(jq -er '.ANON_KEY' <<< "$status_json")"
service_role_key="$(jq -er '.SERVICE_ROLE_KEY' <<< "$status_json")"
jwt_secret="$(jq -er '.JWT_SECRET' <<< "$status_json")"

edge_env_pipe="$temporary_root/edge.env.pipe"
mkfifo "$edge_env_pipe"
(
  printf '%s\n' \
    'INVITATION_HMAC_CURRENT_KEY_VERSION=1' \
    'INVITATION_HMAC_ACCEPTED_KEY_VERSIONS=1' \
    'INVITATION_HMAC_SECRET_V1=AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA' \
    > "$edge_env_pipe"
) &
supabase functions serve \
  --workdir "$V12_ROOT" \
  --env-file "$edge_env_pipe" \
  --log-level error \
  > "$temporary_root/functions-serve.log" 2>&1 &
serve_pid=$!

for _ in {1..100}; do
  if curl -sS -o /dev/null --max-time 1 \
    "http://127.0.0.1:55321/functions/v1/validate-membership-invitation"; then
    break
  fi
  sleep 0.1
done
kill -0 "$serve_pid" 2>/dev/null || v12_fail "local Edge runtime did not remain available"

synthetic_email="edge-recovery-$(date +%s)-$$@example.test"
synthetic_password='Local-Only-Edge-Recovery-2026!'

admin_user_response="$(curl -fsS --max-time 10 \
  -X POST "$api_url/auth/v1/admin/users" \
  -H "apikey: $service_role_key" \
  -H "authorization: Bearer $service_role_key" \
  -H 'content-type: application/json' \
  --data "$(jq -cn \
    --arg email "$synthetic_email" \
    --arg password "$synthetic_password" \
    '{email:$email,password:$password,email_confirm:true}')")"
actor_auth_user_id="$(jq -er '.id' <<< "$admin_user_response")"

access_token="$(ACTOR_AUTH_USER_ID="$actor_auth_user_id" \
  SYNTHETIC_EMAIL="$synthetic_email" \
  LOCAL_JWT_SECRET="$jwt_secret" \
  node --input-type=module -e '
    import crypto from "node:crypto";
    const b64 = (value) => Buffer.from(value).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64(JSON.stringify({
      aud: "authenticated",
      email: process.env.SYNTHETIC_EMAIL,
      exp: now + 600,
      iat: now,
      role: "authenticated",
      sub: process.env.ACTOR_AUTH_USER_ID,
    }));
    const signingInput = `${header}.${payload}`;
    const signature = crypto.createHmac("sha256", process.env.LOCAL_JWT_SECRET)
      .update(signingInput).digest();
    process.stdout.write(`${signingInput}.${b64(signature)}`);
  ')"

container="$(v12_container)"
docker exec "$container" psql -Xq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  INSERT INTO public.districts (
    district_id, district_code, district_name, district_country_code
  ) VALUES (
    'e1000000-0000-4000-8000-000000000001', 'TEDG', 'Edge recovery test district', 'TW'
  );
  INSERT INTO public.clubs (
    club_id, club_district_id, club_rotary_number, club_name
  ) VALUES (
    'e1100000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'CEDG', 'Edge recovery test club'
  );
  INSERT INTO public.people (person_id, person_chinese_name)
  VALUES ('e1200000-0000-4000-8000-000000000001', 'Edge recovery manager');
  INSERT INTO public.people (person_id, person_chinese_name)
  SELECT
    ('e12' || lpad(series::text, 5, '0') || '-0000-4000-8000-' ||
      lpad((series + 1)::text, 12, '0'))::uuid,
    'Edge recovery invitee ' || series
  FROM generate_series(1, 5) AS series;
  INSERT INTO public.accounts (
    account_id, account_person_id, account_auth_user_id,
    account_status, account_creation_source
  ) VALUES (
    'e1300000-0000-4000-8000-000000000001',
    'e1200000-0000-4000-8000-000000000001', '$actor_auth_user_id',
    'active', 'administrative_repair'
  );
  INSERT INTO public.memberships (
    membership_id, membership_person_id, membership_club_id,
    membership_status, membership_onboarding_status
  ) VALUES (
    'e1400000-0000-4000-8000-000000000001',
    'e1200000-0000-4000-8000-000000000001',
    'e1100000-0000-4000-8000-000000000001', 'active', 'completed'
  );
  INSERT INTO public.memberships (
    membership_id, membership_person_id, membership_club_id,
    membership_status, membership_onboarding_status
  )
  SELECT
    ('e14' || lpad(series::text, 5, '0') || '-0000-4000-8000-' ||
      lpad((series + 1)::text, 12, '0'))::uuid,
    ('e12' || lpad(series::text, 5, '0') || '-0000-4000-8000-' ||
      lpad((series + 1)::text, 12, '0'))::uuid,
    'e1100000-0000-4000-8000-000000000001', 'pending', 'not_started'
  FROM generate_series(1, 5) AS series;
  INSERT INTO public.membership_role_assignments (
    membership_role_assignment_membership_id,
    membership_role_assignment_role_id,
    membership_role_assignment_starts_at,
    membership_role_assignment_status,
    membership_role_assignment_assigned_by_account_id,
    membership_role_assignment_reason_code
  )
  SELECT
    'e1400000-0000-4000-8000-000000000001', role_id,
    now() - interval '1 day', 'active',
    '00000000-0000-0000-0000-000000000001', 'test_fixture'
  FROM public.roles
  WHERE role_code = 'club.secretary';
" >/dev/null

edge_post() {
  local function_name="$1"
  local request_body="$2"
  local response_prefix="$temporary_root/response"
  EDGE_STATUS="$(curl -sS --max-time 10 \
    -D "$response_prefix.headers" \
    -o "$response_prefix.body" \
    -w '%{http_code}' \
    -X POST "$api_url/functions/v1/$function_name" \
    -H "apikey: $anon_key" \
    -H "authorization: Bearer $access_token" \
    -H 'content-type: application/json' \
    --data "$request_body")"
  EDGE_BODY="$(< "$response_prefix.body")"
  EDGE_HEADERS="$response_prefix.headers"
}

header_value() {
  local name="$1"
  awk -F ': ' -v name="$name" '
    tolower($1) == name {
      value = $2
      sub(/\r$/, "", value)
    }
    END { print value }
  ' "$EDGE_HEADERS"
}

create_invitation() {
  local membership_id="$1"
  local idempotency_key="$2"
  edge_post create-membership-invitation "$(jq -cn \
    --arg membership_id "$membership_id" \
    --arg idempotency_key "$idempotency_key" \
    '{membership_id:$membership_id,idempotency_key:$idempotency_key,expires_in_seconds:86400}')"
  [[ "$EDGE_STATUS" == "201" ]] || v12_fail "live Edge Create returned HTTP $EDGE_STATUS"
}

resend_invitation() {
  local invitation_id="$1"
  local idempotency_key="$2"
  edge_post resend-membership-invitation "$(jq -cn \
    --arg invitation_id "$invitation_id" \
    --arg idempotency_key "$idempotency_key" \
    '{invitation_id:$invitation_id,idempotency_key:$idempotency_key,expires_in_seconds:86400}')"
  [[ "$EDGE_STATUS" == "200" ]] || v12_fail "live Edge Resend returned HTTP $EDGE_STATUS"
}

validate_invitation() {
  local token="$1"
  local idempotency_key="$2"
  edge_post validate-membership-invitation "$(jq -cn \
    --arg token "$token" \
    --arg idempotency_key "$idempotency_key" \
    '{token:$token,idempotency_key:$idempotency_key}')"
}

public_error_fingerprint=""
assert_public_failure() {
  local label="$1"
  local token="$2"
  local idempotency_key="$3"
  validate_invitation "$token" "$idempotency_key"
  local expected_body='{"ok":false,"code":"INVITATION_INVALID_OR_UNAVAILABLE","message":"Invitation is invalid or unavailable."}'
  [[ "$EDGE_STATUS" == "404" ]] || v12_fail "$label exposed a non-canonical HTTP status"
  [[ "$EDGE_BODY" == "$expected_body" ]] || v12_fail "$label exposed a non-canonical JSON body"
  jq -e 'keys_unsorted == ["ok","code","message"]
    and .ok == false
    and .code == "INVITATION_INVALID_OR_UNAVAILABLE"
    and .message == "Invitation is invalid or unavailable."
    and (length == 3)' <<< "$EDGE_BODY" >/dev/null ||
    v12_fail "$label exposed a non-canonical response shape"
  local fingerprint
  fingerprint="$EDGE_STATUS|$EDGE_BODY|$(header_value content-type)|$(header_value cache-control)|$(header_value pragma)|$(header_value x-content-type-options)"
  [[ "$(header_value content-type)" == "application/json; charset=utf-8" ]] || v12_fail "$label exposed a non-canonical Content-Type"
  [[ "$(header_value cache-control)" == "no-store, max-age=0" ]] || v12_fail "$label exposed a non-canonical Cache-Control"
  [[ "$(header_value pragma)" == "no-cache" ]] || v12_fail "$label exposed a non-canonical Pragma"
  [[ "$(header_value x-content-type-options)" == "nosniff" ]] || v12_fail "$label exposed a non-canonical X-Content-Type-Options"
  if [[ -z "$public_error_fingerprint" ]]; then
    public_error_fingerprint="$fingerprint"
  else
    [[ "$fingerprint" == "$public_error_fingerprint" ]] || v12_fail "$label differs from the canonical public eligibility response"
  fi
}

recovery_membership='e1400001-0000-4000-8000-000000000002'
create_invitation "$recovery_membership" 'edge-create-loss-0001'
jq -e '.token_available == true and (.token | type == "string")' <<< "$EDGE_BODY" >/dev/null || v12_fail "live Edge Create did not return a one-time token"
lost_create_response="$EDGE_BODY"
recovery_invitation_id="$(jq -er '.invitation_id' <<< "$lost_create_response")"
lost_token="$(jq -er '.token' <<< "$lost_create_response")"

create_invitation "$recovery_membership" 'edge-create-loss-0001'
jq -e --arg invitation_id "$recovery_invitation_id" '.invitation_id == $invitation_id and .token == null and .token_available == false and .expires_at == null' <<< "$EDGE_BODY" >/dev/null || v12_fail "Create retry re-exposed token material"
invitation_count="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT count(*) FROM public.invitations WHERE invitation_membership_id = '$recovery_membership';")"
[[ "$invitation_count" == "1" ]] || v12_fail "Create retry produced a second Invitation"

create_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT invitation_token_nonce || ':' || encode(invitation_token_hash, 'hex') || ':' || invitation_token_issued_at::text || ':' || invitation_expires_at::text FROM public.invitations WHERE invitation_id = '$recovery_invitation_id';")"
sleep 1.1
resend_invitation "$recovery_invitation_id" 'edge-resend-loss-0001'
first_resend_token="$(jq -er '.token' <<< "$EDGE_BODY")"
first_resend_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT invitation_token_nonce || ':' || encode(invitation_token_hash, 'hex') || ':' || invitation_token_issued_at::text || ':' || invitation_expires_at::text FROM public.invitations WHERE invitation_id = '$recovery_invitation_id';")"
[[ "$first_resend_state" != "$create_state" ]] || v12_fail "Resend did not rotate token metadata"
assert_public_failure 'old token after Resend' "$lost_token" 'edge-validate-old-0001'
validate_invitation "$first_resend_token" 'edge-validate-new-0001'
[[ "$EDGE_STATUS" == "200" ]] && jq -e '.is_valid == true and .can_attempt_onboarding == true' <<< "$EDGE_BODY" >/dev/null || v12_fail "new Resend token did not validate"

resend_invitation "$recovery_invitation_id" 'edge-resend-loss-0001'
jq -e '.token == null and .token_available == false and .expires_at == null' <<< "$EDGE_BODY" >/dev/null || v12_fail "same Resend key re-exposed token material"
same_resend_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT invitation_token_nonce || ':' || encode(invitation_token_hash, 'hex') || ':' || invitation_token_issued_at::text || ':' || invitation_expires_at::text FROM public.invitations WHERE invitation_id = '$recovery_invitation_id';")"
[[ "$same_resend_state" == "$first_resend_state" ]] || v12_fail "same Resend key rotated token metadata again"

sleep 1.1
resend_invitation "$recovery_invitation_id" 'edge-resend-loss-0002'
second_resend_token="$(jq -er '.token' <<< "$EDGE_BODY")"
second_resend_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT invitation_token_nonce || ':' || encode(invitation_token_hash, 'hex') || ':' || invitation_token_issued_at::text || ':' || invitation_expires_at::text FROM public.invitations WHERE invitation_id = '$recovery_invitation_id';")"
[[ "$second_resend_state" != "$first_resend_state" ]] || v12_fail "new Resend key did not rotate token metadata a second time"
assert_public_failure 'old token after second Resend' "$first_resend_token" 'edge-validate-old-0002'
validate_invitation "$second_resend_token" 'edge-validate-current-0001'
[[ "$EDGE_STATUS" == "200" ]] || v12_fail "second Resend token did not validate"
first_validate_body="$EDGE_BODY"
validate_invitation "$second_resend_token" 'edge-validate-current-0001'
[[ "$EDGE_STATUS" == "200" ]] || v12_fail "repeated Validate did not remain successful"
jq -e --argjson first "$first_validate_body" '.is_idempotent_retry == true and .validated_at == $first.validated_at and .is_valid == true' <<< "$EDGE_BODY" >/dev/null || v12_fail "repeated Validate did not return stable success"
recovery_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT invitation_status || ':' || (invitation_accepted_at IS NULL)::text || ':' || (invitation_consumed_at IS NULL)::text FROM public.invitations WHERE invitation_id = '$recovery_invitation_id';")"
[[ "$recovery_state" == "pending:true:true" ]] || v12_fail "repeated Validate consumed or accepted the Invitation"

create_invitation 'e1400002-0000-4000-8000-000000000003' 'edge-create-hash-0001'; hash_invitation_id="$(jq -er '.invitation_id' <<< "$EDGE_BODY")"; hash_token="$(jq -er '.token' <<< "$EDGE_BODY")"
create_invitation 'e1400003-0000-4000-8000-000000000004' 'edge-create-expired-1'; expired_invitation_id="$(jq -er '.invitation_id' <<< "$EDGE_BODY")"; expired_token="$(jq -er '.token' <<< "$EDGE_BODY")"
create_invitation 'e1400004-0000-4000-8000-000000000005' 'edge-create-revoked-1'; revoked_invitation_id="$(jq -er '.invitation_id' <<< "$EDGE_BODY")"; revoked_token="$(jq -er '.token' <<< "$EDGE_BODY")"
create_invitation 'e1400005-0000-4000-8000-000000000006' 'edge-create-accepted1'; accepted_invitation_id="$(jq -er '.invitation_id' <<< "$EDGE_BODY")"; accepted_token="$(jq -er '.token' <<< "$EDGE_BODY")"

docker exec "$container" psql -Xq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  UPDATE public.invitations SET invitation_token_hash = decode(repeat('fe', 32), 'hex') WHERE invitation_id = '$hash_invitation_id';
  UPDATE public.invitations SET invitation_status = 'expired', invitation_marked_expired_at = clock_timestamp() WHERE invitation_id = '$expired_invitation_id';
  UPDATE public.invitations SET invitation_status = 'revoked', invitation_revoked_at = clock_timestamp(), invitation_revoked_by_account_id = 'e1300000-0000-4000-8000-000000000001', invitation_revoke_reason = 'security_response' WHERE invitation_id = '$revoked_invitation_id';
  UPDATE public.invitations SET invitation_status = 'accepted', invitation_accepted_at = clock_timestamp(), invitation_consumed_at = clock_timestamp(), invitation_accepted_by_auth_user_id = '$actor_auth_user_id' WHERE invitation_id = '$accepted_invitation_id';
" >/dev/null

not_found_token="$(node --input-type=module -e '
  import crypto from "node:crypto";
  const b64 = (value) => Buffer.from(value).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({expires_at: now + 86400, invitation_id: crypto.randomUUID(), issued_at: now, nonce: b64(crypto.randomBytes(32)), version: 1}));
  const signingInput = `v1.k1.${payload}`;
  const key = Buffer.from("AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA", "base64url");
  const signature = crypto.createHmac("sha256", key).update(`rotary-v12-invitation-signature\0${signingInput}`).digest();
  process.stdout.write(`${signingInput}.${b64(signature)}`);
')"
tampered_token="${second_resend_token%?}A"; [[ "$tampered_token" != "$second_resend_token" ]] || tampered_token="${second_resend_token%?}B"
unknown_token_version="v2.${second_resend_token#*.}"
unknown_hmac_key="v1.k2.${second_resend_token#*.*.}"

assert_public_failure 'not found' "$not_found_token" 'edge-matrix-not-found'
assert_public_failure 'malformed token' 'not-a-token' 'edge-matrix-malformed'
assert_public_failure 'invalid signature' "$tampered_token" 'edge-matrix-signature'
assert_public_failure 'expired' "$expired_token" 'edge-matrix-expired1'
assert_public_failure 'revoked' "$revoked_token" 'edge-matrix-revoked1'
assert_public_failure 'accepted fixture' "$accepted_token" 'edge-matrix-accepted'
assert_public_failure 'unknown token version' "$unknown_token_version" 'edge-matrix-version01'
assert_public_failure 'unknown HMAC key version' "$unknown_hmac_key" 'edge-matrix-key-0001'
assert_public_failure 'wrong storage hash' "$hash_token" 'edge-matrix-hash-0001'
assert_public_failure 'Resend old token' "$lost_token" 'edge-matrix-old-0001'

edge_post validate-membership-invitation "$(jq -cn --arg token "$second_resend_token" --arg idempotency_key 'edge-body-actor-0001' --arg actor_auth_user_id 'ffffffff-ffff-4fff-8fff-ffffffffffff' '{token:$token,idempotency_key:$idempotency_key,actor_auth_user_id:$actor_auth_user_id}')"
[[ "$EDGE_STATUS" == "404" ]] || v12_fail "caller-supplied actor Auth UUID was not rejected"

actor_state="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT (count(*) >= 2)::text || ':' || bool_and(invitation_event_actor_auth_user_id = '$actor_auth_user_id')::text || ':' || bool_and(invitation_event_actor_account_id = 'e1300000-0000-4000-8000-000000000001')::text FROM public.invitation_events WHERE invitation_event_type = 'validated' AND invitation_event_invitation_id = '$recovery_invitation_id';")"
[[ "$actor_state" == "true:true:true" ]] || v12_fail "Validate actor was not derived from the verified JWT and trusted Account mapping"
plaintext_column_count="$(docker exec "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('invitations', 'invitation_events', 'audit_logs', 'idempotency_records') AND column_name ~ '(^|_)(plaintext_token|plain_token|raw_token|token_plain|authorization|bearer_token)$';")"
[[ "$plaintext_column_count" == "0" ]] || v12_fail "database exposes a plaintext token or Authorization field"

docker exec "$container" pg_dump -U postgres -d postgres --data-only --no-owner --no-privileges \
  > "$temporary_root/database-data.sql" 2> "$temporary_root/pg-dump.log"
docker logs "supabase_edge_runtime_${V12_PROJECT_ID}" > "$temporary_root/edge-runtime.log" 2>&1
for forbidden_value in "$lost_token" "$first_resend_token" "$second_resend_token" "$access_token"; do
  if rg -Fq -- "$forbidden_value" "$temporary_root/database-data.sql" "$temporary_root/edge-runtime.log" "$temporary_root/functions-serve.log" "$temporary_root/pg-dump.log"; then
    v12_fail "plaintext token or Authorization material appeared in database or Edge logs"
  fi
done

printf 'Live Edge response-loss recovery, 10-case equality matrix, Auth actor, and no-persistence verification passed.\n'
