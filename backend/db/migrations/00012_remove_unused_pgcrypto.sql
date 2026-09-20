-- +goose Up
DROP EXTENSION IF EXISTS pgcrypto;

-- +goose Down
-- Intentionally no-op: pgcrypto is unused and must not be reintroduced.
