#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: GITHUB_ACTIONS=true GITHUB_RUN_ID=<id> bash scripts/retry-supabase-start.sh database" >&2
  echo "   or: GITHUB_ACTIONS=true GITHUB_RUN_ID=<id> bash scripts/retry-supabase-start.sh full -x <excluded-services>" >&2
}

if [[ "${GITHUB_ACTIONS:-}" != "true" || -z "${GITHUB_RUN_ID:-}" ]]; then
  echo "Refusing to start or stop Supabase outside a GitHub Actions run." >&2
  usage
  exit 64
fi

mode="${1:-}"
if [[ $# -gt 0 ]]; then shift; fi

case "$mode" in
  database)
    if [[ $# -ne 0 ]]; then usage; exit 64; fi
    command=(supabase db start)
    ;;
  full)
    if [[ $# -ne 2 || "$1" != "-x" || -z "$2" ]]; then usage; exit 64; fi
    command=(supabase start -x "$2")
    ;;
  *)
    usage
    exit 64
    ;;
esac

log_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/supabase-start-retry.XXXXXX")"
trap 'rm -rf -- "$log_dir"' EXIT
echo "Supabase image registry: ${SUPABASE_INTERNAL_IMAGE_REGISTRY:-CLI default}"

is_retryable_image_pull_failure() {
  local status="$1"
  local log_file="$2"

  if grep -Eiq \
    'toomanyrequests|too many requests|pull access denied|manifest unknown|failed to (pull|resolve|download).*(image|manifest|reference)|failed to pull (image|docker image)|failed to resolve source metadata|error pulling image|error response from daemon:.*(pull|429|manifest)|unexpected status from HEAD request.*(429|5[0-9][0-9])|failed to copy' \
    "$log_file"; then
    return 0
  fi

  # A timed-out CLI that was actively pulling an image is a stalled image
  # download. Do not retry unrelated startup timeouts.
  if [[ "$status" == "124" || "$status" == "137" ]] \
    && grep -Eiq '(pulling image|pulling .*image|image .*pull|downloading .*layer)' "$log_file"; then
    return 0
  fi

  # Docker may report a transport error without repeating the word "pull";
  # require evidence that image pulling had started before treating it as such.
  if grep -Eiq '(pulling image|pulling .*image|image .*pull|downloading .*layer)' "$log_file" \
    && grep -Eiq '(context deadline exceeded|unexpected eof|connection reset|i/o timeout|TLS handshake timeout|network is unreachable)' "$log_file"; then
    return 0
  fi

  return 1
}

print_attempt_logs() {
  local log_file
  for log_file in "$log_dir"/attempt-*.log; do
    [[ -f "$log_file" ]] || continue
    echo "----- ${log_file##*/} -----"
    cat "$log_file"
  done
}

is_registry_rate_limited() {
  [[ "${SUPABASE_INTERNAL_IMAGE_REGISTRY:-}" == "public.ecr.aws" || "${SUPABASE_INTERNAL_IMAGE_REGISTRY:-}" == "ghcr.io" ]] \
    && grep -Eiq '(toomanyrequests|too many requests|rate exceeded|rate limit|(^|[^0-9])429([^0-9]|$))' "$1"
}

for attempt in 1 2 3; do
  attempt_log="$log_dir/attempt-${attempt}.log"
  if timeout -k 30 600 "${command[@]}" >"$attempt_log" 2>&1; then
    if is_registry_rate_limited "$attempt_log"; then
      echo "Registry rate limit detected (${SUPABASE_INTERNAL_IMAGE_REGISTRY}); stopping without retry."
      print_attempt_logs
      exit 1
    fi
    echo "Supabase ${mode} startup succeeded on attempt ${attempt}."
    exit 0
  else
    status=$?
  fi

  # The product owner explicitly requires stopping on registry rate limiting,
  # including avoiding another attempt within this same job.
  if is_registry_rate_limited "$attempt_log"; then
    echo "Registry rate limit detected (${SUPABASE_INTERNAL_IMAGE_REGISTRY}); stopping without retry."
    print_attempt_logs
    exit "$status"
  fi

  if ! is_retryable_image_pull_failure "$status" "$attempt_log"; then
    echo "Supabase ${mode} startup failed with a non-retryable error (status ${status}); failing immediately."
    print_attempt_logs
    exit "$status"
  fi

  if [[ "$attempt" == "3" ]]; then
    echo "Supabase ${mode} startup failed after 3 image-pull attempts."
    print_attempt_logs
    exit "$status"
  fi

  if [[ "$attempt" == "1" ]]; then delay=60; else delay=120; fi
  cleanup_log="$log_dir/stop-before-retry-${attempt}.log"
  echo "Retryable image-pull failure on attempt ${attempt}; stopping local Supabase before retry."
  if timeout -k 30 120 supabase stop --no-backup >"$cleanup_log" 2>&1; then
    :
  else
    cleanup_status=$?
    echo "Could not stop the partially started local Supabase stack (status ${cleanup_status}); refusing to retry."
    print_attempt_logs
    echo "----- ${cleanup_log##*/} -----"
    cat "$cleanup_log"
    exit "$cleanup_status"
  fi

  echo "Waiting ${delay} seconds before image-pull retry ${attempt}/2."
  sleep "$delay"
done
