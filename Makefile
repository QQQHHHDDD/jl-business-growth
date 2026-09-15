SHELL := /usr/bin/env bash

GO ?= go
NPM ?= npm
BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: dev generate generate-openapi generate-sqlc generate-frontend lint lint-backend lint-frontend \
	test test-backend test-integration test-performance test-frontend test-e2e build build-backend build-jobs build-frontend reset-superadmin-password \
	migrate-up migrate-status migrate-test-up migrate-test-status check-test-database check

dev:
	./scripts/dev.sh

reset-superadmin-password:
	cd $(BACKEND_DIR) && $(GO) run ./cmd/reset-superadmin-password

generate: generate-openapi generate-sqlc generate-frontend

generate-openapi:
	cd $(BACKEND_DIR) && $(GO) run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.5.0 --config oapi-codegen.yaml openapi/openapi.yaml

generate-sqlc:
	cd $(BACKEND_DIR) && $(GO) run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.29.0 generate

generate-frontend:
	$(NPM) --prefix $(FRONTEND_DIR) run generate:api

lint: lint-backend lint-frontend

lint-backend:
	@test -z "$$($(GO)fmt -l $$(find $(BACKEND_DIR) -name '*.go' -not -path '*/generated/*'))" || (echo 'Go files need gofmt'; exit 1)
	cd $(BACKEND_DIR) && $(GO) vet ./...

lint-frontend:
	$(NPM) --prefix $(FRONTEND_DIR) run lint

test: test-backend test-frontend

test-backend:
	cd $(BACKEND_DIR) && $(GO) test ./...

test-integration:
	$(MAKE) check-test-database
	cd $(BACKEND_DIR) && $(GO) test -v ./cmd/jl-business-api -run '^TestPhase[123456]APIIntegration$$'

test-performance:
	$(MAKE) check-test-database
	cd $(BACKEND_DIR) && PHASE7_PERFORMANCE=1 /usr/bin/time -v $(GO) test -v ./cmd/jl-business-api -run '^TestPhase7Performance$$' -count=1

test-frontend:
	$(NPM) --prefix $(FRONTEND_DIR) run test

test-e2e:
	@if [ "$${APP_ENV:-development}" = "test" ]; then $(MAKE) check-test-database; fi
	@test "$${APP_ENV:-development}" != "test" || test -n "$${E2E_SUPERADMIN_USERNAME}" || (echo 'APP_ENV=test requires E2E_SUPERADMIN_USERNAME'; exit 1)
	@test "$${APP_ENV:-development}" != "test" || test -n "$${E2E_SUPERADMIN_PASSWORD}" || (echo 'APP_ENV=test requires E2E_SUPERADMIN_PASSWORD'; exit 1)
	$(NPM) --prefix $(FRONTEND_DIR) run test:e2e

build: build-backend build-jobs build-frontend

build-backend:
	mkdir -p $(BACKEND_DIR)/bin
	cd $(BACKEND_DIR) && $(GO) build -o bin/jl-business-api ./cmd/jl-business-api

build-jobs:
	mkdir -p $(BACKEND_DIR)/bin
	cd $(BACKEND_DIR) && $(GO) build -o bin/jl-business-jobs ./cmd/jl-business-jobs

build-frontend:
	$(NPM) --prefix $(FRONTEND_DIR) run build

migrate-up:
	@test -n "$$DATABASE_URL" || (echo 'DATABASE_URL must be set'; exit 1)
	cd $(BACKEND_DIR) && $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations postgres "$$DATABASE_URL" up

migrate-status:
	@test -n "$$DATABASE_URL" || (echo 'DATABASE_URL must be set'; exit 1)
	cd $(BACKEND_DIR) && $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations postgres "$$DATABASE_URL" status

migrate-test-up:
	$(MAKE) check-test-database
	cd $(BACKEND_DIR) && $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations postgres "$$TEST_DATABASE_URL" up

migrate-test-status:
	$(MAKE) check-test-database
	cd $(BACKEND_DIR) && $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations postgres "$$TEST_DATABASE_URL" status

check-test-database:
	cd $(BACKEND_DIR) && $(GO) run ./cmd/check-test-database-url

check: generate lint test build
