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
requests="${runtime}/requests"
state="${runtime}/state"
work="${runtime}/work"
backend_releases="${root}/backend-releases"
web_releases="${root}/web-releases"
fixture="${root}/fixture"
mkdir -p "${bin}" "${runtime}" "${backend_releases}" "${web_releases}" "${fixture}"

# The API remains startable when online update is disabled and the optional
# requests directory has not been provisioned yet.
grep -Fq 'ReadWritePaths=/var/lib/jl-business-growth/files /var/lib/jl-business-growth/tmp -/var/lib/jl-business-growth/release-updater/requests' "${repo_root}/deploy/systemd/jl-business-api.service"
grep -Fq 'ReadWritePaths=/opt/jl-business-growth /var/www/jl-business-growth' "${repo_root}/deploy/systemd/jl-business-updater.service"
! grep -Fq 'ReadWritePaths=/var/backups/jl-business-growth' "${repo_root}/deploy/systemd/jl-business-updater.service"
grep -Fq 'User=jl-business' "${repo_root}/deploy/systemd/jl-business-backup.service"
grep -Fq 'Group=jl-business' "${repo_root}/deploy/systemd/jl-business-backup.service"
! grep -Fq 'verify_binary_metadata' "${updater}"
! grep -Fq -- ' --version' "${updater}"
! grep -Fq 'trusted_backup_helper' "${updater}"
! grep -Fq '/usr/local/libexec/jl-business-backup-db' "${updater}"
! grep -Eq 'goose[[:space:]].*down' "${updater}"
! grep -Fq 'GOOSE_BIN' "${updater}"
grep -Fq 'validate_production_application_roots' "${updater}"
grep -Fq 'backend_app_root="/opt/jl-business-growth"' "${updater}"
grep -Fq 'web_app_root="/var/www/jl-business-growth"' "${updater}"
grep -Fq 'mktemp -d /var/tmp/jl-business-growth.XXXXXX' "${repo_root}/scripts/deploy-prod.sh.example"
! grep -Fq 'remote_staging="/var/tmp/jl-business-growth/${RELEASE_VERSION}"' "${repo_root}/scripts/deploy-prod.sh.example"

cat >"${bin}/psql" <<'EOF'
#!/usr/bin/env bash
cat "${SCHEMA_FILE}"
EOF
cat >"${bin}/goose" <<'EOF'
#!/usr/bin/env bash
if [[ "${GOOSE_DRIVER:-}" != postgres || -z "${GOOSE_DBSTRING:-}" ]]; then
  exit 97
fi
if [[ "$#" -ne 3 || "$1" != -dir || "$3" != up || "$2" != */extract/migrations ]]; then
  exit 98
fi
for argument in "$@"; do
  [[ "${argument}" != "${GOOSE_DBSTRING}" ]] || exit 99
done
if [[ -n "${GOOSE_INVOCATION_MARKER:-}" ]]; then
  {
    printf 'driver=%s\n' "${GOOSE_DRIVER}"
    printf 'dbstring_set=true\n'
    printf 'argv=%s\n' "$*"
  } >"${GOOSE_INVOCATION_MARKER}"
fi
if [[ -n "${BACKUP_MARKER:-}" && ! -e "${BACKUP_MARKER}" ]]; then exit 1; fi
if [[ -n "${MIGRATION_MARKER:-}" ]]; then : >"${MIGRATION_MARKER}"; fi
if [[ -n "${GOOSE_SCHEMA:-}" ]]; then printf '%s\n' "${GOOSE_SCHEMA}" >"${SCHEMA_FILE}"; fi
EOF
cat >"${bin}/pg_dump" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"${bin}/systemctl" <<'EOF'
#!/usr/bin/env bash
if [[ "${RELEASE_SYSTEMCTL_FAIL:-false}" == true ]]; then exit 1; fi
current="$(readlink -f "${RELEASE_BACKEND_CURRENT}")"
service="${*: -1}"
if [[ "${1:-}" == start && "${service}" == jl-business-backup.service ]]; then
  : >"${BACKUP_SERVICE_START_MARKER}"
  if [[ "${RELEASE_BACKUP_SERVICE_FAIL:-false}" == true ]]; then exit 1; fi
  : >"${BACKUP_MARKER}"
  exit 0
