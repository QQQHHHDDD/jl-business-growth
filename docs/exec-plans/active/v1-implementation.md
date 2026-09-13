# V1 Implementation Plan

- Status: Phase 0 complete; Phase 1 not started
- Updated: 2026-09-13
- Source: `docs/00-文档索引.md` and current design documents `01` through `08`

## Environment Detection

| Item | State | Action |
|---|---|---|
| OS / architecture | Ubuntu 22.04.5 LTS / x86_64 / 32 CPUs | Supported platform |
| Git | Initialized, no commits; source files untracked | Preserve history; no commit without user approval |
| Go | 1.26.1 | Below required Go 1.27+; upgrade before final Go validation |
| Node / npm | Not on system PATH; local Node 24 toolchain exists | Use local toolchain for current project validation |
| PostgreSQL | PostgreSQL 14 is installed and accepting connections | Run migration/status checks against isolated dev/test databases |
| Docker | Available but forbidden by design | Do not use |
| sqlc/goose/oapi-codegen | Not global | Use pinned project-scoped Go tools |

## Phase Plan

### Phase 0: Engineering Baseline

- [x] Read all current design documents and inspect environment
- [x] Create repository skeleton, configuration, README, and local command entrypoints
- [x] Create React/Vite frontend with proxy, generated API type baseline, tests, and build configuration
- [x] Create Go/Echo service with config, pgx, health endpoints, OpenAPI, oapi-codegen, Goose, and sqlc
- [x] Run Goose migration/status and Playwright baseline E2E on the Ubuntu host
- [x] Run Go API with the migrated database and verify live/ready HTTP checks
- [x] Record results and stop before Phase 1

### Phase 1-6

Implement identity/admin/invitations; daily core; calendar/reviews; team/learning/files/search; finance/income simulation; import/export/data governance, in that order.

## Migration Order

`00001_extensions.sql` (`pgcrypto`, `pg_trgm`), then Phase 1 account/session/invitation schema, followed by each phase's schema. Published migrations are immutable.

## API Order

Health and shared envelope, then auth/admin, daily core, calendar/reviews, team/knowledge/files/search, finance/income, and import/export.

## Test Strategy

Go unit tests and PostgreSQL integration tests use only `jl_business_test`; Vitest/RTL cover frontend behavior; Playwright covers phase-relevant critical flows. `make check` is the phase gate. Income simulation additionally requires fixed Excel Golden Tests.

## Active Blockers

None for Phase 0. Phase 1 has intentionally not started.

## Warnings

- The system `go version` is 1.26.1, while the project requires Go 1.27+. `GOTOOLCHAIN=auto` selected Go 1.27.0 for the validated commands; upgrading the host default Go remains recommended.
- Node/npm are provided by the local Node 24 toolchain rather than the system PATH.

## Host Validation Commands (Completed)

Run these on the Ubuntu development host, outside the restricted execution sandbox:

```bash
# Use the already available Node 24 toolchain for this checkout.
export PATH=/home/qhd/code/.tools/node-v24.18.1-linux-x64/bin:$PATH
cd /home/qhd/code/jl-business-growth
npm --prefix frontend install

# PostgreSQL is already installed and accepting connections. Do not recreate
# the role/databases if the earlier setup already created them.
unset GOPROXY
unset GOSUMDB
make migrate-up
make migrate-status

# Download the browser used by the Playwright smoke test if it is missing.
cd frontend
npx playwright install chromium
cd ..
make test-e2e

# Start the API and verify both health endpoints from another terminal.
make dev
curl -i http://127.0.0.1:8080/api/health/live
curl -i http://127.0.0.1:8080/api/health/ready
```

The PostgreSQL commands are required for Goose migration, sqlc schema validation, real pgx connectivity, and a successful `/api/health/ready` check. Do not point either database at production data.

## Validation Log

- `go mod tidy`: passed with the automatic Go 1.27.0 toolchain.
- `make lint-backend`: passed.
- `make test-backend`: passed; configuration and health handler tests pass.
- `make build-backend`: passed; x86-64 API binary built.
- Initial `make generate`: passed for oapi-codegen v2.5.0 and sqlc v1.29.0; generated files are present.
- `make generate`: passed using the locally cached pinned Go tools and npm dependencies.
- `npm --prefix frontend install --offline`: initially blocked because npm cache lacked `@eslint/js` metadata; normal install later completed.
- Frontend lint and build: passed after npm dependencies were installed.
- Frontend unit test: passed after fixing Vitest scope so Playwright files are excluded.
- Goose migration: passed; `00001_extensions.sql` applied and status reports version 1.
- Frontend E2E: passed after Chromium installation; Playwright auto-started the Go API and asserted the live health state without proxy errors.
- `make lint test build`: passed; backend vet/tests/build and frontend lint/Vitest/build all pass.
- `make check`: passed with the local cached Go module proxy and installed frontend dependencies.
- API HTTP smoke checks: user confirmed both `/api/health/live` and `/api/health/ready` returned OK with the migrated database.
