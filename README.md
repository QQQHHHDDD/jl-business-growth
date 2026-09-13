# JL团队生意成长管理系统

JL 团队内部使用的个人生意成长与经营管理系统。正式产品和技术规则在 [docs/00-文档索引.md](docs/00-文档索引.md)。仓库从 Phase 0 工程基线开始；身份、业务功能和生产部署尚未实现。

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

Vite listens on `0.0.0.0:5173`; Go listens only on `127.0.0.1:8080`. LAN browsers open `http://<LAN-IP>:5173`; Vite proxies same-origin `/api` requests.

## Commands

```bash
make generate
make lint
make test
make test-e2e
make build
make check
```

Health endpoints: `GET /api/health/live` and `GET /api/health/ready`.
