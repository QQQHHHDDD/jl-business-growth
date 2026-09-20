#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_script="${repo_root}/scripts/backup-db.sh"
! grep -Eq 'pg_dump.*DATABASE_URL' "${backup_script}"
root="$(mktemp -d)"
trap 'rm -rf "${root}"' EXIT
bin="${root}/bin"
backup_root="${root}/backups"
file_root="${root}/files"
mkdir -p "${bin}" "${file_root}"
printf 'test file\n' >"${file_root}/example.txt"

cat >"${bin}/pg_dump" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ -n "${PGSERVICE:-}" || ( -n "${PGHOST:-}" && -n "${PGDATABASE:-}" && -n "${PGUSER:-}" ) ]]
printf '%s\n' "$@" >"${PG_DUMP_ARGV_MARKER}"
for argument in "$@"; do
  if [[ "${argument}" == --file=* ]]; then
    printf 'dump\n' >"${argument#--file=}"
  fi
done
EOF
cat >"${bin}/tar" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for argument in "$@"; do
  if [[ "${argument}" == --file=* ]]; then
    : >"${argument#--file=}"
  fi
done
EOF
chmod 0755 "${bin}/pg_dump" "${bin}/tar"

database_url='postgres://user:VERY_SECRET_TEST_PASSWORD@host/db'
if DATABASE_URL="${database_url}" BACKUP_ROOT="${backup_root}" FILE_ROOT="${file_root}" \
    PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=jl_business_test PGUSER=jl_business \
    PGSSLMODE=disable PGSERVICE= PG_DUMP_ARGV_MARKER="${root}/pg_dump.argv" \
    PATH="${bin}:${PATH}" "${backup_script}"; then
  :
else
  echo 'backup script failed with valid libpq environment' >&2
  exit 1
fi
grep -Fq -- '--format=custom' "${root}/pg_dump.argv"
grep -Fq -- '--file=' "${root}/pg_dump.argv"
! grep -Fq "${database_url}" "${root}/pg_dump.argv"
! grep -Fq 'VERY_SECRET_TEST_PASSWORD' "${root}/pg_dump.argv"
dump_path="$(find "${backup_root}/database" -type f -name '*.dump' -print -quit)"
[[ -n "${dump_path}" && -s "${dump_path}" ]]

rm -rf "${backup_root}"
if DATABASE_URL="${database_url}" BACKUP_ROOT="${backup_root}" FILE_ROOT="${file_root}" \
    PGHOST= PGPORT= PGDATABASE= PGUSER= PGSSLMODE= PGSERVICE= \
    PG_DUMP_ARGV_MARKER="${root}/missing.argv" PATH="${bin}:${PATH}" "${backup_script}"; then
  echo 'backup script accepted missing libpq configuration' >&2
  exit 1
fi
[[ ! -e "${backup_root}" ]]

printf 'backup-db argv safety tests: PASS\n'
