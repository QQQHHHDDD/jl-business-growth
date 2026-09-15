# JL团队生意成长管理系统

JL 团队内部使用的个人生意成长与经营管理系统。正式产品和技术规则在 [docs/00-文档索引.md](docs/00-文档索引.md)。当前仓库已完成 Phase 0-6 主体开发和 V1 收口修复，已具备进入第 7 阶段综合测试的条件；本仓库不在本次收口任务中执行第 7 阶段或生产部署。

## Technology

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui foundation, TanStack Query
- Backend: Go, Echo, OpenAPI, oapi-codegen, pgx, sqlc, Goose
- Database: PostgreSQL
- Production: Nginx and systemd, without Docker

## Prerequisites

- Go 1.27 or newer
- Node.js 20 or newer with npm
- PostgreSQL with separate development and test databases

Do not use a production database or production credentials in this workspace.

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
```

Health endpoints: `GET /api/health/live` and `GET /api/health/ready`.

The current schema is migration version 8. V1 business money fields use decimal
strings in JSON and integer cents inside the Go money boundary; PostgreSQL
continues to use exact `numeric(14,2)` columns. `make test-integration` covers
Phase 1-6 API acceptance only.

`SUPERADMIN_INITIAL_PASSWORD` is used only when the fixed super administrator is first created. If the development or test database already contains that account and the configured password needs to be recovered, update the local environment file and run `make reset-superadmin-password`. This command refuses production and invalidates the super administrator's existing sessions.
