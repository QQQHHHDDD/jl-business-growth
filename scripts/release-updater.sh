#!/usr/bin/env bash
set -euo pipefail

readonly repository="QQQHHHDDD/jl-business-growth"
readonly runtime_root="${RELEASE_RUNTIME_ROOT:-/var/lib/jl-business-growth/release-updater}"
readonly backend_releases="${RELEASE_BACKEND_ROOT:-/opt/jl-business-growth/releases}"
readonly web_releases="${RELEASE_WEB_ROOT:-/var/www/jl-business-growth/releases}"
readonly backend_current="${RELEASE_BACKEND_CURRENT:-/opt/jl-business-growth/current}"
readonly web_current="${RELEASE_WEB_CURRENT:-/var/www/jl-business-growth/current}"
readonly request_path="${runtime_root}/request.json"
readonly status_path="${runtime_root}/status.json"
readonly update_lock_path="${runtime_root}/update.lock"
readonly api_health="${RELEASE_API_HEALTH:-http://127.0.0.1:8080/api/health}"
readonly release_download_base="${RELEASE_DOWNLOAD_BASE:-https://github.com/${repository}/releases/download}"
readonly health_attempts="${RELEASE_HEALTH_ATTEMPTS:-30}"
readonly health_retry_delay="${RELEASE_HEALTH_RETRY_DELAY:-2}"

request_id=""
action=""
from_version=""
target_version=""
started_at=""
current_schema_before=""
actual_schema=""
previous_backend=""
previous_web=""
target_backend=""
target_web=""
manifest_schema=""
compatible_min=""
compatible_max=""
runner_locked=false
request_claimed=false
migration_started=false
switched=false
installed_target=false
restore_attempted=false
restore_succeeded=false
handling_error=false
failure_message=""
claimed_lock_value=""

cleanup_owned_request() {
    if [[ "${request_claimed}" != "true" ]]; then
        return
    fi
    if [[ -n "${request_id}" && -f "${request_path}" ]]; then
        local current_id
        current_id="$(jq -r '.request_id // empty' "${request_path}" 2>/dev/null || true)"
        if [[ "${current_id}" != "${request_id}" ]]; then
            return
        fi
    fi
    rm -f "${request_path}"
    if [[ -f "${update_lock_path}" ]]; then
        if [[ "$(cat "${update_lock_path}" 2>/dev/null || true)" == "${request_id}" || "$(cat "${update_lock_path}" 2>/dev/null || true)" == "${claimed_lock_value}" ]]; then
            rm -f "${update_lock_path}"
        fi
    fi
}

write_status() {
    local state="$1"
    local safe_message="$2"
    local finished_at="${3:-}"
    local temporary="${status_path}.tmp"
    jq -n \
        --arg request_id "${request_id}" \
        --arg action "${action}" \
        --arg from_version "${from_version}" \
        --arg target_version "${target_version}" \
        --arg state "${state}" \
        --arg started_at "${started_at}" \
        --arg finished_at "${finished_at}" \
        --arg safe_message "${safe_message}" \
        '{request_id:$request_id,action:$action,from_version:$from_version,target_version:$target_version,state:$state,started_at:$started_at,finished_at:(if $finished_at == "" then null else $finished_at end),safe_message:$safe_message}' \
        > "${temporary}"
    chmod 0640 "${temporary}"
    mv -f "${temporary}" "${status_path}"
}

health_endpoint_check() {
    local base="$1"
    local endpoint="$2"
    curl --connect-timeout 5 --max-time 15 --fail --silent --show-error "${base}/${endpoint}" >/dev/null
}

health_check() {
    local base="$1"
    health_endpoint_check "${base}" "live" && health_endpoint_check "${base}" "ready"
}

schema_version_from_db() {
    psql "${DATABASE_URL:?DATABASE_URL is required}" -Atqc "SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version WHERE is_applied"
}

manifest_compatible() {
    local manifest_path="$1"
    local schema="$2"
    local minimum maximum
    minimum="$(jq -er '.compatible_schema_min' "${manifest_path}")"
    maximum="$(jq -er '.compatible_schema_max' "${manifest_path}")"
    (( schema >= minimum && schema <= maximum ))
}

verify_binary_metadata() {
    local binary="$1"
    local manifest_path="$2"
    local output
    output="$("${binary}" --version)"
    [[ "$(jq -er '.version' "${manifest_path}")" == "$(jq -er '.version' <<<"${output}")" ]]
    [[ "$(jq -er '.git_sha' "${manifest_path}")" == "$(jq -er '.commit' <<<"${output}")" ]]
    [[ "$(jq -er '.built_at' "${manifest_path}")" == "$(jq -er '.built_at' <<<"${output}")" ]]
}

