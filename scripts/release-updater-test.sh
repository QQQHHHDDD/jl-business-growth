#!/usr/bin/env bash
set -euo pipefail

# Execution-level updater regression harness. It uses only temporary files and
# stubbed database/service/network commands; it never touches systemd or a
# production database.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
updater="${repo_root}/scripts/release-updater.sh"
root="$(mktemp -d)"
trap 'if [[ "${KEEP_TMP:-false}" != true ]]; then rm -rf "${root}"; else printf "retaining harness temp root: %s\n" "${root}" >&2; fi' EXIT
bin="${root}/bin"
runtime="${root}/runtime"
backend_releases="${root}/backend-releases"
web_releases="${root}/web-releases"
fixture="${root}/fixture"
mkdir -p "${bin}" "${runtime}" "${backend_releases}" "${web_releases}" "${fixture}"

cat >"${bin}/psql" <<'EOF'
#!/usr/bin/env bash
cat "${SCHEMA_FILE}"
EOF
cat >"${bin}/goose" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${GOOSE_SCHEMA:-}" ]]; then printf '%s\n' "${GOOSE_SCHEMA}" >"${SCHEMA_FILE}"; fi
EOF
cat >"${bin}/pg_dump" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"${bin}/systemctl" <<'EOF'
#!/usr/bin/env bash
if [[ "${RELEASE_SYSTEMCTL_FAIL:-false}" == true ]]; then exit 1; fi
if [[ "${RELEASE_SYSTEMCTL_SLEEP:-false}" == true ]]; then
  : >"${SYSTEMCTL_MARKER}"
  while [[ ! -f "${SYSTEMCTL_RELEASE_MARKER}" ]]; do sleep 0.05; done
fi
exit 0
EOF
cat >"${bin}/curl" <<'EOF'
#!/usr/bin/env bash
output=""
url=""
previous=""
for arg in "$@"; do
  if [[ "${previous}" == --output ]]; then output="${arg}"; fi
  previous="${arg}"
  url="${arg}"
done
if [[ -n "${output}" ]]; then
  cp "${FIXTURE_ROOT}/$(basename "${url}")" "${output}"
  exit 0
