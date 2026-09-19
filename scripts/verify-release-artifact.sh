#!/usr/bin/env bash
set -euo pipefail

artifact_root="${1:?artifact directory is required}"
version="${2:?version is required}"
git_sha="${3:?git SHA is required}"
built_at="${4:?build time is required}"
schema_version="${5:?schema version is required}"

for required in jl-business-api jl-business-jobs web/index.html migrations scripts/backup-db.sh scripts/release-updater.sh release.json; do
    test -e "${artifact_root}/${required}" || { echo "release artifact is missing ${required}" >&2; exit 1; }
done

api_version="$("${artifact_root}/jl-business-api" --version)"
jobs_version="$("${artifact_root}/jl-business-jobs" --version)"
for output in "${api_version}" "${jobs_version}"; do
    grep -Fq "\"version\":\"${version}\"" <<<"${output}"
    grep -Fq "\"commit\":\"${git_sha}\"" <<<"${output}"
    grep -Fq "\"built_at\":\"${built_at}\"" <<<"${output}"
done

grep -RFlq -- "${version}" "${artifact_root}/web"
grep -RFlq -- "${git_sha}" "${artifact_root}/web"
grep -RFlq -- "${built_at}" "${artifact_root}/web"
grep -Fq "\"version\": \"${version}\"" "${artifact_root}/release.json"
grep -Fq "\"git_sha\": \"${git_sha}\"" "${artifact_root}/release.json"
grep -Fq "\"built_at\": \"${built_at}\"" "${artifact_root}/release.json"
grep -Fq "\"schema_version\": ${schema_version}" "${artifact_root}/release.json"
grep -Fq "\"compatible_schema_min\": ${schema_version}" "${artifact_root}/release.json"
grep -Fq "\"compatible_schema_max\": ${schema_version}" "${artifact_root}/release.json"

printf 'release metadata verified: %s %s schema=%s\n' "${version}" "${git_sha}" "${schema_version}"
