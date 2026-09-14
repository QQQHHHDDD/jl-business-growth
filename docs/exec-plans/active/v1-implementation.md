# V1 Implementation Plan

- Status: Phase 4 and Phase 5 complete; committed
- Updated: 2026-09-14
- Source: `docs/00-文档索引.md` and current design documents `01` through `08`

## Environment Detection

| Item | State | Action |
|---|---|---|
| OS / architecture | Ubuntu 22.04.5 LTS / x86_64 / 32 CPUs | Supported platform |
| Git | Initialized; `43af68f` contains the Phase 0 baseline, `d39d52a` contains the Phase 1 password recovery fix, `dcbf05d` contains the Phase 2 daily core loop, and `0380886` contains the Phase 3 calendar, reviews, and analytics implementation | Keep each verified phase in its own semantic commit |
| Go | 1.26.1 | Below required Go 1.27+; upgrade before final Go validation |
| Node / npm | Not on system PATH; local Node 24 toolchain exists | Use local toolchain for current project validation |
| PostgreSQL | PostgreSQL 14 is installed; current local cluster is down (`pg_isready` reports no response) | User must start the existing service before migration/status checks; no sudo action was run |
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

### Phase 1: Identity, administrators, and invitations

- [x] Account roles, fixed super administrator bootstrap, and Argon2id passwords
- [x] Invitation registration with usage limits, expiry, disable, and usage audit records
- [x] Login, logout, password change, administrator password reset, and timezone settings
- [x] Server-side browser sessions, CSRF, origin checks, and multiple normal-account switching
- [x] User and ordinary-administrator status/delete operations with session invalidation
- [x] Super-administrator ordinary-administrator CRUD
- [x] Administrator/user API separation with no business-data read endpoint
- [x] Frontend settings and administrator workbench with destructive-action confirmation
- [x] Focused backend security tests and frontend API/authentication tests
- [x] Database-backed Phase 1 Playwright flow is available with explicit test credentials

### Phase 1 frontend shell and design system refresh

- [x] Add React Router, React Hook Form, Zod, Radix Dialog/Tabs/Slot, and shared UI primitives
- [x] Establish the responsive application shell, role-aware navigation, mobile drawer, bottom navigation, and health indicator
- [x] Migrate authentication, dashboard, settings, account switching, and administrator pages to the shared shell
- [x] Register all documented user and administrator routes with role guards and placeholder pages for later phases
- [x] Replace destructive `window.confirm`/`window.prompt` flows with accessible confirmation and prompt dialogs
- [x] Add route, shell, shared-component, mobile, loading, empty, error, and dialog regression coverage
- [x] Keep backend API, OpenAPI contract, and database migrations unchanged

Phase 1 and Phase 2 database-backed acceptance completed against the isolated `jl_business_test` database. The test migration and integration commands refuse any database other than `jl_business_test`. When `APP_ENV=test`, the Playwright backend is explicitly given `TEST_DATABASE_URL`, `E2E_SUPERADMIN_USERNAME`, and `E2E_SUPERADMIN_PASSWORD`; it cannot reuse an existing development backend.

### Phase 2: Daily core loop

- [x] Add dreams, goals, goal metrics, daily worklogs, learning-minute allocation, and daily turnovers migrations
- [x] Add OpenAPI contract, sqlc queries, and Go domain services for daily core data
- [x] Add dashboard aggregation without duplicating turnover or goal actuals
- [x] Add user-scoped API integration coverage for daily core and goal progress
- [x] Add worklog, turnover, dashboard, dream, and goal pages with target-map visualization
- [x] Add frontend and Playwright coverage for daily entry, turnover conversion, goal progress, and isolation
- [x] Run the complete phase gate and create a dedicated Phase 2 commit

### Phase 3-6

Implement calendar/reviews; team/learning/files/search; finance/income simulation; import/export/data governance, in that order.

### Phase 3: Calendar, invitations, reviews, and analytics

- [x] Add calendar, recurrence, exception, attendee, mail-delivery, and review schema
- [x] Add calendar/review/analytics OpenAPI contract and user-scoped handlers
- [x] Add IANA-timezone recurrence expansion, ICS REQUEST/CANCEL generation, file mail, and SMTP adapter
- [x] Add daily, weekly, and monthly review storage with live period totals
- [x] Add basic worklog, turnover, and goal aggregation endpoints
- [x] Add calendar, review, and analytics frontend pages and critical E2E flow
- [x] Run Phase 3 database-backed integration and full E2E acceptance on the host
- [x] Create the dedicated Phase 3 commit after all acceptance gates pass