fi
current="$(readlink -f "${RELEASE_BACKEND_CURRENT}")"
if [[ "${RELEASE_HEALTH_FAIL_TARGET:-false}" == true && "${current}" == *"/v1.0.1" ]]; then exit 22; fi
exit 0
EOF
chmod +x "${bin}"/*

make_release() {
  local version="$1" schema="$2" minimum="$3" maximum="$4" commit="$5"
  local root_dir="${root}/${version}"
  rm -rf "${root_dir}"
  mkdir -p "${root_dir}/web" "${root_dir}/migrations" "${root_dir}/scripts"
  for binary in jl-business-api jl-business-jobs; do
    cat >"${root_dir}/${binary}" <<EOF
#!/usr/bin/env bash
printf '%s\n' '{"version":"${version}","commit":"${commit}","built_at":"2026-09-19T00:00:00Z"}'
EOF
    chmod +x "${root_dir}/${binary}"
  done
  printf '<html></html>\n' >"${root_dir}/web/index.html"
  printf -- '-- +goose Up\n-- +goose Down\n' >"${root_dir}/migrations/$(printf '%05d' "${schema}")_test.sql"
  cat >"${root_dir}/scripts/backup-db.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "${root_dir}/scripts/backup-db.sh"
  cat >"${root_dir}/release.json" <<EOF
{"version":"${version}","git_sha":"${commit}","built_at":"2026-09-19T00:00:00Z","platform":"linux-amd64","schema_version":${schema},"compatible_schema_min":${minimum},"compatible_schema_max":${maximum}}
EOF
  tar -C "${root_dir}" -czf "${fixture}/jl-business-growth_${version}_linux_amd64.tar.gz" .
  (cd "${fixture}" && sha256sum -- *.tar.gz >SHA256SUMS)
}

repack_release() {
  local version="$1"
  tar -C "${root}/${version}" -czf "${fixture}/jl-business-growth_${version}_linux_amd64.tar.gz" .
  (cd "${fixture}" && sha256sum -- *.tar.gz >SHA256SUMS)
}

reset_case() {
  rm -rf "${runtime}" "${backend_releases}" "${web_releases}"
  rm -f "${root}/backend-current" "${root}/web-current"
  mkdir -p "${runtime}" "${backend_releases}" "${web_releases}"
  printf '10\n' >"${root}/schema"
  mkdir -p "${backend_releases}/v1.0.0/scripts" "${web_releases}/v1.0.0"
  cp "${root}/v1.0.0/release.json" "${backend_releases}/v1.0.0/release.json"
  cp "${root}/v1.0.0/jl-business-api" "${backend_releases}/v1.0.0/jl-business-api"
  cp "${root}/v1.0.0/jl-business-jobs" "${backend_releases}/v1.0.0/jl-business-jobs"
  cp -R "${root}/v1.0.0/migrations" "${backend_releases}/v1.0.0/"
  cp "${root}/v1.0.0/scripts/backup-db.sh" "${backend_releases}/v1.0.0/scripts/"
  chmod +x "${backend_releases}/v1.0.0"/jl-business-* "${backend_releases}/v1.0.0/scripts/backup-db.sh"
  printf '<html></html>\n' >"${web_releases}/v1.0.0/index.html"
  ln -s "${backend_releases}/v1.0.0" "${root}/backend-current"
  ln -s "${web_releases}/v1.0.0" "${root}/web-current"
}

run_updater() {
  PATH="${bin}:${PATH}" \
  RELEASE_UPDATE_ENABLED=true RELEASE_RUNTIME_ROOT="${runtime}" \
  RELEASE_BACKEND_ROOT="${backend_releases}" RELEASE_WEB_ROOT="${web_releases}" \
  RELEASE_BACKEND_CURRENT="${root}/backend-current" RELEASE_WEB_CURRENT="${root}/web-current" \
  RELEASE_DOWNLOAD_BASE="file://${fixture}" RELEASE_API_HEALTH="http://test/api/health" \
  RELEASE_HEALTH_ATTEMPTS=1 RELEASE_HEALTH_RETRY_DELAY=0 DATABASE_URL=test \
  SCHEMA_FILE="${root}/schema" FIXTURE_ROOT="${fixture}" "$updater"
}

run_case() {
  if [[ "${DEBUG_HARNESS:-false}" == true ]]; then
    run_updater
  else
    run_updater >/dev/null 2>&1
  fi
}

request() {
  local target="$1"
  cat >"${runtime}/request.json" <<EOF
{"request_id":"11111111-1111-4111-8111-111111111111","action":"update","from_version":"v1.0.0","target_version":"${target}","repository":"QQQHHHDDD/jl-business-growth"}
EOF
  printf '11111111-1111-4111-8111-111111111111\n' >"${runtime}/update.lock"
}

make_release v1.0.0 10 10 11 old-commit
make_release v1.0.1 10 10 10 target-commit
reset_case
request v1.0.1
printf '11\n' >"${root}/schema"
if run_case; then echo 'schema gate unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 11 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${runtime}/request.json" ]] && [[ ! -e "${runtime}/update.lock" ]]

make_release v1.0.1 12 12 12 target-commit
reset_case
request v1.0.1
GOOSE_SCHEMA=11; export GOOSE_SCHEMA
if run_case; then echo 'post-migration compatibility unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 11 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${runtime}/request.json" ]] && [[ ! -e "${runtime}/update.lock" ]]

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true
if run_case; then echo 'health failure unexpectedly succeeded' >&2; exit 1; fi
grep -Fq '应用版本已恢复' "${runtime}/status.json"
[[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.0" ]]

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
make_release v1.0.0 10 10 10 old-commit
cp "${root}/v1.0.0/release.json" "${backend_releases}/v1.0.0/release.json"
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true
if run_case; then echo 'incompatible restore unexpectedly succeeded' >&2; exit 1; fi
grep -Fq '旧版本不兼容' "${runtime}/status.json"
[[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.1" ]]

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true RELEASE_SYSTEMCTL_FAIL=true
if run_case; then echo 'restore failure unexpectedly succeeded' >&2; exit 1; fi
! grep -Fq '应用版本已恢复' "${runtime}/status.json"
[[ ! -e "${runtime}/request.json" ]] && [[ ! -e "${runtime}/update.lock" ]]

unset RELEASE_HEALTH_FAIL_TARGET RELEASE_SYSTEMCTL_FAIL GOOSE_SCHEMA

# A checksum mismatch must be rejected before the database migration starts.
make_release v1.0.1 11 11 11 target-commit
printf '%064d  %s\n' 0 'jl-business-growth_v1.0.1_linux_amd64.tar.gz' >"${fixture}/SHA256SUMS"
reset_case
request v1.0.1
if run_case; then echo 'checksum failure unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 10 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${runtime}/request.json" ]] && [[ ! -e "${runtime}/update.lock" ]]

# A missing required artifact must also fail before migration.
make_release v1.0.1 11 11 11 target-commit
rm -f "${root}/v1.0.1/web/index.html"
repack_release v1.0.1
reset_case
request v1.0.1
if run_case; then echo 'missing artifact unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 10 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${runtime}/request.json" ]] && [[ ! -e "${runtime}/update.lock" ]]

# A duplicate runner must not clean up a request owned by the active runner.
make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_SYSTEMCTL_SLEEP=true
export SYSTEMCTL_MARKER="${root}/systemctl.started" SYSTEMCTL_RELEASE_MARKER="${root}/systemctl.release"
run_updater >/dev/null 2>&1 &
first_runner_pid=$!
for _ in $(seq 1 100); do
  [[ -e "${root}/systemctl.started" ]] && break
  sleep 0.05
done
[[ -e "${root}/systemctl.started" ]]
if run_case; then echo 'duplicate runner unexpectedly succeeded' >&2; exit 1; fi
[[ -e "${runtime}/request.json" ]] && [[ -e "${runtime}/update.lock" ]]
touch "${root}/systemctl.release"
wait "${first_runner_pid}"
[[ ! -e "${runtime}/request.json" ]] && [[ ! -e "${runtime}/update.lock" ]]

unset RELEASE_SYSTEMCTL_SLEEP GOOSE_SCHEMA SYSTEMCTL_MARKER SYSTEMCTL_RELEASE_MARKER

reset_case
printf '{malformed' >"${runtime}/request.json"
printf 'stale-lock\n' >"${runtime}/update.lock"
if run_case; then echo 'malformed request unexpectedly succeeded' >&2; exit 1; fi
[[ ! -e "${runtime}/request.json" ]] && [[ ! -e "${runtime}/update.lock" ]]
run_case

printf 'release updater execution harness: PASS\n'