fi
if [[ "${current}" == *"/v1.0.0" && "${service}" == jl-business-api.service && "${RELEASE_RESTORE_API_SYSTEMCTL_FAIL:-false}" == true ]]; then exit 1; fi
if [[ "${current}" == *"/v1.0.0" && "${service}" == jl-business-jobs.timer && "${RELEASE_RESTORE_JOBS_SYSTEMCTL_FAIL:-false}" == true ]]; then exit 1; fi
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
if [[ "${RELEASE_HEALTH_FAIL_RESTORED_LIVE:-false}" == true && "${current}" == *"/v1.0.0" && "${url}" == */live ]]; then exit 22; fi
if [[ "${RELEASE_HEALTH_FAIL_RESTORED_READY:-false}" == true && "${current}" == *"/v1.0.0" && "${url}" == */ready ]]; then exit 22; fi
exit 0
EOF
cat >"${bin}/ln" <<'EOF'
#!/usr/bin/env bash
source_path="${*: -2:1}"
destination="${*: -1}"
if [[ "${source_path}" == *"/v1.0.0" && "${destination}" == "${RELEASE_BACKEND_CURRENT}" && "${RELEASE_RESTORE_BACKEND_LINK_FAIL:-false}" == true ]]; then exit 1; fi
if [[ "${source_path}" == *"/v1.0.0" && "${destination}" == "${RELEASE_WEB_CURRENT}" && "${RELEASE_RESTORE_WEB_LINK_FAIL:-false}" == true ]]; then exit 1; fi
exec /usr/bin/ln "$@"
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
if [[ -n "\${BINARY_EXECUTED_MARKER:-}" ]]; then : >"\${BINARY_EXECUTED_MARKER}"; fi
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
  rm -f "${root}/backup.called" "${root}/backup-service.started" "${root}/migration.called" "${root}/binary-executed" "${root}/direct-backup.called" "${root}/goose.invocation"
  mkdir -p "${requests}" "${state}" "${work}" "${backend_releases}" "${web_releases}"
  chmod 0750 "${runtime}"
  chmod 0770 "${requests}"; chmod 0750 "${state}"; chmod 0700 "${work}"
  cat >"${runtime}/trusted-backup-db" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${DIRECT_BACKUP_MARKER:-}" ]]; then : >"${DIRECT_BACKUP_MARKER}"; fi
exit 99
EOF
  chmod 0755 "${runtime}/trusted-backup-db"
  printf '10\n' >"${root}/schema"
  mkdir -p "${backend_releases}/v1.0.0/scripts" "${web_releases}/v1.0.0"
  cp "${root}/v1.0.0/release.json" "${backend_releases}/v1.0.0/release.json"
  cp "${root}/v1.0.0/jl-business-api" "${backend_releases}/v1.0.0/jl-business-api"
  cp "${root}/v1.0.0/jl-business-jobs" "${backend_releases}/v1.0.0/jl-business-jobs"
  cp -R "${root}/v1.0.0/migrations" "${backend_releases}/v1.0.0/"
  cp "${root}/v1.0.0/scripts/backup-db.sh" "${backend_releases}/v1.0.0/scripts/"
  find "${backend_releases}" -type d -exec chmod 0755 {} +
  find "${backend_releases}" -type f -exec chmod 0644 {} +
  chmod 0755 "${backend_releases}/v1.0.0"/jl-business-* "${backend_releases}/v1.0.0/scripts/backup-db.sh"
  printf '<html></html>\n' >"${web_releases}/v1.0.0/index.html"
  ln -s "${backend_releases}/v1.0.0" "${root}/backend-current"
  ln -s "${web_releases}/v1.0.0" "${root}/web-current"
}

