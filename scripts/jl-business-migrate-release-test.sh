#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="${repo_root}/scripts/jl-business-migrate-release"
test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

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

# Source only the validation function; the production CLI still uses fixed
# /etc and /opt paths and exposes no path override.
# shellcheck disable=SC1090
. "${helper}"
environment_parent="${test_root}/etc"
environment_file="${environment_parent}/jl-business-growth.env"
mkdir -p "${environment_parent}"
chmod 0700 "${environment_parent}"
printf 'DATABASE_URL=postgres://test\n' >"${environment_file}"
chmod 0600 "${environment_file}"

validate_environment_file "${environment_file}" "${environment_parent}" "$(id -u)"

mv "${environment_file}" "${environment_file}.real"
ln -s "${environment_file}.real" "${environment_file}"
if validate_environment_file "${environment_file}" "${environment_parent}" "$(id -u)"; then
    echo 'migration helper accepted symlink EnvironmentFile' >&2
    exit 1
fi
rm -f "${environment_file}"
mv "${environment_file}.real" "${environment_file}"

chmod 0622 "${environment_file}"
if validate_environment_file "${environment_file}" "${environment_parent}" "$(id -u)"; then
    echo 'migration helper accepted group/other-writable EnvironmentFile' >&2
    exit 1
fi
chmod 0600 "${environment_file}"

chmod 0722 "${environment_parent}"
if validate_environment_file "${environment_file}" "${environment_parent}" "$(id -u)"; then
    echo 'migration helper accepted group/other-writable EnvironmentFile parent' >&2
    exit 1
fi
chmod 0700 "${environment_parent}"

wrong_owner_uid="$(( $(id -u) + 1 ))"
if validate_environment_file "${environment_file}" "${environment_parent}" "${wrong_owner_uid}"; then
    echo 'migration helper accepted unexpected EnvironmentFile owner' >&2
    exit 1
fi

printf 'migration helper validation tests: PASS\n'
