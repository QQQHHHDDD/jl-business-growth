#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="${repo_root}/scripts/jl-business-migrate-release"

if "${helper}"; then
    echo 'migration helper accepted missing version' >&2
    exit 1
fi
if "${helper}" v1.2; then
    echo 'migration helper accepted malformed version' >&2
    exit 1
fi
if "${helper}" 'v1.2.3;touch /tmp/forbidden'; then
    echo 'migration helper accepted command-like version' >&2
    exit 1
fi

printf 'migration helper validation tests: PASS\n'
