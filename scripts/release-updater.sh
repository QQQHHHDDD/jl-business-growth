#!/usr/bin/env bash
set -euo pipefail

readonly repository="QQQHHHDDD/jl-business-growth"
readonly runtime_root="${RELEASE_RUNTIME_ROOT:-/var/lib/jl-business-growth/release-updater}"
readonly backend_releases="${RELEASE_BACKEND_ROOT:-/opt/jl-business-growth/releases}"
readonly web_releases="${RELEASE_WEB_ROOT:-/var/www/jl-business-growth/releases}"
readonly backend_current="/opt/jl-business-growth/current"
readonly web_current="/var/www/jl-business-growth/current"
readonly request_path="${runtime_root}/request.json"
readonly status_path="${runtime_root}/status.json"
readonly api_health="http://127.0.0.1:8080/api/health"

test "${RELEASE_UPDATE_ENABLED:-false}" = "true" || { echo "online updater is disabled" >&2; exit 1; }
for command in curl flock jq sha256sum tar pg_dump psql goose systemctl; do
    command -v "${command}" >/dev/null || { echo "required updater command is missing: ${command}" >&2; exit 1; }
done
test -f "${request_path}" || exit 0

exec 9>"${runtime_root}/runner.lock"
flock -n 9 || { echo "another updater process is running" >&2; exit 1; }

request_id="$(jq -er '.request_id' "${request_path}")"
action="$(jq -er '.action' "${request_path}")"
from_version="$(jq -er '.from_version' "${request_path}")"
target_version="$(jq -er '.target_version' "${request_path}")"
requested_repository="$(jq -er '.repository' "${request_path}")"

[[ "${request_id}" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "invalid updater request id" >&2; exit 1; }
[[ "${from_version}" == "dev" || "${from_version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid source version" >&2; exit 1; }
[[ "${target_version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid target version" >&2; exit 1; }
[[ "${action}" == "update" || "${action}" == "rollback" ]] || { echo "invalid updater action" >&2; exit 1; }
test "${requested_repository}" = "${repository}" || { echo "invalid release repository" >&2; exit 1; }

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
switched=false
migration_started=false
installed_target=false
previous_backend=""
previous_web=""
target_backend="${backend_releases}/${target_version}"
target_web="${web_releases}/${target_version}"

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

cleanup_request() {
    rm -f "${request_path}" "${runtime_root}/update.lock"
}

restore_previous_release() {
    if [[ "${switched}" != "true" || -z "${previous_backend}" || -z "${previous_web}" ]]; then
        return
    fi
    ln -sfn "${previous_backend}" "${backend_current}"
    ln -sfn "${previous_web}" "${web_current}"
    systemctl restart jl-business-api.service || true
    systemctl restart jl-business-jobs.timer || true
}

on_error() {
    set +e
    restore_previous_release
    if [[ "${installed_target}" == "true" && "${switched}" != "true" ]]; then
        rm -rf "${target_backend}" "${target_web}"
    fi
    if [[ "${switched}" == "true" ]]; then
        write_status "failed" "更新失败，应用版本已恢复，但数据库 migration 未回退，需要人工检查" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    elif [[ "${migration_started}" == "true" ]]; then
        write_status "failed" "更新失败，应用版本未切换，但数据库 migration 可能已执行，需要人工检查" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    else
        write_status "failed" "版本任务失败，当前应用版本未切换" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi
    cleanup_request
}
trap on_error ERR

write_status "queued" "版本任务已进入队列"
temp_root="$(mktemp -d "${runtime_root}/work.XXXXXX")"
trap 'rm -rf "${temp_root}"' EXIT

if [[ "${action}" == "update" ]]; then
    test ! -e "${target_backend}" && test ! -e "${target_web}"
    archive_name="jl-business-growth_${target_version}_linux_amd64.tar.gz"
    release_base="https://github.com/${repository}/releases/download/${target_version}"
    write_status "downloading" "正在下载正式 Release"
    curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error --output "${temp_root}/${archive_name}" "${release_base}/${archive_name}"
    curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error --output "${temp_root}/SHA256SUMS" "${release_base}/SHA256SUMS"

    write_status "verifying" "正在校验 Release 文件"
    grep -F "  ${archive_name}" "${temp_root}/SHA256SUMS" > "${temp_root}/selected.sha256"
    test "$(wc -l < "${temp_root}/selected.sha256")" -eq 1
    (cd "${temp_root}" && sha256sum --check selected.sha256)
    while IFS= read -r archive_entry; do
        [[ "${archive_entry}" != /* && "${archive_entry}" != ../* && "${archive_entry}" != *"/../"* ]]
    done < <(tar -tzf "${temp_root}/${archive_name}")
    mkdir "${temp_root}/extract"
    tar -xzf "${temp_root}/${archive_name}" -C "${temp_root}/extract" --no-same-owner --no-same-permissions
    test "$(jq -er '.version' "${temp_root}/extract/release.json")" = "${target_version}"
    test "$(jq -er '.platform' "${temp_root}/extract/release.json")" = "linux-amd64"
    jq -e '.schema_version >= 1 and .compatible_schema_min >= 1 and .compatible_schema_max >= .compatible_schema_min' "${temp_root}/extract/release.json" >/dev/null
    manifest_schema="$(jq -er '.schema_version' "${temp_root}/extract/release.json")"
    latest_migration="$(find "${temp_root}/extract/migrations" -maxdepth 1 -type f -name '[0-9]*_*.sql' -printf '%f\n' | sort | tail -n 1)"
    [[ "${latest_migration}" =~ ^0*([0-9]+)_ ]]
    test "$((10#${BASH_REMATCH[1]}))" -eq "${manifest_schema}"
else
    test -d "${target_backend}" && test -d "${target_web}"
    test "$(jq -er '.version' "${target_backend}/release.json")" = "${target_version}"
    current_schema="$(psql "${DATABASE_URL:?DATABASE_URL is required}" -Atqc "SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version WHERE is_applied")"
    compatible_min="$(jq -er '.compatible_schema_min' "${target_backend}/release.json")"
    compatible_max="$(jq -er '.compatible_schema_max' "${target_backend}/release.json")"
    (( current_schema >= compatible_min && current_schema <= compatible_max ))
fi

write_status "backing_up" "正在备份数据库"
"${backend_current}/scripts/backup-db.sh"

if [[ "${action}" == "update" ]]; then
    write_status "migrating" "正在执行向前数据库迁移"
    migration_started=true
    goose -dir "${temp_root}/extract/migrations" postgres "${DATABASE_URL:?DATABASE_URL is required}" up
    mkdir -p "${target_backend}" "${target_web}"
    installed_target=true
    cp -a "${temp_root}/extract/." "${target_backend}/"
    cp -a "${temp_root}/extract/web/." "${target_web}/"
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
for _ in $(seq 1 30); do
    if curl --fail --silent --show-error "${api_health}/live" >/dev/null && curl --fail --silent --show-error "${api_health}/ready" >/dev/null; then
        healthy=true
        break
    fi
    sleep 2
done
test "${healthy}" = "true"

trap - ERR
write_status "succeeded" "版本任务已完成" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cleanup_request