### Phase 4: Team, learning, files, and search

- [x] Add team members, hierarchy validation, and monthly/manual immutable snapshots
- [x] Add knowledge items, normalized tags, item learning sessions, and daily minute allocation validation
- [x] Add safe file upload, ownership checks, MIME/extension and size limits, inline/attachment delivery
- [x] Add user-scoped PostgreSQL fuzzy search across supported business records
- [x] Add Phase 4 OpenAPI contract, generated types, services, handlers, frontend pages, and E2E coverage
- [x] Run local Go/frontend generation, lint, unit tests, build, and diff checks
- [x] Run Phase 4 database-backed integration and full E2E acceptance on the host
- [x] Create the atomic Phase 4/5 commit after all acceptance gates pass

### Phase 5: Finance and income simulation

- [x] Add finance categories, transactions, monthly budgets, savings, and emergency-fund snapshots
- [x] Add versioned income simulation snapshots with copy, compare, and delete operations
- [x] Implement the Excel-compatible V1 calculation engine and fixed double-year rank table
- [x] Add Golden Test coverage for zero/default, thresholds, special market, BFI/BBI, annual growth, and double-year cases
- [x] Add Phase 5 OpenAPI contract, generated types, services, handlers, frontend pages, and E2E coverage
- [x] Run local Go/frontend generation, lint, unit tests, build, and diff checks
- [x] Run Phase 5 database-backed integration and full E2E acceptance on the host
- [x] Include the Phase 5 implementation in the atomic Phase 4/5 commit

## Migration Order

`00001_extensions.sql` (`pgcrypto`, `pg_trgm`), then Phase 1 account/session/invitation schema, followed by each phase's schema. Published migrations are immutable.

## API Order

Health and shared envelope, then auth/admin, daily core, calendar/reviews, team/knowledge/files/search, finance/income, and import/export.

## Test Strategy

Go unit tests and PostgreSQL integration tests use only `jl_business_test`; Vitest/RTL cover frontend behavior; Playwright covers phase-relevant critical flows. `make check` is the phase gate. Income simulation additionally requires fixed Excel Golden Tests.

## Active Blockers

None known in the source tree or required host acceptance. Database credentials remain outside the checkout by design.

## Warnings

- The system `go version` is 1.26.1, while the project requires Go 1.27+. `GOTOOLCHAIN=auto` selected Go 1.27.0 for the validated commands; upgrading the host default Go remains recommended.
- Node/npm are provided by the local Node 24 toolchain rather than the system PATH.
- Development HTTP uses `bos_session` / `bos_csrf`; secure production deployments use the required `__Host-bos_session` / `__Host-bos_csrf` cookies.
- The current implementation uses the locally available Go 1.27.0 toolchain for validation; the host default Go remains unchanged.
- `npm install` reports 2 moderate audit findings and an esbuild install-script approval warning; no forced audit upgrade was applied because it could change unrelated dependency versions.

## Host Validation Commands

Run these on the Ubuntu development host, outside the restricted execution sandbox:

