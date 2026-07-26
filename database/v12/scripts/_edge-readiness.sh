#!/usr/bin/env bash

# Wait for the exact live Edge Create dependency used by the recovery test.
# The probe callback must set EDGE_STATUS and EDGE_READY without printing a
# response body. Only transport and gateway startup failures are retried.
v12_redact_edge_readiness_log_values() {
  sed -E \
    -e 's/("[Aa]uthorization"[[:space:]]*:[[:space:]]*"[Bb]earer[[:space:]]+)[^"]+/\1[REDACTED]/g' \
    -e 's/([Aa]uthorization[[:space:]]*[:=][[:space:]]*[Bb]earer[[:space:]]+)[^[:space:]]+/\1[REDACTED]/g' \
    -e 's/("[Aa]pikey"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/([Aa]pikey[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1[REDACTED]/g' \
    -e 's/("INVITATION_HMAC_SECRET_V[0-9]+"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/(INVITATION_HMAC_SECRET_V[0-9]+[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1[REDACTED]/g' \
    -e 's/("SERVICE_ROLE_KEY"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/g' \
    -e 's/(SERVICE_ROLE_KEY[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1[REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[REDACTED_JWT]/g' \
    -e 's/v[0-9]+\.k[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[REDACTED_INVITATION_TOKEN]/g' \
    -e 's/AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA/[REDACTED_HMAC_FIXTURE]/g'
}

v12_wait_for_live_edge_create() {
  local probe_callback="$1"
  local diagnostics_callback="$2"
  local timeout_seconds="${V12_EDGE_READY_TIMEOUT_SECONDS:-20}"
  local interval_seconds="${V12_EDGE_READY_INTERVAL_SECONDS:-0.2}"
  local started_at="$SECONDS"
  local attempts=0
  local probe_exit status elapsed

  [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || {
    printf 'V1.2 database guard: V12_EDGE_READY_TIMEOUT_SECONDS must be a non-negative integer.\n' >&2
    return 1
  }
  [[ "$interval_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]] || {
    printf 'V1.2 database guard: V12_EDGE_READY_INTERVAL_SECONDS must be a non-negative number.\n' >&2
    return 1
  }

  while :; do
    attempts=$((attempts + 1))
    EDGE_STATUS="000"
    EDGE_READY=false
    if "$probe_callback"; then
      probe_exit=0
    else
      probe_exit=$?
    fi
    status="${EDGE_STATUS:-000}"

    if [[ "$probe_exit" -eq 0 && "$EDGE_READY" == "true" ]]; then
      return 0
    fi

    case "$status" in
      000|502|503|504)
        ;;
      *)
        printf 'V1.2 database guard: live Edge Create readiness returned HTTP %s; refusing to retry a semantic response.\n' "$status" >&2
        "$diagnostics_callback" "semantic-response" "$attempts" "$status" || true
        return 1
        ;;
    esac

    elapsed=$((SECONDS - started_at))
    if [[ "$elapsed" -ge "$timeout_seconds" ]]; then
      printf 'V1.2 database guard: live Edge Create readiness timed out after %ss (last HTTP status: %s).\n' "$timeout_seconds" "$status" >&2
      "$diagnostics_callback" "timeout" "$attempts" "$status" || true
      return 1
    fi
    sleep "$interval_seconds"
  done
}
