#!/usr/bin/env bash
set -euo pipefail

libpq_connection_configured() {
    if [[ -n "${PGSERVICE:-}" ]]; then
        return 0
    fi
    [[ -n "${PGHOST:-}" && -n "${PGDATABASE:-}" && -n "${PGUSER:-}" ]]
}

if ! libpq_connection_configured; then
    echo 'PostgreSQL CLI connection configuration is missing' >&2
    exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/jl-business-growth}"
FILE_ROOT="${FILE_ROOT:-/var/lib/jl-business-growth/files}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

umask 077
mkdir -p "${BACKUP_ROOT}/database" "${BACKUP_ROOT}/files"
pg_dump --format=custom --file="${BACKUP_ROOT}/database/jl-business-${stamp}.dump"
tar --create --gzip --file="${BACKUP_ROOT}/files/jl-business-files-${stamp}.tar.gz" --directory="${FILE_ROOT}" .
find "${BACKUP_ROOT}/database" "${BACKUP_ROOT}/files" -type f -mtime "+${retention_days}" -delete
