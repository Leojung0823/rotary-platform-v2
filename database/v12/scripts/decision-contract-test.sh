#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_config

decisions="$REPOSITORY_ROOT/docs/roadmap/V12_DECISIONS_REQUIRED.md"

extract_section() {
  local heading="$1"
  awk -v heading="$heading" '
    $0 == heading { active = 1 }
    active && $0 != heading && /^## / { exit }
    active { print }
  ' "$decisions"
}

require_text() {
  local section="$1"
  local expected="$2"
  local label="$3"
  [[ "$section" == *"$expected"* ]] || v12_fail "$label"
}

d03="$(extract_section '## D03 — Invitation Delivery Channel')"
d04="$(extract_section '## D04 — Legacy Pending Invitation Tokens')"
rate_limit="$(extract_section '## PR-02 Distributed Rate Limit')"

if [[ "${V12_DECISION_TEST_NEGATIVE:-}" == "missing-d03-status" ]]; then
  d03="${d03/- Status: Accepted for MVP/- Status: injected-invalid}"
elif [[ -n "${V12_DECISION_TEST_NEGATIVE:-}" ]]; then
  v12_fail "unknown decision failure-injection mode"
fi

require_text "$d03" '- Status: Accepted for MVP' 'D03 exact status is missing'
require_text "$d03" 'Manual Out-of-Band Delivery' 'D03 manual delivery decision is missing'
require_text "$d03" 'Automated Delivery: Deferred' 'D03 automated delivery is not Deferred'
require_text "$d03" '不實作 Email delivery、SMS delivery、LINE Login delivery 或 LINE OA push' 'D03 provider exclusions are incomplete'
require_text "$d03" '不接受任意 redirect URL 或任意 callback URL' 'D03 redirect/callback prohibition is missing'
require_text "$d03" '不保存任何未核准 destination' 'D03 destination prohibition is missing'
require_text "$d03" '不得標示為 Complete' 'D03 completion-state prohibition is missing'

require_text "$d04" '- Status: Accepted' 'D04 exact status is missing'
require_text "$d04" '不遷移' 'D04 no-migration decision is missing'
require_text "$d04" '不接受 Legacy plaintext token 或 Legacy token hash' 'D04 legacy credential rejection is missing'
require_text "$d04" '不建立 compatibility verifier' 'D04 compatibility verifier prohibition is missing'
require_text "$d04" 'dual-format parser' 'D04 dual-format parser prohibition is missing'
require_text "$d04" 'dual-format fallback' 'D04 dual-format fallback prohibition is missing'
require_text "$d04" '重新發出 V1.2 HMAC token' 'D04 V1.2 HMAC reissue is missing'
require_text "$d04" '全新的 nonce、signature、storage hash 與 expiry' 'D04 token rotation requirements are incomplete'

require_text "$rate_limit" '- Status: Deferred — Release Gate' 'Rate Limit exact deferred status is missing'
require_text "$rate_limit" 'Distributed Rate Limit 尚未實作' 'Rate Limit implementation status is missing'
require_text "$rate_limit" '單一 Edge Worker memory counter' 'Rate Limit memory-counter prohibition is missing'
require_text "$rate_limit" 'Public Staging' 'Rate Limit Public Staging gate is missing'
require_text "$rate_limit" 'Production' 'Rate Limit Production gate is missing'
require_text "$rate_limit" 'Local development 與 CI verification 不算 Public Exposure' 'Rate Limit Local/CI exception is missing'
require_text "$rate_limit" '技術選型尚未決定' 'Rate Limit technology-selection status is missing'

printf 'D03, D04, and Distributed Rate Limit structured decision contracts passed.\n'
