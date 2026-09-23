# JL团队生意成长管理系统

JL 团队内部使用的个人生意成长与经营管理系统。Phase 0-6 主体开发、V1 收口、Phase 7 综合测试、最终 UAT 和 PR review 均已完成；当前 `master` 是 V1 正式发布基线。本仓库的 Release 收口不包含生产部署。

## Technology

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui foundation, TanStack Query
- Backend: Go, Echo, OpenAPI, oapi-codegen, pgx, sqlc, Goose
- Database: PostgreSQL
- Production: Nginx and systemd, without Docker

## Prerequisites

- Go 1.27 or newer
- Node.js 20 or newer with npm
- PostgreSQL 13 or newer, with separate development and test databases

Do not use a production database, production credentials, or production files in this workspace.

## Local setup

Copy `.env.example` to `.env.development.local`, configure a development-only database, then run:

```bash
mkdir -p .local/files .local/tmp .local/mail-outbox
npm --prefix frontend install
make generate
set -a; source .env.development.local; set +a
make migrate-up
make dev
```

Vite listens on `0.0.0.0:5173`; Go listens only on `127.0.0.1:8080`. For LAN testing, set `PUBLIC_BASE_URL=http://<LAN-IP>:5173`, start the dev services, and open `http://<LAN-IP>:5173`; Vite proxies same-origin `/api` requests.

## Commands

```bash
make generate
make lint
make test
make test-e2e
make test-integration  # requires TEST_DATABASE_URL for jl_business_test
make migrate-test-up   # refuses databases other than jl_business_test
make migrate-test-status
make reset-superadmin-password  # development/test only; sync configured initial password to the existing super admin
make build
make check
make release VERSION=v1.2.3  # local immutable Linux artifact and checksum
```

Health endpoints: `GET /api/health/live` and `GET /api/health/ready`.

The current schema is migration version 14, ending at
`00014_remove_import_export.sql`. PostgreSQL's `pg_trgm` extension remains
required for similarity search. PostgreSQL 13 and newer provide
`gen_random_uuid()` in core, so the application does not require `pgcrypto` or
an OpenSSL-enabled PostgreSQL build. V1 business money fields use decimal
strings in JSON and integer cents inside the Go money boundary; PostgreSQL
continues to use exact `numeric(14,2)` columns. `make test-integration` covers
V1 API acceptance.

The legacy import/export API and UI are not part of the current product. The
schema-14 migration removes their job table and finance deduplication metadata;
file attachments and account/file cleanup remain supported independently.

## Build and release version

Development builds identify themselves as `dev`. A formal release build injects
the same stable `vX.Y.Z` version, Git commit SHA, and UTC build time into the Go
binaries, frontend bundle, and `release.json`. The release directory, Linux
archive, and `SHA256SUMS` are written below `.local/release/`.

All account roles see the build version in the sidebar. Only `SUPER_ADMIN` can
open Version Center and call the server-side GitHub Release API. Online update
and application rollback are disabled by default with
`RELEASE_UPDATE_ENABLED=false`; enabling them is a separate production
operations decision. See [Release management](docs/release-management.md).

`SUPERADMIN_INITIAL_PASSWORD` is used only when the fixed super administrator is first created. If the development or test database already contains that account and the configured password needs to be recovered, update the local environment file and run `make reset-superadmin-password`. This command refuses production and invalidates the super administrator's existing sessions.
