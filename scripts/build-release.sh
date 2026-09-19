#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: $0 <version>}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_root="${repo_root}/.local/release"
artifact_root="${output_root}/${version}"
archive_name="jl-business-growth_${version}_linux_amd64.tar.gz"
archive_path="${output_root}/${archive_name}"
checksums_path="${output_root}/SHA256SUMS"

if [[ ! "${version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "VERSION must match vX.Y.Z" >&2
    exit 1
fi
if [[ -e "${artifact_root}" || -e "${archive_path}" ]]; then
    echo "release already exists for ${version}" >&2
    exit 1
fi

git_sha="$(git -C "${repo_root}" rev-parse HEAD)"
built_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
latest_migration="$(find "${repo_root}/backend/db/migrations" -maxdepth 1 -type f -name '[0-9]*_*.sql' -printf '%f\n' | sort | tail -n 1)"
if [[ ! "${latest_migration}" =~ ^0*([0-9]+)_ ]]; then
    echo "cannot derive schema version from migrations" >&2
    exit 1
fi
schema_version="$((10#${BASH_REMATCH[1]}))"

mkdir -p "${artifact_root}/web" "${artifact_root}/migrations" "${artifact_root}/scripts"
(
    cd "${repo_root}/frontend"
    VITE_APP_VERSION="${version}" VITE_GIT_COMMIT="${git_sha}" VITE_BUILD_TIME="${built_at}" npm run build
)

ldflags="-s -w -X jl-business-growth/backend/internal/buildinfo.Version=${version} -X jl-business-growth/backend/internal/buildinfo.Commit=${git_sha} -X jl-business-growth/backend/internal/buildinfo.BuildTime=${built_at}"
(
    cd "${repo_root}/backend"
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "${ldflags}" -o "${artifact_root}/jl-business-api" ./cmd/jl-business-api
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "${ldflags}" -o "${artifact_root}/jl-business-jobs" ./cmd/jl-business-jobs
)

cp -R "${repo_root}/frontend/dist/." "${artifact_root}/web/"
cp "${repo_root}/backend/db/migrations/"*.sql "${artifact_root}/migrations/"
cp "${repo_root}/scripts/backup-db.sh" "${artifact_root}/scripts/"
cp "${repo_root}/scripts/release-updater.sh" "${artifact_root}/scripts/"
printf '%s\n' \
    '{' \
    "  \"version\": \"${version}\"," \
    "  \"git_sha\": \"${git_sha}\"," \
    "  \"built_at\": \"${built_at}\"," \
    '  "platform": "linux-amd64",' \
    "  \"schema_version\": ${schema_version}," \
    "  \"compatible_schema_min\": ${schema_version}," \
    "  \"compatible_schema_max\": ${schema_version}" \
    '}' > "${artifact_root}/release.json"

"${repo_root}/scripts/verify-release-artifact.sh" "${artifact_root}" "${version}" "${git_sha}" "${built_at}" "${schema_version}"
tar -C "${artifact_root}" -czf "${archive_path}" .
(
    cd "${output_root}"
    sha256sum "${archive_name}" > "${checksums_path}"
    sha256sum --check "$(basename "${checksums_path}")"
)

printf 'release directory: %s\n' "${artifact_root}"
printf 'release archive: %s\n' "${archive_path}"
printf 'release checksums: %s\n' "${checksums_path}"