verify_extracted_artifact() {
    local root="$1"
    local required
    for required in jl-business-api jl-business-jobs web/index.html migrations scripts/backup-db.sh release.json; do
        test -e "${root}/${required}" || { echo "release artifact is missing ${required}" >&2; return 1; }
    done
    test -f "${root}/jl-business-api" && test -x "${root}/jl-business-api"
    test -f "${root}/jl-business-jobs" && test -x "${root}/jl-business-jobs"
    test -f "${root}/web/index.html"
    test -d "${root}/migrations"
    test -f "${root}/scripts/backup-db.sh" && test -x "${root}/scripts/backup-db.sh"
    test -f "${root}/release.json"
    jq -e '.version | strings and test("^v[0-9]+\\.[0-9]+\\.[0-9]+$")' "${root}/release.json" >/dev/null
    jq -e '.git_sha | strings and length > 0' "${root}/release.json" >/dev/null
    jq -e '.built_at | strings and length > 0' "${root}/release.json" >/dev/null
    jq -e '.platform == "linux-amd64" and (.schema_version | numbers) and (.compatible_schema_min | numbers) and (.compatible_schema_max | numbers) and (.compatible_schema_max >= .compatible_schema_min)' "${root}/release.json" >/dev/null
    verify_binary_metadata "${root}/jl-business-api" "${root}/release.json"
    verify_binary_metadata "${root}/jl-business-jobs" "${root}/release.json"
}

verify_installed_backend() {
    local root="$1"
    for required in jl-business-api jl-business-jobs migrations scripts/backup-db.sh release.json; do
        test -e "${root}/${required}" || { echo "installed release is missing ${required}" >&2; return 1; }
    done
    test -x "${root}/jl-business-api" && test -x "${root}/jl-business-jobs"
    test -d "${root}/migrations"
    test -x "${root}/scripts/backup-db.sh"
    verify_binary_metadata "${root}/jl-business-api" "${root}/release.json"
    verify_binary_metadata "${root}/jl-business-jobs" "${root}/release.json"
}

restore_previous_release() {
    restore_attempted=true
    restore_succeeded=false
    if [[ -z "${previous_backend}" || -z "${previous_web}" || -z "${actual_schema}" ]]; then
        failure_message="更新失败，数据库状态未知，无法安全恢复旧版本，需要人工处理"
        return 1
    fi
    local previous_manifest="${previous_backend}/release.json"
    if [[ ! -f "${previous_manifest}" ]] || ! manifest_compatible "${previous_manifest}" "${actual_schema}"; then
        failure_message="更新失败，数据库已升级到 schema ${actual_schema}，旧版本不兼容，未自动恢复，需要人工处理"
        return 1
    fi
    if ! ln -sfn "${previous_backend}" "${backend_current}"; then
        failure_message="更新失败，旧版本 backend 链接恢复失败，需要人工处理"
        return 1
    fi
    if ! ln -sfn "${previous_web}" "${web_current}"; then
        failure_message="更新失败，旧版本 web 链接恢复失败，需要人工处理"
        return 1
    fi
    local restored_backend
    if ! restored_backend="$(readlink -f "${backend_current}")"; then
        failure_message="更新失败，无法校验恢复后的 backend 链接，需要人工处理"
        return 1
    fi
    if [[ "${restored_backend}" != "${previous_backend}" ]]; then
        failure_message="更新失败，恢复后的 backend 链接不正确，需要人工处理"
        return 1
    fi
    local restored_web
    if ! restored_web="$(readlink -f "${web_current}")"; then
        failure_message="更新失败，无法校验恢复后的 web 链接，需要人工处理"
        return 1
    fi
    if [[ "${restored_web}" != "${previous_web}" ]]; then
        failure_message="更新失败，恢复后的 web 链接不正确，需要人工处理"
        return 1
    fi
    if ! systemctl restart jl-business-api.service; then
        failure_message="更新失败，旧版本 API 服务重启失败，需要人工处理"
        return 1
    fi
    if ! systemctl restart jl-business-jobs.timer; then
        failure_message="更新失败，旧版本 jobs timer 重启失败，需要人工处理"
        return 1
    fi
    if ! health_endpoint_check "${api_health}" "live"; then
        failure_message="更新失败，旧版本已切回但恢复后的 live 健康检查未通过，需要人工处理"
        return 1
    fi
    if ! health_endpoint_check "${api_health}" "ready"; then
        failure_message="更新失败，旧版本已切回但恢复后的 ready 健康检查未通过，需要人工处理"
        return 1
    fi
    restore_succeeded=true
    return 0
}

