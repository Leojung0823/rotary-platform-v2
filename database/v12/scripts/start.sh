#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_config
start_log="$(mktemp "${TMPDIR:-/tmp}/rotary-v12-start.XXXXXX")"
trap 'rm -f "$start_log"' EXIT
if ! supabase start --workdir "$V12_ROOT" > "$start_log" 2>&1; then
  sed -E '/Publishable|Secret|Access Key/d' "$start_log" >&2
  exit 1
fi
v12_assert_local_stack
printf 'Started isolated V1.2 Supabase stack on API port 55321 and DB port 55322.\n'
