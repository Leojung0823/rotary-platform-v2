#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_config

edge_root="$V12_ROOT/supabase/functions"
migration="$V12_ROOT/supabase/migrations/0002_v12_invitation_core.sql"
decisions="$REPOSITORY_ROOT/docs/roadmap/V12_DECISIONS_REQUIRED.md"
architecture="$REPOSITORY_ROOT/docs/architecture/V12_ARCHITECTURE_DECISIONS.md"
database_readme="$V12_ROOT/README.md"

"$V12_ROOT/scripts/decision-contract-test.sh"

if [[ "${V12_SECURITY_SCAN_NEGATIVE_TEST:-}" == "wildcard-cors" ]]; then
  negative_fixture='access-control-allow-origin: *'
  if rg -q 'access-control-allow-origin[^\n]*\*' <<< "$negative_fixture"; then
    v12_fail "failure injection detected wildcard CORS fixture"
  fi
  v12_fail "failure injection was not detected"
elif [[ -n "${V12_SECURITY_SCAN_NEGATIVE_TEST:-}" ]]; then
  v12_fail "unknown security scan negative test mode"
fi

[[ ! -e "$edge_root/accept-membership-invitation" ]] ||
  v12_fail "legacy PR-02 final-accept Edge path still exists"
[[ -f "$edge_root/validate-membership-invitation/index.ts" ]] ||
  v12_fail "validate-membership-invitation Edge entry is missing"

if rg -n '^\[functions\.accept-membership-invitation\]$' "$V12_CONFIG"; then
  v12_fail "final-accept Edge deployment config still exists"
fi
rg -q '^\[functions\.validate-membership-invitation\]$' "$V12_CONFIG" ||
  v12_fail "validate Edge deployment config is missing"

if rg -n 'CREATE OR REPLACE FUNCTION public\.accept_membership_invitation' "$migration"; then
  v12_fail "public final-accept RPC still exists in PR-02 migration"
fi
rg -q 'CREATE OR REPLACE FUNCTION public\.validate_membership_invitation' "$migration" ||
  v12_fail "public non-consuming validation RPC is missing"

if rg -n 'accept_membership_invitation|invitation_accept' "$edge_root" \
  -g '*.ts' -g '!*.test.ts'; then
  v12_fail "active Invitation Edge source still calls final acceptance"
fi
if rg -n 'console\.(log|info|warn|error|debug)|URLSearchParams|searchParams' \
  "$edge_root" -g '*.ts' -g '!*.test.ts'; then
  v12_fail "Invitation Edge source can log or place token material in URL state"
fi
if rg -n 'access-control-allow-origin[^\n]*\*' "$edge_root" -g '*.ts'; then
  v12_fail "Invitation Edge source contains wildcard CORS"
fi
if rg -n 'input\.(actor_auth_user_id|auth_user_id|account_id|person_id)' \
  "$edge_root" -g 'index.ts'; then
  v12_fail "Invitation Edge accepts caller-supplied Auth, Account, or Person identity"
fi
if rg -n 'p_token_nonce|p_token[[:space:]]*:|p_signature|p_secret' \
  "$edge_root/validate-membership-invitation/index.ts"; then
  v12_fail "Validate RPC payload contains plaintext token, nonce, signature, or secret"
fi
if rg -n 'idempotent_replay|invitation_is_replay' \
  "$edge_root/validate-membership-invitation/index.ts"; then
  v12_fail "Validate API still uses ambiguous final-replay terminology"
fi
if rg -n 'INVITATION_HMAC_SECRET_V[0-9]+[[:space:]]*=[[:space:]]*"' \
  "$edge_root" -g '*.ts' -g '!*.test.ts'; then
  v12_fail "Invitation Edge source contains a hard-coded HMAC secret"
fi

rg -q 'INVITATION_INVALID_OR_UNAVAILABLE' \
  "$edge_root/_shared/invitation-edge.ts" ||
  v12_fail "public Validate eligibility collapse code is missing"
rg -q 'invitationValidationErrorResponse' \
  "$edge_root/validate-membership-invitation/index.ts" ||
  v12_fail "Validate Edge does not use the public eligibility collapse"
rg -q 'invitation_event_actor_auth_user_id' "$migration" ||
  v12_fail "Invitation Event does not record the authenticated Auth User"
if rg -ni '(legacy[^\n]*(token|invitation)[^\n]*(verify|compat|fallback|parser|migration)|dual-format|sha-?256[^\n]*(compat|fallback))' \
  "$edge_root" "$migration" -g '*.ts' -g '*.sql'; then
  v12_fail "active V1.2 Invitation code contains a Legacy compatibility path"
fi

if rg -q 'accept_membership_invitation' "$V12_GENERATED_TYPES"; then
  v12_fail "generated types still expose the removed final-accept RPC"
fi
rg -q 'validate_membership_invitation' "$V12_GENERATED_TYPES" ||
  v12_fail "generated types do not expose the new validation RPC"
rg -q 'invitation_is_idempotent_retry' "$V12_GENERATED_TYPES" ||
  v12_fail "generated types do not expose the request-idempotency result name"
if rg -q 'idempotent_replay' "$database_readme"; then
  v12_fail "README still exposes ambiguous Validate replay terminology"
fi
rg -q 'delivery_handoff' "$migration" ||
  v12_fail "manual token handoff is not represented by the precise Audit event"
rg -q 'is_idempotent_retry.*request idempotency' "$database_readme" ||
  v12_fail "Validate idempotency response semantics are not documented"

rg -q 'accepted.*onboarding transaction.*committed' "$architecture" ||
  v12_fail "accepted semantic is not recorded in the architecture decisions"
rg -q 'PR-02.*validate-only' "$architecture" ||
  v12_fail "PR-02 validate-only boundary is not recorded"
rg -qi 'distributed rate limit.*Deferred' "$database_readme" ||
  v12_fail "distributed rate limit is not explicitly marked Deferred"
rg -q 'Legacy SHA-256.*compatibility verifier.*不存在' "$database_readme" ||
  v12_fail "Legacy token compatibility rejection is not documented"

printf 'V1.2 Invitation security, endpoint, generated contract, and decision scan passed.\n'
