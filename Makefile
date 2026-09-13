SHELL := /usr/bin/env bash

GO ?= go
NPM ?= npm
BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: dev generate generate-openapi generate-sqlc generate-frontend lint lint-backend lint-frontend \
	test test-backend test-frontend test-e2e build build-backend build-frontend \
	migrate-up migrate-status check

dev:
	./scripts/dev.sh

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

test-frontend:
	$(NPM) --prefix $(FRONTEND_DIR) run test

test-e2e:
	$(NPM) --prefix $(FRONTEND_DIR) run test:e2e

build: build-backend build-frontend

build-backend:
	mkdir -p $(BACKEND_DIR)/bin
	cd $(BACKEND_DIR) && $(GO) build -o bin/jl-business-api ./cmd/jl-business-api

build-frontend:
	$(NPM) --prefix $(FRONTEND_DIR) run build

migrate-up:
	@test -n "$$DATABASE_URL" || (echo 'DATABASE_URL must be set'; exit 1)
	cd $(BACKEND_DIR) && $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations postgres "$$DATABASE_URL" up

migrate-status:
	@test -n "$$DATABASE_URL" || (echo 'DATABASE_URL must be set'; exit 1)
	cd $(BACKEND_DIR) && $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.25.0 -dir db/migrations postgres "$$DATABASE_URL" status

check: generate lint test build
