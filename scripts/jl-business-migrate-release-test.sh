#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="${repo_root}/scripts/jl-business-migrate-release"
makefile="${repo_root}/Makefile"
test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

# The production helper has one fixed, forward-only Goose invocation. Keep
# these assertions close to the validation tests so a positional-argument or
# executable-path regression is caught without introducing test overrides into
# production code.
grep -Fq 'GOOSE_DRIVER=postgres \' "${helper}"
grep -Fq 'GOOSE_DBSTRING="${DATABASE_URL}" \' "${helper}"
grep -Fq 'exec /usr/bin/goose -dir "${migrations_root}" up' "${helper}"
! grep -Fq 'postgres "${DATABASE_URL}" up' "${helper}"
! grep -Eq 'goose[[:space:]].*down' "${helper}"
! grep -Fq 'GOOSE_BIN' "${helper}"
grep -Fq 'GOOSE_DRIVER=postgres GOOSE_DBSTRING="$$DATABASE_URL" $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations up' "${makefile}"
grep -Fq 'GOOSE_DRIVER=postgres GOOSE_DBSTRING="$$DATABASE_URL" $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations status' "${makefile}"
grep -Fq 'GOOSE_DRIVER=postgres GOOSE_DBSTRING="$$TEST_DATABASE_URL" $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations up' "${makefile}"
grep -Fq 'GOOSE_DRIVER=postgres GOOSE_DBSTRING="$$TEST_DATABASE_URL" $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations status' "${makefile}"
! grep -Eq 'goose@v3\.25\.0 -dir db/migrations postgres' "${makefile}"

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

# Exercise the final command through a test-only copy with its fixed absolute
# paths rewritten into this temporary tree. Production keeps the original
# fixed paths and exposes no executable or directory override.
test_environment_parent="${test_root}/production-etc"
test_environment_file="${test_environment_parent}/jl-business-growth.env"
test_releases_root="${test_root}/releases"
test_migrations_root="${test_releases_root}/v1.2.3/migrations"
test_goose="${test_root}/goose"
test_helper="${test_root}/jl-business-migrate-release"
goose_arguments="${test_root}/goose.arguments"
goose_environment="${test_root}/goose.environment"
mkdir -p "${test_environment_parent}" "${test_migrations_root}"
chmod 0700 "${test_environment_parent}"
printf 'DATABASE_URL=postgres://migration-test\n' >"${test_environment_file}"
chmod 0600 "${test_environment_file}"
cat >"${test_goose}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
[[ "\${GOOSE_DRIVER:-}" == postgres ]]
[[ "\${GOOSE_DBSTRING:-}" == postgres://migration-test ]]
printf 'GOOSE_DRIVER=%s\nGOOSE_DBSTRING_SET=true\n' "\${GOOSE_DRIVER}" >"${goose_environment}"
printf '%s\n' "\$@" >"${goose_arguments}"
EOF
chmod 0755 "${test_goose}"
sed \
    -e "s|/etc/jl-business-growth/jl-business-growth.env|${test_environment_file}|g" \
    -e "s|/etc/jl-business-growth|${test_environment_parent}|g" \
    -e "s|/opt/jl-business-growth/releases|${test_releases_root}|g" \
    -e "s|/usr/bin/goose|${test_goose}|g" \
    -e 's#"${environment_parent}" 0 ||#"${environment_parent}" '"$(id -u)"' ||#' \
    "${helper}" >"${test_helper}"
chmod 0755 "${test_helper}"
"${test_helper}" v1.2.3
grep -Fxq 'GOOSE_DRIVER=postgres' "${goose_environment}"
grep -Fxq 'GOOSE_DBSTRING_SET=true' "${goose_environment}"
printf '%s\n' -dir "${test_migrations_root}" up >"${test_root}/expected.arguments"
cmp -s "${test_root}/expected.arguments" "${goose_arguments}"
! grep -Fq 'postgres://migration-test' "${goose_arguments}"
! grep -Fxq postgres "${goose_arguments}"

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
if validate_environment_file "${environment_file}" "${environment_parent}" "$(id -u)" "${wrong_owner_uid}"; then
    echo 'migration helper accepted unexpected EnvironmentFile parent owner' >&2
    exit 1
fi

printf 'migration helper validation tests: PASS\n'
