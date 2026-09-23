-- +goose Up
-- Import/export was removed from the application. This migration intentionally
-- deletes its persisted jobs and deduplication metadata; file cleanup remains
-- an independent runtime concern.
DROP INDEX IF EXISTS financial_transactions_import_fingerprint_idx;
ALTER TABLE financial_transactions DROP COLUMN IF EXISTS import_fingerprint;
DROP TABLE IF EXISTS import_jobs;
DROP TYPE IF EXISTS import_job_status;
DROP TYPE IF EXISTS import_job_type;

-- +goose Down
-- Intentionally no-op: removed import jobs and metadata cannot be restored.
