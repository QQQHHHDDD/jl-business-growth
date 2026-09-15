-- +goose Up
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'DELETING';

CREATE TABLE dream_files (
    dream_id UUID NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dream_id, file_id)
);
CREATE INDEX dream_files_file_idx ON dream_files (file_id);

ALTER TABLE team_members ADD COLUMN member_code TEXT;
UPDATE team_members SET member_code = 'member-' || replace(id::text, '-', '') WHERE member_code IS NULL;
ALTER TABLE team_members ALTER COLUMN member_code SET NOT NULL;
ALTER TABLE team_members ADD CONSTRAINT team_members_code_length CHECK (length(btrim(member_code)) BETWEEN 1 AND 100);
CREATE UNIQUE INDEX team_members_user_code_idx ON team_members (user_id, member_code);

ALTER TABLE import_jobs ADD COLUMN file_sha256 TEXT;
ALTER TABLE import_jobs ADD COLUMN duplicate_of_id UUID REFERENCES import_jobs(id) ON DELETE SET NULL;
ALTER TABLE import_jobs ADD COLUMN committed_at TIMESTAMPTZ;
CREATE INDEX import_jobs_file_hash_idx ON import_jobs (user_id, type, file_sha256) WHERE file_sha256 IS NOT NULL;
CREATE UNIQUE INDEX import_jobs_success_hash_idx ON import_jobs (user_id, type, file_sha256)
    WHERE status = 'COMMITTED' AND file_sha256 IS NOT NULL;

ALTER TABLE financial_transactions ADD COLUMN import_fingerprint TEXT;
CREATE INDEX financial_transactions_import_fingerprint_idx
    ON financial_transactions (user_id, import_fingerprint)
    WHERE import_fingerprint IS NOT NULL;

CREATE TABLE file_cleanup_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    storage_name TEXT NOT NULL,
    error_message TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX file_cleanup_failures_pending_idx ON file_cleanup_failures (storage_name) WHERE resolved_at IS NULL;
CREATE INDEX file_cleanup_failures_due_idx ON file_cleanup_failures (next_attempt_at) WHERE resolved_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS file_cleanup_failures;
ALTER TABLE financial_transactions DROP COLUMN IF EXISTS import_fingerprint;
DROP INDEX IF EXISTS import_jobs_success_hash_idx;
DROP INDEX IF EXISTS import_jobs_file_hash_idx;
ALTER TABLE import_jobs DROP COLUMN IF EXISTS committed_at;
ALTER TABLE import_jobs DROP COLUMN IF EXISTS duplicate_of_id;
ALTER TABLE import_jobs DROP COLUMN IF EXISTS file_sha256;
DROP INDEX IF EXISTS team_members_user_code_idx;
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_code_length;
ALTER TABLE team_members DROP COLUMN IF EXISTS member_code;
DROP TABLE IF EXISTS dream_files;
