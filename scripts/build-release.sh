#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: $0 <version>}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_root="${repo_root}/.local/release/${version}"

case "${version}" in
    */*|..|.) echo "invalid release version" >&2; exit 1 ;;
esac
if [[ -e "${artifact_root}" ]]; then
    echo "release already exists: ${artifact_root}" >&2
    exit 1
fi

mkdir -p "${artifact_root}/web" "${artifact_root}/migrations" "${artifact_root}/scripts"
(cd "${repo_root}/frontend" && npm run build)
(cd "${repo_root}/backend" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "${artifact_root}/jl-business-api" ./cmd/jl-business-api)
(cd "${repo_root}/backend" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "${artifact_root}/jl-business-jobs" ./cmd/jl-business-jobs)
cp -R "${repo_root}/frontend/dist/." "${artifact_root}/web/"
cp "${repo_root}/backend/db/migrations/"*.sql "${artifact_root}/migrations/"
cp "${repo_root}/scripts/backup-db.sh" "${artifact_root}/scripts/"
printf '{"version":"%s","built_at":"%s"}\n' "${version}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${artifact_root}/release.json"
printf 'release artifact: %s\n' "${artifact_root}"
