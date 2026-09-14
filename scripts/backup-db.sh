#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set in the production environment file}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/jl-business-growth}"
FILE_ROOT="${FILE_ROOT:-/var/lib/jl-business-growth/files}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

umask 077
mkdir -p "${BACKUP_ROOT}/database" "${BACKUP_ROOT}/files"
pg_dump --format=custom --file="${BACKUP_ROOT}/database/jl-business-${stamp}.dump" "${DATABASE_URL}"
tar --create --gzip --file="${BACKUP_ROOT}/files/jl-business-files-${stamp}.tar.gz" --directory="${FILE_ROOT}" .
find "${BACKUP_ROOT}/database" "${BACKUP_ROOT}/files" -type f -mtime "+${retention_days}" -delete