run_updater() {
  local timeout_command=()
  if [[ -n "${RUN_UPDATER_TIMEOUT:-}" ]]; then
    timeout_command=(timeout "${RUN_UPDATER_TIMEOUT}")
  fi
  umask 077
  "${timeout_command[@]}" env \
    PATH="${bin}:${PATH}" \
    RELEASE_UPDATE_ENABLED="${RELEASE_UPDATE_ENABLED_OVERRIDE:-true}" RELEASE_RUNTIME_ROOT="${runtime}" \
    RELEASE_BACKEND_ROOT="${backend_releases}" RELEASE_WEB_ROOT="${web_releases}" \
    RELEASE_BACKEND_CURRENT="${root}/backend-current" RELEASE_WEB_CURRENT="${root}/web-current" \
    RELEASE_DOWNLOAD_BASE="file://${fixture}" RELEASE_API_HEALTH="http://test/api/health" \
    RELEASE_HEALTH_ATTEMPTS=1 RELEASE_HEALTH_RETRY_DELAY=0 DATABASE_URL=test \
    SCHEMA_FILE="${root}/schema" FIXTURE_ROOT="${fixture}" BACKUP_MARKER="${root}/backup.called" \
    BACKUP_SERVICE_START_MARKER="${root}/backup-service.started" MIGRATION_MARKER="${root}/migration.called" \
    GOOSE_INVOCATION_MARKER="${root}/goose.invocation" \
    BINARY_EXECUTED_MARKER="${root}/binary-executed" DIRECT_BACKUP_MARKER="${root}/direct-backup.called" "$updater"
}

run_case() {
  if [[ "${DEBUG_HARNESS:-false}" == true ]]; then
    run_updater
  else
    run_updater >/dev/null 2>&1
  fi
}

write_request() {
  local request_id="$1" action="$2" from_version="$3" target_version="$4" requested_repository="$5"
  cat >"${requests}/request.json" <<EOF
{"request_id":"${request_id}","action":"${action}","from_version":"${from_version}","target_version":"${target_version}","repository":"${requested_repository}"}
EOF
  printf '%s\n' "${request_id}" >"${requests}/update.lock"
}

request() {
  write_request '11111111-1111-4111-8111-111111111111' 'update' 'v1.0.0' "$1" 'QQQHHHDDD/jl-business-growth'
}

rollback_request() {
  write_request '22222222-2222-4222-8222-222222222222' 'rollback' 'v1.0.1' 'v1.0.0' 'QQQHHHDDD/jl-business-growth'
}

reset_rollback_case() {
  reset_case
  rm -rf "${backend_releases}/v1.0.1" "${web_releases}/v1.0.1"
  mkdir -p "${backend_releases}/v1.0.1" "${web_releases}/v1.0.1"
  cp -a "${root}/v1.0.1/." "${backend_releases}/v1.0.1/"
  cp "${root}/v1.0.1/web/index.html" "${web_releases}/v1.0.1/index.html"
  find "${backend_releases}" -type d -exec chmod 0755 {} +
  find "${backend_releases}" -type f -exec chmod 0644 {} +
  chmod 0755 "${backend_releases}/v1.0.0"/jl-business-* "${backend_releases}/v1.0.0/scripts/backup-db.sh" \
    "${backend_releases}/v1.0.1"/jl-business-* "${backend_releases}/v1.0.1/scripts/backup-db.sh"
  rm -f "${root}/backend-current" "${root}/web-current"
  ln -s "${backend_releases}/v1.0.1" "${root}/backend-current"
  ln -s "${web_releases}/v1.0.1" "${root}/web-current"
}