on_error() {
    trap - ERR
    if [[ "${handling_error}" == "true" ]]; then
        exit 1
    fi
    handling_error=true
    set +e
    if [[ "${switched}" == "true" ]]; then
        if restore_previous_release && [[ "${restore_succeeded}" == "true" ]]; then
            failure_message="更新失败，应用版本已恢复，但数据库 migration 未回退，需要人工检查"
        elif [[ -z "${failure_message}" ]]; then
            failure_message="更新失败，应用版本未能安全恢复，需要人工处理"
        fi
    elif [[ "${migration_started}" == "true" ]]; then
        failure_message="更新失败，应用版本未切换，但数据库 migration 可能已执行，需要人工检查"
    elif [[ -z "${failure_message}" ]]; then
        failure_message="版本任务失败，当前应用版本未切换"
    fi
    if [[ "${request_claimed}" == "true" ]]; then
        if command -v jq >/dev/null 2>&1 && [[ -n "${started_at}" ]]; then
            write_status "failed" "${failure_message}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || true
        elif ! command -v jq >/dev/null 2>&1; then
            local fallback_status="${status_path}.tmp"
            printf '{"request_id":"","action":"","from_version":"","target_version":"","state":"failed","started_at":null,"finished_at":"%s","safe_message":"版本任务失败，缺少必需命令"}\n' \
                "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"${fallback_status}" || true
            chmod 0640 "${fallback_status}" 2>/dev/null || true
            mv -f "${fallback_status}" "${status_path}" 2>/dev/null || true
        fi
    fi
    if [[ "${installed_target}" == "true" && "${switched}" != "true" ]]; then
        rm -rf "${target_backend}" "${target_web}"
    fi
    cleanup_owned_request
    exit 1
}

fail_task() {
    failure_message="$1"
    on_error
}

load_request_context() {
    if ! command -v jq >/dev/null 2>&1; then
        return
    fi
    request_id="$(jq -r 'if (.request_id | type) == "string" then .request_id else empty end' "${request_path}" 2>/dev/null || true)"
    action="$(jq -r 'if (.action | type) == "string" then .action else empty end' "${request_path}" 2>/dev/null || true)"
    from_version="$(jq -r 'if (.from_version | type) == "string" then .from_version else empty end' "${request_path}" 2>/dev/null || true)"
    target_version="$(jq -r 'if (.target_version | type) == "string" then .target_version else empty end' "${request_path}" 2>/dev/null || true)"
}

# Install the trap before any request parsing or dependency checks. A failed
# request is removed only after this runner has acquired the exclusive flock.
if [[ ! -f "${request_path}" ]]; then
    exit 0
fi
mkdir -p "${runtime_root}"
exec 9>"${runtime_root}/runner.lock"
if ! flock -n 9; then
    echo "another updater process is running" >&2
    exit 1
fi
runner_locked=true
request_claimed=true
claimed_lock_value="$(cat "${update_lock_path}" 2>/dev/null || true)"
trap on_error ERR
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
load_request_context

if [[ "${RELEASE_UPDATE_ENABLED:-false}" != "true" ]]; then
    fail_task "在线更新未启用"
fi

for command in curl flock jq sha256sum tar pg_dump psql goose systemctl; do
    if ! command -v "${command}" >/dev/null 2>&1; then
        fail_task "版本任务缺少必需命令：${command}"
    fi
done

request_id="$(jq -r '.request_id // empty' "${request_path}")"
action="$(jq -r '.action // empty' "${request_path}")"
from_version="$(jq -r '.from_version // empty' "${request_path}")"
target_version="$(jq -r '.target_version // empty' "${request_path}")"
requested_repository="$(jq -r '.repository // empty' "${request_path}")"

if [[ ! "${request_id}" =~ ^[0-9a-fA-F-]{36}$ ]]; then
    fail_task "版本任务请求 ID 无效"