```bash
# Use the already available Node 24 toolchain for this checkout.
export PATH=/home/qhd/code/.tools/node-v24.18.1-linux-x64/bin:$PATH
cd /home/qhd/code/jl-business-growth
npm --prefix frontend install

# Start the existing PostgreSQL service if it is stopped. Do not recreate
# roles/databases if the earlier setup already created them.
sudo systemctl enable --now postgresql
pg_isready -h 127.0.0.1 -p 5432
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
- Phase 1 security hardening: application-level login/registration rate limiting, strict JSON mutation content type, strict first-start super-admin credential pairing, PostgreSQL unique-violation handling, and ACTIVE-account session creation guard were added and tested.
- Phase 1 browser flow: `frontend/e2e/phase1-auth.spec.ts` covers super-admin login, invitation creation, invitation registration, and same-browser normal-account linking/switching; it is skipped unless `E2E_SUPERADMIN_USERNAME` and `E2E_SUPERADMIN_PASSWORD` are explicitly supplied.
- API HTTP smoke checks: user confirmed both `/api/health/live` and `/api/health/ready` returned OK with the migrated database.
- Phase 1 backend unit tests, vet, and binary build: passed with the local Go 1.27.0 toolchain.
- Phase 1 frontend Vitest, lint, TypeScript/Vite build: passed; 6 frontend tests pass.
- Phase 1 security tests cover Argon2id password boundaries, CSRF, cross-site mutation rejection, secure/development cookie naming, and sanitized internal errors.
- `backend/cmd/jl-business-api/main_integration_test.go` and `make test-integration` provide the PostgreSQL-backed Phase 1 API gate; the test is skipped without `TEST_DATABASE_URL` and refuses non-`jl_business_test` URLs.
- `frontend/playwright.config.ts` and `make test-e2e` enforce the test database and test-only bootstrap credentials when `APP_ENV=test`; they do not reuse a development API process in that mode.
- `make migrate-test-up` and `make migrate-test-status` apply/check migrations through `TEST_DATABASE_URL` and refuse a URL whose database name is not exactly `jl_business_test`.
- Final local `make check` after Phase 1 integration-test cleanup: passed; `git diff --check` passed.
- Final local `make check` after security-header, strict-Origin, proxy-IP, and frontend auth-query race fixes: passed; `git diff --check` passed.
- `go test -race ./...`: passed with the local Go 1.27.0 toolchain.
- Final local `make check` after restricting trusted proxy IP extraction to loopback Nginx hops and forcing the test Playwright backend to use its local Origin: passed; direct-header spoofing coverage added.
- Database-backed acceptance completed on the host: test database migration version 2, `TestPhase1APIIntegration`, and both Playwright tests passed.
- Final Phase 1 regression: frontend Vitest 8 tests, backend `go test -race ./...`, `make check`, `make test-integration`, `make test-e2e`, and `git diff --check` passed.
- Added `make reset-superadmin-password` as a development/test-only recovery command for an existing fixed super administrator; it updates the configured password hash, invalidates that account's sessions, refuses production, and was verified against the development API with HTTP 200 login.
- Frontend shell refresh: `make generate`, `make lint`, `make test`, `make build`, and `make check` passed; Vitest now covers 21 tests across five files.
- Frontend shell refresh: desktop baseline E2E passed; mobile shell and Phase 1 database-backed E2E are skipped when the host shell does not provide `APP_ENV=test`, `TEST_DATABASE_URL`, and explicit E2E credentials.
- Frontend shell refresh: `make test-integration` was attempted and correctly refused the current shell because `TEST_DATABASE_URL` was unset; rerun with the isolated `jl_business_test` URL before final host acceptance.
- Frontend shell refresh: `git diff --check` passed; only frontend source, dependency, Playwright, and this execution-plan documentation are changed.
- Phase 2 daily-core acceptance: development and isolated test databases migrated to version 3; `TestPhase1APIIntegration` and `TestPhase2APIIntegration` passed.
- Phase 2 frontend acceptance: Playwright baseline, Phase 1 administrator plus Phase 2 daily-core flow, and mobile shell passed (3 tests); the flow covers daily worklog entry, PV conversion, goal progress, dream creation, Dashboard totals, and account flow.
- Phase 2 local gate: `make generate`, `make lint`, `make test`, `make build`, `make check`, backend race tests, and `git diff --check` passed; generated API/sqlc files are stable.
- Phase 2 UI regression: shared `Input` fields now generate unique IDs when field names repeat; Vitest covers this label-association case.
- Phase 3 local implementation: calendar/reviews/analytics services, OpenAPI generation, frontend lint/build/Vitest, backend tests/race tests, and `git diff --check` passed.
- Phase 3 host acceptance: development and isolated test databases migrated to version 4; Phase 1/2/3 API integration tests passed; Playwright baseline, Phase 1-3 flow, and mobile shell passed (3 tests).
- Phase 4/5 local implementation: migrations 00005-00006, OpenAPI/sqlc generation, Go vet/tests/race tests, frontend lint/Vitest/build, and `git diff --check` passed.
- Phase 4/5 host acceptance completed: migrations are at version 6, Phase 1-5 API integration tests passed, and desktop baseline, Phase 1-5 flow, and mobile shell Playwright tests passed (3 tests).
- Final Phase 4/5 regression: `make check`, backend `go test -race ./...` from `backend`, and `git diff --check` passed.