assert_failed_cleanup() {
  local expected_message="$1"
  jq -e --arg message "${expected_message}" '.state == "failed" and .safe_message == $message' "${state}/status.json" >/dev/null
  [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
}

assert_no_migration_or_switch() {
  [[ "$(cat "${root}/schema")" == 10 ]]
  [[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.0" ]]
  [[ "$(readlink -f "${root}/web-current")" == "${web_releases}/v1.0.0" ]]
  [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${web_releases}/v1.0.1" ]]
}

assert_not_restored() {
  [[ -f "${state}/status.json" ]]
  jq -e '.state == "failed"' "${state}/status.json" >/dev/null
  ! grep -Fq '应用版本已恢复' "${state}/status.json"
  [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
}

assert_rejected_request() {
  local expected_message="$1"
  jq -e --arg message "${expected_message}" '.state == "failed" and .safe_message == $message' "${state}/status.json" >/dev/null
  [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
  [[ ! -e "${root}/backup.called" ]]
  assert_no_migration_or_switch
}

assert_successful_update() {
  jq -e '.state == "succeeded"' "${state}/status.json" >/dev/null
  [[ -e "${root}/backup.called" ]]
  [[ -e "${root}/backup-service.started" ]]
  [[ -e "${root}/migration.called" ]]
  [[ -f "${root}/goose.invocation" ]]
  grep -Fxq 'driver=postgres' "${root}/goose.invocation"
  grep -Fxq 'dbstring_set=true' "${root}/goose.invocation"
  local goose_argv
  goose_argv="$(sed -n 's/^argv=//p' "${root}/goose.invocation")"
  [[ "${goose_argv}" == "-dir ${root}/runtime/work/run."*/extract/migrations\ up ]]
  [[ "${goose_argv}" != *postgres* ]]
  [[ "${goose_argv}" != *test* ]]
  [[ ! -e "${root}/direct-backup.called" ]]
  [[ ! -e "${root}/binary-executed" ]]
  [[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.1" ]]
  [[ "$(readlink -f "${root}/web-current")" == "${web_releases}/v1.0.1" ]]
  [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
}

assert_target_permissions() {
  local expected_owner
  expected_owner="$(id -un)"
  [[ "$(stat -c '%U' "${backend_releases}/v1.0.1")" == "${expected_owner}" ]]
  [[ "$(stat -c '%U' "${web_releases}/v1.0.1")" == "${expected_owner}" ]]
  [[ "$(stat -c '%a' "${backend_releases}/v1.0.1")" == 755 ]]
  [[ "$(stat -c '%a' "${web_releases}/v1.0.1")" == 755 ]]
  [[ "$(stat -c '%a' "${backend_releases}/v1.0.1/jl-business-api")" == 755 ]]
  [[ "$(stat -c '%a' "${backend_releases}/v1.0.1/jl-business-jobs")" == 755 ]]
  [[ "$(stat -c '%a' "${backend_releases}/v1.0.1/release.json")" == 644 ]]
  [[ "$(stat -c '%a' "${web_releases}/v1.0.1/index.html")" == 644 ]]
  [[ -x "${web_releases}/v1.0.1" ]]
  [[ -r "${web_releases}/v1.0.1/index.html" ]]
  local bad_permissions
  bad_permissions="$(find "${backend_releases}/v1.0.1" "${web_releases}/v1.0.1" -perm /022 -print -quit)"
  [[ -z "${bad_permissions}" ]]
}

assert_successful_rollback() {
  jq -e '.state == "succeeded"' "${state}/status.json" >/dev/null
  [[ -e "${root}/backup.called" ]] && [[ -e "${root}/backup-service.started" ]]
  [[ ! -e "${root}/migration.called" ]] && [[ ! -e "${root}/binary-executed" ]] && [[ ! -e "${root}/direct-backup.called" ]]
  [[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.0" ]]
  [[ "$(readlink -f "${root}/web-current")" == "${web_releases}/v1.0.0" ]]
  [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
}

assert_rejected_rollback() {
  local expected_message="$1"
  jq -e --arg message "${expected_message}" '.state == "failed" and .safe_message == $message' "${state}/status.json" >/dev/null
  [[ ! -e "${root}/backup-service.started" ]] && [[ ! -e "${root}/migration.called" ]]
  [[ "$(cat "${root}/schema")" == 10 ]]
  [[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.1" ]]
  [[ "$(readlink -f "${root}/web-current")" == "${web_releases}/v1.0.1" ]]
  [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
}

pass_case() {
  printf 'PASS: %s\n' "$1"
}

make_release v1.0.0 10 10 11 old-commit
make_release v1.0.1 10 10 10 target-commit

reset_case
request v1.0.1
if RELEASE_UPDATE_ENABLED_OVERRIDE=false run_case; then echo 'disabled updater unexpectedly succeeded' >&2; exit 1; fi
assert_failed_cleanup '在线更新未启用'
assert_no_migration_or_switch
pass_case 'RELEASE_UPDATE_ENABLED=false cleans owned request and lock without migration or switch'

reset_case
write_request '' 'update' 'v1.0.0' 'v1.0.1' 'QQQHHHDDD/jl-business-growth'
if run_case; then echo 'invalid request_id unexpectedly succeeded' >&2; exit 1; fi
assert_failed_cleanup '版本任务请求 ID 无效'
assert_no_migration_or_switch
pass_case 'invalid request_id cleanup'

reset_case
write_request '11111111-1111-4111-8111-111111111111' 'update' 'invalid' 'v1.0.1' 'QQQHHHDDD/jl-business-growth'
if run_case; then echo 'invalid from_version unexpectedly succeeded' >&2; exit 1; fi
assert_failed_cleanup '版本任务来源版本无效'
assert_no_migration_or_switch
pass_case 'invalid from_version cleanup'

reset_case
write_request '11111111-1111-4111-8111-111111111111' 'update' 'v1.0.0' 'invalid' 'QQQHHHDDD/jl-business-growth'
if run_case; then echo 'invalid target_version unexpectedly succeeded' >&2; exit 1; fi
assert_failed_cleanup '版本任务目标版本无效'
assert_no_migration_or_switch
pass_case 'invalid target_version cleanup'

reset_case
write_request '11111111-1111-4111-8111-111111111111' 'invalid' 'v1.0.0' 'v1.0.1' 'QQQHHHDDD/jl-business-growth'
if run_case; then echo 'invalid action unexpectedly succeeded' >&2; exit 1; fi
assert_failed_cleanup '版本任务操作无效'
assert_no_migration_or_switch
pass_case 'invalid action cleanup'

reset_case
write_request '11111111-1111-4111-8111-111111111111' 'update' 'v1.0.0' 'v1.0.1' 'invalid/repository'
if run_case; then echo 'invalid repository unexpectedly succeeded' >&2; exit 1; fi
assert_failed_cleanup '版本任务仓库无效'
assert_no_migration_or_switch
pass_case 'invalid repository cleanup'

reset_case
request v1.0.1
mv "${bin}/goose" "${bin}/goose.unavailable"
if run_case; then echo 'missing required command unexpectedly succeeded' >&2; exit 1; fi
mv "${bin}/goose.unavailable" "${bin}/goose"
assert_failed_cleanup '版本任务缺少必需命令：goose'
assert_no_migration_or_switch
pass_case 'missing required command cleanup'

reset_case
request v1.0.1
if ! run_case; then echo 'normal claimed request unexpectedly failed' >&2; exit 1; fi
assert_successful_update
assert_target_permissions
pass_case 'application request is safely claimed, processed, and target permissions normalized under umask 077'

reset_case
request v1.0.1
if RELEASE_BACKUP_SERVICE_FAIL=true run_case; then echo 'backup service failure unexpectedly succeeded' >&2; exit 1; fi
assert_failed_cleanup '数据库备份失败，需要人工处理'
[[ -e "${root}/backup-service.started" ]] && [[ ! -e "${root}/migration.called" ]] && [[ ! -e "${root}/direct-backup.called" ]]
assert_no_migration_or_switch
pass_case 'backup service start failure blocks migration'

reset_case
request v1.0.1
if RELEASE_BACKUP_SERVICE_FAIL=true run_case; then echo 'backup failure unexpectedly switched symlinks' >&2; exit 1; fi
assert_not_restored
[[ -e "${root}/backup-service.started" ]] && [[ ! -e "${root}/migration.called" ]]
[[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.0" ]]
[[ "$(readlink -f "${root}/web-current")" == "${web_releases}/v1.0.0" ]]
pass_case 'backup service failure leaves symlinks unchanged'

unset RELEASE_BACKUP_SERVICE_FAIL

reset_rollback_case
rollback_request
if ! run_case; then echo 'rollback request unexpectedly failed' >&2; exit 1; fi
assert_successful_rollback
pass_case 'rollback action validates installed backend/web, backs up, and switches without migration'

reset_rollback_case
rm -rf "${backend_releases}/v1.0.0/migrations"
rollback_request
if run_case; then echo 'rollback missing migrations unexpectedly succeeded' >&2; exit 1; fi
assert_rejected_rollback '已安装 rollback backend release 校验失败'
pass_case 'rollback missing migrations is rejected before backup'

reset_rollback_case
rm -f "${web_releases}/v1.0.0/index.html"
rollback_request
if run_case; then echo 'rollback missing web index unexpectedly succeeded' >&2; exit 1; fi
assert_rejected_rollback '已安装 rollback web release 校验失败'
pass_case 'rollback missing web index is rejected before backup'

reset_case
request v1.0.1
mv "${requests}/request.json" "${requests}/request-target.json"
ln -s "${requests}/request-target.json" "${requests}/request.json"
if run_case; then echo 'symlink request unexpectedly succeeded' >&2; exit 1; fi
assert_rejected_request '版本任务请求必须是 regular file，拒绝执行'
pass_case 'symlink request is rejected without following it'

reset_case
request v1.0.1
mv "${requests}/update.lock" "${requests}/update-lock-target"
ln -s "${requests}/update-lock-target" "${requests}/update.lock"
if ! run_case; then echo 'symlink update.lock unexpectedly failed' >&2; exit 1; fi
assert_successful_update
[[ -f "${requests}/update-lock-target" ]]
pass_case 'symlink update.lock is unlinked without being read or followed'

reset_case
request v1.0.1
rm -f "${requests}/update.lock"
mkfifo "${requests}/update.lock"
if ! RUN_UPDATER_TIMEOUT=5 run_case; then echo 'FIFO update.lock unexpectedly failed or blocked' >&2; exit 1; fi
assert_successful_update
pass_case 'FIFO update.lock is unlinked without blocking'

reset_case
request v1.0.1
rm -f "${requests}/request.json"
mkdir "${requests}/request.json"
if run_case; then echo 'directory request unexpectedly succeeded' >&2; exit 1; fi
assert_rejected_request '版本任务请求必须是 regular file，拒绝执行'
pass_case 'directory request is rejected'

reset_case
request v1.0.1
rm -f "${requests}/request.json"
mkfifo "${requests}/request.json"
if run_case; then echo 'FIFO request unexpectedly succeeded' >&2; exit 1; fi
assert_rejected_request '版本任务请求必须是 regular file，拒绝执行'
pass_case 'FIFO request is rejected without blocking'

reset_case
chmod 0550 "${state}"
if (printf 'forged\n' >"${state}/status.json") 2>/dev/null; then echo 'application wrote authoritative status' >&2; exit 1; fi
chmod 0750 "${state}"
pass_case 'application cannot overwrite authoritative status directory'

reset_case
chmod 0500 "${work}"
if (printf 'forged\n' >"${work}/runner.lock") 2>/dev/null; then echo 'application created runner lock' >&2; exit 1; fi
chmod 0700 "${work}"
pass_case 'application cannot create or replace root runner lock'

reset_case
write_request '11111111-1111-4111-8111-111111111111' 'update' 'v1.0.0' 'v1.0.1' 'QQQHHHDDD/jl-business-growth'
jq '. + {backup_command:"/tmp/attacker-backup", backup_path:"/tmp/attacker-backup"}' "${requests}/request.json" >"${requests}/request.json.tmp"
mv "${requests}/request.json.tmp" "${requests}/request.json"
if ! run_case; then echo 'request backup override unexpectedly failed' >&2; exit 1; fi
assert_successful_update
pass_case 'request cannot select backup command or path'

reset_case
chmod 0775 "${backend_releases}/v1.0.0"
request v1.0.1
if run_case; then echo 'writable current release unexpectedly succeeded' >&2; exit 1; fi
assert_rejected_request '当前 backend release 权限不安全，拒绝执行版本任务'
pass_case 'writable current release fails before helper or migration'

reset_case
request v1.0.1
printf '11\n' >"${root}/schema"
if run_case; then echo 'schema gate unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 11 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]

make_release v1.0.1 12 12 12 target-commit
reset_case
request v1.0.1
GOOSE_SCHEMA=11; export GOOSE_SCHEMA
if run_case; then echo 'post-migration compatibility unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 11 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true
if run_case; then echo 'health failure unexpectedly succeeded' >&2; exit 1; fi
grep -Fq '应用版本已恢复' "${state}/status.json"
[[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.0" ]]
[[ "$(readlink -f "${root}/web-current")" == "${web_releases}/v1.0.0" ]]
[[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
pass_case 'all restore conditions succeed and status says application restored'

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
make_release v1.0.0 10 10 10 old-commit
cp "${root}/v1.0.0/release.json" "${backend_releases}/v1.0.0/release.json"
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true
if run_case; then echo 'incompatible restore unexpectedly succeeded' >&2; exit 1; fi
grep -Fq '旧版本不兼容' "${state}/status.json"
[[ "$(readlink -f "${root}/backend-current")" == "${backend_releases}/v1.0.1" ]]
pass_case 'incompatible restore does not claim restored'

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true RELEASE_RESTORE_BACKEND_LINK_FAIL=true
if run_case; then echo 'restore failure unexpectedly succeeded' >&2; exit 1; fi
assert_not_restored
pass_case 'restore backend symlink failure does not claim restored'

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true RELEASE_RESTORE_WEB_LINK_FAIL=true
if run_case; then echo 'restore web link failure unexpectedly succeeded' >&2; exit 1; fi
assert_not_restored
pass_case 'restore web symlink failure does not claim restored'

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true RELEASE_RESTORE_API_SYSTEMCTL_FAIL=true
if run_case; then echo 'restore API restart failure unexpectedly succeeded' >&2; exit 1; fi
assert_not_restored
pass_case 'restore API systemctl failure does not claim restored'

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true RELEASE_RESTORE_JOBS_SYSTEMCTL_FAIL=true
if run_case; then echo 'restore jobs restart failure unexpectedly succeeded' >&2; exit 1; fi
assert_not_restored
pass_case 'restore jobs systemctl failure does not claim restored'

make_release v1.0.1 11 11 11 target-commit
reset_case
request v1.0.1
export GOOSE_SCHEMA=11 RELEASE_HEALTH_FAIL_TARGET=true RELEASE_HEALTH_FAIL_RESTORED_READY=true
if run_case; then echo 'restored health failure unexpectedly succeeded' >&2; exit 1; fi
assert_not_restored
pass_case 'restored ready health failure does not claim restored'

unset RELEASE_HEALTH_FAIL_TARGET RELEASE_RESTORE_BACKEND_LINK_FAIL RELEASE_RESTORE_WEB_LINK_FAIL RELEASE_RESTORE_API_SYSTEMCTL_FAIL RELEASE_RESTORE_JOBS_SYSTEMCTL_FAIL RELEASE_HEALTH_FAIL_RESTORED_READY GOOSE_SCHEMA

# Archive members must not be symlinks because the updater verifies binaries as
# root before installing them.
for symlink_case in binary release-json web-index; do
  make_release v1.0.1 11 11 11 target-commit
  case "${symlink_case}" in
    binary)
      mv "${root}/v1.0.1/jl-business-api" "${root}/v1.0.1/jl-business-api.real"
      ln -s jl-business-api.real "${root}/v1.0.1/jl-business-api"
      ;;
    release-json)
      mv "${root}/v1.0.1/release.json" "${root}/v1.0.1/release.json.real"
      ln -s release.json.real "${root}/v1.0.1/release.json"
      ;;
    web-index)
      mv "${root}/v1.0.1/web/index.html" "${root}/v1.0.1/web/index.real"
      ln -s index.real "${root}/v1.0.1/web/index.html"
      ;;
  esac
  repack_release v1.0.1
  reset_case
  request v1.0.1
  if run_case; then echo "${symlink_case} archive unexpectedly succeeded" >&2; exit 1; fi
  assert_rejected_request 'Release archive 包含 symlink 或文件类型不安全'
  pass_case "release archive ${symlink_case} symlink is rejected before migration"
done

# Existing runtime symlinks must never be followed or chmodded by bootstrap.
reset_case
request v1.0.1
state_target="${root}/state-target"
mv "${state}" "${state_target}"
ln -s "${state_target}" "${state}"
if run_case; then echo 'state runtime symlink unexpectedly succeeded' >&2; exit 1; fi
[[ ! -e "${root}/backup.called" ]] && [[ -e "${state_target}" ]]
pass_case 'state runtime symlink is rejected without following it'

reset_case
request v1.0.1
work_target="${root}/work-target"
mv "${work}" "${work_target}"
ln -s "${work_target}" "${work}"
if run_case; then echo 'work runtime symlink unexpectedly succeeded' >&2; exit 1; fi
[[ ! -e "${root}/backup.called" ]] && [[ -e "${work_target}" ]]
pass_case 'work runtime symlink is rejected without following it'

for permission_case in runtime requests state work; do
  reset_case
  request v1.0.1
  case "${permission_case}" in
    runtime) chmod 0755 "${runtime}" ;;
    requests) chmod 0755 "${requests}" ;;
    state) chmod 0755 "${state}" ;;
    work) chmod 0750 "${work}" ;;
  esac
  if run_case; then echo "${permission_case} runtime permission unexpectedly succeeded" >&2; exit 1; fi
  [[ -e "${requests}/request.json" ]] && [[ ! -e "${root}/backup.called" ]]
  pass_case "${permission_case} runtime permission mismatch is rejected"
done

# A checksum mismatch must be rejected before the database migration starts.
make_release v1.0.1 11 11 11 target-commit
printf '%064d  %s\n' 0 'jl-business-growth_v1.0.1_linux_amd64.tar.gz' >"${fixture}/SHA256SUMS"
reset_case
request v1.0.1
if run_case; then echo 'checksum failure unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 10 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]

# A missing required artifact must also fail before migration.
make_release v1.0.1 11 11 11 target-commit
rm -f "${root}/v1.0.1/web/index.html"
repack_release v1.0.1
reset_case
request v1.0.1
if run_case; then echo 'missing artifact unexpectedly succeeded' >&2; exit 1; fi
[[ "$(cat "${root}/schema")" == 10 ]] && [[ ! -e "${backend_releases}/v1.0.1" ]] && [[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]

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
[[ -e "${requests}/request.json" ]] && [[ -e "${requests}/update.lock" ]]
touch "${root}/systemctl.release"
wait "${first_runner_pid}"
[[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]

unset RELEASE_SYSTEMCTL_SLEEP GOOSE_SCHEMA SYSTEMCTL_MARKER SYSTEMCTL_RELEASE_MARKER

reset_case
printf '{malformed' >"${requests}/request.json"
printf 'stale-lock\n' >"${requests}/update.lock"
if run_case; then echo 'malformed request unexpectedly succeeded' >&2; exit 1; fi
[[ ! -e "${requests}/request.json" ]] && [[ ! -e "${requests}/update.lock" ]]
run_case

printf 'release updater execution harness: PASS\n'
