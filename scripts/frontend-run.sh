#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner="${FRONTEND_PACKAGE_MANAGER:-}"

if [[ -z "$runner" ]]; then
  if command -v npm >/dev/null 2>&1; then
    runner=npm
  elif command -v bun >/dev/null 2>&1; then
    runner=bun
  else
    echo "npm or bun is required to run frontend tasks" >&2
    exit 1
  fi
fi

case "$runner" in
  npm)
    exec npm --prefix "$root_dir/frontend" run "$@"
    ;;
  bun)
    cd "$root_dir/frontend"
    exec bun run "$@"
    ;;
  *)
    echo "FRONTEND_PACKAGE_MANAGER must be npm or bun" >&2
    exit 1
    ;;
esac