fi
if [[ "${from_version}" != "dev" && ! "${from_version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    fail_task "版本任务来源版本无效"
fi
if [[ ! "${target_version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    fail_task "版本任务目标版本无效"
fi
if [[ "${action}" != "update" && "${action}" != "rollback" ]]; then
    fail_task "版本任务操作无效"
fi
if [[ "${requested_repository}" != "${repository}" ]]; then
    fail_task "版本任务仓库无效"
fi

write_status "queued" "版本任务已进入队列"
temp_root="$(mktemp -d "${runtime_root}/work.XXXXXX")"
trap 'rm -rf "${temp_root}"' EXIT

target_backend="${backend_releases}/${target_version}"
target_web="${web_releases}/${target_version}"
if [[ "${action}" == "update" ]]; then
    test ! -e "${target_backend}" && test ! -e "${target_web}"
    archive_name="jl-business-growth_${target_version}_linux_amd64.tar.gz"
    release_base="${release_download_base}/${target_version}"
    write_status "downloading" "正在下载正式 Release"
    curl --proto '=https' --tlsv1.2 --connect-timeout 10 --max-time 900 --fail --location --silent --show-error --output "${temp_root}/${archive_name}" "${release_base}/${archive_name}"
    curl --proto '=https' --tlsv1.2 --connect-timeout 10 --max-time 120 --fail --location --silent --show-error --output "${temp_root}/SHA256SUMS" "${release_base}/SHA256SUMS"

    write_status "verifying" "正在校验 Release 文件"
    grep -F "  ${archive_name}" "${temp_root}/SHA256SUMS" > "${temp_root}/selected.sha256"
    test "$(wc -l < "${temp_root}/selected.sha256")" -eq 1
    (cd "${temp_root}" && sha256sum --check selected.sha256)
    while IFS= read -r archive_entry; do
        [[ "${archive_entry}" != /* && "${archive_entry}" != ../* && "${archive_entry}" != *"/../"* ]]
    done < <(tar -tzf "${temp_root}/${archive_name}")
    mkdir "${temp_root}/extract"
    tar -xzf "${temp_root}/${archive_name}" -C "${temp_root}/extract" --no-same-owner --no-same-permissions
    verify_extracted_artifact "${temp_root}/extract"
    test "$(jq -er '.version' "${temp_root}/extract/release.json")" = "${target_version}"
    test "$(jq -er '.platform' "${temp_root}/extract/release.json")" = "linux-amd64"
    manifest_schema="$(jq -er '.schema_version' "${temp_root}/extract/release.json")"
    compatible_min="$(jq -er '.compatible_schema_min' "${temp_root}/extract/release.json")"
    compatible_max="$(jq -er '.compatible_schema_max' "${temp_root}/extract/release.json")"
    latest_migration="$(find "${temp_root}/extract/migrations" -maxdepth 1 -type f -name '[0-9]*_*.sql' -printf '%f\n' | sort | tail -n 1)"
    [[ "${latest_migration}" =~ ^0*([0-9]+)_ ]]
    test "$((10#${BASH_REMATCH[1]}))" -eq "${manifest_schema}"
    current_schema_before="$(schema_version_from_db)"
    [[ "${current_schema_before}" =~ ^[0-9]+$ ]]
    (( current_schema_before <= manifest_schema ))
else
    test -d "${target_backend}" && test -d "${target_web}"
    test "$(jq -er '.version' "${target_backend}/release.json")" = "${target_version}"
    verify_installed_backend "${target_backend}"
    current_schema_before="$(schema_version_from_db)"
    [[ "${current_schema_before}" =~ ^[0-9]+$ ]]
    compatible_min="$(jq -er '.compatible_schema_min' "${target_backend}/release.json")"
    compatible_max="$(jq -er '.compatible_schema_max' "${target_backend}/release.json")"
    manifest_schema="$(jq -er '.schema_version' "${target_backend}/release.json")"
    manifest_compatible "${target_backend}/release.json" "${current_schema_before}"
fi

write_status "backing_up" "正在备份数据库"
"${backend_current}/scripts/backup-db.sh"

if [[ "${action}" == "update" ]]; then
    write_status "migrating" "正在执行向前数据库迁移"
    migration_started=true
    goose -dir "${temp_root}/extract/migrations" postgres "${DATABASE_URL:?DATABASE_URL is required}" up
    actual_schema="$(schema_version_from_db)"
    [[ "${actual_schema}" =~ ^[0-9]+$ ]]
    manifest_compatible "${temp_root}/extract/release.json" "${actual_schema}"
    mkdir -p "${target_backend}" "${target_web}"
    installed_target=true
    cp -a "${temp_root}/extract/." "${target_backend}/"
    cp -a "${temp_root}/extract/web/." "${target_web}/"
else
    actual_schema="${current_schema_before}"
fi

write_status "switching" "正在切换应用版本"
previous_backend="$(readlink -f "${backend_current}")"
previous_web="$(readlink -f "${web_current}")"
test -n "${previous_backend}" && test -n "${previous_web}"
ln -sfn "${target_backend}" "${backend_current}"
ln -sfn "${target_web}" "${web_current}"
switched=true

write_status "restarting" "正在重启应用服务"
systemctl restart jl-business-api.service
systemctl restart jl-business-jobs.timer

write_status "health_check" "正在执行健康检查"
healthy=false
for _ in $(seq 1 "${health_attempts}"); do
    if health_check "${api_health}"; then
        healthy=true
        break
    fi
    sleep "${health_retry_delay}"
done
test "${healthy}" = "true"

trap - ERR
write_status "succeeded" "版本任务已完成" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cleanup_owned_request
