#!/usr/bin/env bash
set -Eeuo pipefail

# Run database-backed checks in a PostgreSQL instance created only for this
# invocation. The instance is loopback-only and its data directory is removed
# by the EXIT trap. No externally supplied TEST_DATABASE_URL is used here.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="${1:-all}"
case "$SCOPE" in
  all|migrations|integration|e2e) ;;
  *) echo "usage: $0 [all|migrations|integration|e2e]" >&2; exit 2 ;;
esac

PG_BIN_DIR="${PG_BIN_DIR:-}"
if [[ -z "$PG_BIN_DIR" ]]; then
  PG_BIN_DIR="$(dirname "$(command -v initdb 2>/dev/null || true)")"
fi
if [[ ! -x "$PG_BIN_DIR/initdb" || ! -x "$PG_BIN_DIR/pg_ctl" || ! -x "$PG_BIN_DIR/postgres" ]]; then
  for candidate in /usr/lib/postgresql/*/bin; do
    if [[ -x "$candidate/initdb" && -x "$candidate/pg_ctl" && -x "$candidate/postgres" ]]; then
      PG_BIN_DIR="$candidate"
      break
    fi
  done
fi
if [[ ! -x "$PG_BIN_DIR/initdb" || ! -x "$PG_BIN_DIR/pg_ctl" || ! -x "$PG_BIN_DIR/postgres" ]]; then
  echo "an isolated PostgreSQL installation is required (initdb, pg_ctl, postgres)" >&2
  exit 1
fi

for command_name in psql createdb dropdb; do
  command -v "$command_name" >/dev/null || { echo "$command_name is required" >&2; exit 1; }
done

RUN_ID="$(date +%s)-$$"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/jl-business-growth-test.XXXXXX")"
chmod 700 "$TEST_ROOT"
PGDATA="$TEST_ROOT/postgres"
PGSOCKET="$TEST_ROOT/socket"
mkdir -m 700 "$PGSOCKET"
PGPORT="${JL_TEST_PGPORT:-$((54000 + (RANDOM % 1000)))}"
PGCTL="$PG_BIN_DIR/pg_ctl"
INITDB="$PG_BIN_DIR/initdb"
PG_ROLE="${USER:-$(id -un)}"
TEST_DATABASE_URL="postgresql://${PG_ROLE}@127.0.0.1:${PGPORT}/jl_business_test?sslmode=disable"

cleanup() {
  set +e
  if [[ -d "$PGDATA" ]]; then
    "$PGCTL" -D "$PGDATA" -m immediate stop >/dev/null 2>&1
  fi
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

"$INITDB" --auth=trust --no-locale --encoding=UTF8 -D "$PGDATA" >/dev/null
"$PGCTL" -D "$PGDATA" -o "-k $PGSOCKET -h 127.0.0.1 -p $PGPORT" -w start >/dev/null

export PGHOST=127.0.0.1 PGPORT PGUSER="$PG_ROLE" PGDATABASE=postgres
createdb jl_business_test
export PGDATABASE=jl_business_test

instance_fingerprint="$(psql -Atqc "SELECT current_database() || '|' || inet_server_port() || '|' || current_setting('data_directory')")"
expected_fingerprint="jl_business_test|${PGPORT}|${PGDATA}"
[[ "$instance_fingerprint" == "$expected_fingerprint" ]] || {
  echo "isolated PostgreSQL fingerprint mismatch" >&2
  exit 1
}

export APP_ENV=test
export TEST_DATABASE_URL
export DATABASE_URL="$TEST_DATABASE_URL"
(cd "$ROOT_DIR/backend" && go run ./cmd/check-test-database-url)
export SESSION_SECRET="jl-test-session-${RUN_ID}"
export SUPERADMIN_USERNAME="e2e_${RUN_ID}"
export SUPERADMIN_INITIAL_PASSWORD="test-password-${RUN_ID}"
export E2E_SUPERADMIN_USERNAME="$SUPERADMIN_USERNAME"
export E2E_SUPERADMIN_PASSWORD="$SUPERADMIN_INITIAL_PASSWORD"
export E2E_FILE_ROOT="$TEST_ROOT/files"
export FILE_ROOT="$E2E_FILE_ROOT"
export MAIL_MODE=file
export RELEASE_UPDATE_ENABLED=false
mkdir -p "$E2E_FILE_ROOT"
chmod 700 "$E2E_FILE_ROOT"

run_psql() { psql -X -v ON_ERROR_STOP=1 "$@"; }
run_goose() {
  (cd "$ROOT_DIR/backend" && GOOSE_DRIVER=postgres GOOSE_DBSTRING="$TEST_DATABASE_URL" go run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations "$@")
}
recreate_database() {
  export PGDATABASE=postgres
  dropdb --if-exists jl_business_test >/dev/null
  createdb jl_business_test
  export PGDATABASE=jl_business_test
}
assert_current_schema() {
  local schema_version
  schema_version="$(run_psql -Atqc "SELECT version_id FROM goose_db_version WHERE is_applied ORDER BY version_id DESC LIMIT 1")"
  [[ "$schema_version" == "14" ]] || { echo "expected schema version 14, got $schema_version" >&2; exit 1; }
  run_psql -Atqc "SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'" | grep -qx 1
  [[ "$(run_psql -Atqc "SELECT count(*) FROM pg_extension WHERE extname = 'pgcrypto'")" == "0" ]]
  [[ "$(run_psql -Atqc "SELECT to_regclass('public.file_cleanup_failures') IS NOT NULL")" == "t" ]]
}

fresh_migration() {
  recreate_database
  run_goose up >/dev/null
  assert_current_schema
  [[ "$(run_psql -Atqc "SELECT to_regclass('public.communication_friend_records') IS NOT NULL")" == "t" ]]
  [[ "$(run_psql -Atqc "SELECT to_regclass('public.import_jobs') IS NULL")" == "t" ]]
}

upgrade_migration() {
  local baseline="$TEST_ROOT/baseline"
  mkdir -p "$baseline"
  git -C "$ROOT_DIR" archive v1.1.3 backend/db/migrations | tar -x -C "$TEST_ROOT"
  mv "$TEST_ROOT/backend/db/migrations" "$baseline/migrations"
  rmdir "$TEST_ROOT/backend/db" "$TEST_ROOT/backend" 2>/dev/null || true
  recreate_database
  (cd "$ROOT_DIR/backend" && GOOSE_DRIVER=postgres GOOSE_DBSTRING="$TEST_DATABASE_URL" go run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir "$baseline/migrations" up >/dev/null)
  run_psql <<'SQL'
INSERT INTO accounts (id, username, password_hash, role)
VALUES ('00000000-0000-0000-0000-000000000091', 'upgrade-fixture', 'fixture', 'USER');
INSERT INTO financial_transactions (id, user_id, occurred_on, type, category_id, amount, source, import_fingerprint)
SELECT '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000091', DATE '2026-01-01', 'EXPENSE', fc.id, 12.50, 'IMPORT', 'upgrade-fixture'
FROM finance_categories AS fc WHERE fc.user_id IS NULL AND fc.type = 'EXPENSE' AND fc.name = '生活' LIMIT 1;
SQL
  [[ "$(run_psql -Atqc "SELECT count(*) FROM financial_transactions WHERE id = '00000000-0000-0000-0000-000000000092'")" == "1" ]]
  run_goose up >/dev/null
  assert_current_schema
  [[ "$(run_psql -Atqc "SELECT count(*) FROM financial_transactions WHERE id = '00000000-0000-0000-0000-000000000092'")" == "1" ]]
  [[ "$(run_psql -Atqc "SELECT to_regclass('public.import_jobs') IS NULL")" == "t" ]]
  [[ "$(run_psql -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='import_fingerprint'")" == "0" ]]
}

choose_port() {
  local base="$1" port
  for port in $(seq "$base" "$((base + 20))"); do
    if ! (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
      printf '%s' "$port"
      return
    fi
  done
  echo "no free local port near $base" >&2
  exit 1
}

echo "isolated PostgreSQL instance ready (data directory is task-owned and loopback-only)"
if [[ "$SCOPE" == all || "$SCOPE" == migrations ]]; then
  fresh_migration
  upgrade_migration
fi

if [[ "$SCOPE" == all || "$SCOPE" == integration ]]; then
  fresh_migration
  (cd "$ROOT_DIR/backend" && go test -v ./cmd/jl-business-api -run '^(TestAuthenticationAdminAPIIntegration|TestDailyBusinessAPIIntegration|TestCalendarReviewsAnalyticsAPIIntegration|TestTeamKnowledgeFilesSearchAPIIntegration|TestFinanceIncomeAPIIntegration|TestAccountLifecycleAPIIntegration)$' -count=1)
fi

if [[ "$SCOPE" == all || "$SCOPE" == e2e ]]; then
  fresh_migration
  export E2E_BACKEND_PORT="$(choose_port 18080)"
  export E2E_FRONTEND_PORT="$(choose_port 15173)"
  export E2E_PACKAGE_RUNNER=bun
  (cd "$ROOT_DIR/frontend" && bun run build && E2E_PRODUCTION=1 bunx playwright test)
fi

echo "isolated test scope '$SCOPE' passed"
