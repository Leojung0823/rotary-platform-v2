#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/_edge-readiness.sh"

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/rotary-v12-edge-readiness.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT

v12_test_fail() {
  printf 'Invitation Edge readiness regression failed: %s\n' "$1" >&2
  return 1
}

timeout_calls=0
timeout_diagnostics_calls=0
timeout_probe() {
  timeout_calls=$((timeout_calls + 1))
  EDGE_STATUS=502
  EDGE_READY=false
}
timeout_diagnostics() {
  timeout_diagnostics_calls=$((timeout_diagnostics_calls + 1))
  [[ "$1" == "timeout" && "$2" == "1" && "$3" == "502" ]] || return 1
}

if V12_EDGE_READY_TIMEOUT_SECONDS=0 V12_EDGE_READY_INTERVAL_SECONDS=0 \
  v12_wait_for_live_edge_create timeout_probe timeout_diagnostics \
  >"$temporary_root/timeout.out" 2>"$temporary_root/timeout.err"; then
  v12_test_fail 'gateway readiness timeout unexpectedly passed'
fi
[[ "$timeout_calls" == "1" ]] || v12_test_fail 'timeout probe did not stop at the hard deadline'
[[ "$timeout_diagnostics_calls" == "1" ]] || v12_test_fail 'timeout did not emit one diagnostic callback'
rg -Fq 'timed out after 0s (last HTTP status: 502)' "$temporary_root/timeout.err" ||
  v12_test_fail 'timeout diagnostics omitted the last safe HTTP status'

semantic_calls=0
semantic_diagnostics_calls=0
semantic_probe() {
  semantic_calls=$((semantic_calls + 1))
  EDGE_STATUS=404
  EDGE_READY=false
}
semantic_diagnostics() {
  semantic_diagnostics_calls=$((semantic_diagnostics_calls + 1))
  [[ "$1" == "semantic-response" && "$2" == "1" && "$3" == "404" ]] || return 1
}

if V12_EDGE_READY_TIMEOUT_SECONDS=5 V12_EDGE_READY_INTERVAL_SECONDS=0 \
  v12_wait_for_live_edge_create semantic_probe semantic_diagnostics \
  >"$temporary_root/semantic.out" 2>"$temporary_root/semantic.err"; then
  v12_test_fail 'semantic HTTP failure was retried or accepted'
fi
[[ "$semantic_calls" == "1" ]] || v12_test_fail 'semantic HTTP failure was retried'
[[ "$semantic_diagnostics_calls" == "1" ]] || v12_test_fail 'semantic HTTP failure did not emit diagnostics'
rg -Fq 'HTTP 404; refusing to retry a semantic response' "$temporary_root/semantic.err" ||
  v12_test_fail 'semantic HTTP failure did not explain its immediate failure'

ready_calls=0
ready_diagnostics_calls=0
ready_probe() {
  ready_calls=$((ready_calls + 1))
  EDGE_STATUS=404
  EDGE_READY=true
}
ready_diagnostics() {
  ready_diagnostics_calls=$((ready_diagnostics_calls + 1))
}

V12_EDGE_READY_TIMEOUT_SECONDS=5 V12_EDGE_READY_INTERVAL_SECONDS=0 \
  v12_wait_for_live_edge_create ready_probe ready_diagnostics
[[ "$ready_calls" == "1" ]] || v12_test_fail 'canonical Create readiness response was not accepted immediately'
[[ "$ready_diagnostics_calls" == "0" ]] || v12_test_fail 'successful readiness emitted failure diagnostics'

redaction_input="$temporary_root/redaction-input.log"
redaction_output="$temporary_root/redaction-output.log"
redaction_samples=(
  '{"authorization":"Bearer authorization-json-secret"}'
  'authorization: Bearer authorization-colon-secret'
  'authorization=Bearer authorization-equals-secret'
  '{"apikey":"apikey-json-secret"}'
  'apikey: apikey-colon-secret'
  'apikey=apikey-equals-secret'
  'INVITATION_HMAC_SECRET_V1: hmac-colon-secret'
  '{"INVITATION_HMAC_SECRET_V2":"hmac-json-secret"}'
  'INVITATION_HMAC_SECRET_V3=hmac-equals-secret'
  'SERVICE_ROLE_KEY: service-colon-secret'
  '{"SERVICE_ROLE_KEY":"service-json-secret"}'
  'SERVICE_ROLE_KEY=service-equals-secret'
  'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA'
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsb2NhbCJ9.signature'
  'v1.k1.payload.signature'
)
printf '%s\n' "${redaction_samples[@]}" > "$redaction_input"
v12_redact_edge_readiness_log_values < "$redaction_input" > "$redaction_output"
for forbidden_value in \
  authorization-json-secret authorization-colon-secret authorization-equals-secret \
  apikey-json-secret apikey-colon-secret apikey-equals-secret \
  hmac-colon-secret hmac-json-secret hmac-equals-secret \
  service-colon-secret service-json-secret service-equals-secret \
  AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA \
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsb2NhbCJ9.signature' \
  'v1.k1.payload.signature'
do
  if rg -Fq -- "$forbidden_value" "$redaction_output"; then
    v12_test_fail 'redactor retained a representative sensitive value'
  fi
done

printf 'Live Edge Create readiness and diagnostic redaction regressions passed.\n'
