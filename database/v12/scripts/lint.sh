#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

v12_require_no_args "$@"
v12_assert_local_stack
supabase db lint \
  --local \
  --workdir "$V12_ROOT" \
  --schema public \
  --level warning \
  --fail-on error
