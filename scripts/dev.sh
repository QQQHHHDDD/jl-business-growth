#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_pid=""
frontend_pid=""

cleanup() {
  if [[ -n "${frontend_pid}" ]]; then
    kill "${frontend_pid}" 2>/dev/null || true
  fi
  if [[ -n "${backend_pid}" ]]; then
    kill "${backend_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

(
  cd "${repo_root}/backend"
  go run ./cmd/jl-business-api
) &
backend_pid="$!"

(
  cd "${repo_root}/frontend"
  exec npm run dev -- --host 0.0.0.0 --port 5173
) &
frontend_pid="$!"

wait -n "${backend_pid}" "${frontend_pid}"
