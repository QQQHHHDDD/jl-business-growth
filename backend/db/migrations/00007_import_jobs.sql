-- +goose Up
CREATE TYPE import_job_type AS ENUM ('WORKLOG', 'FINANCE', 'TEAM', 'TURNOVER');
CREATE TYPE import_job_status AS ENUM ('UPLOADED', 'VALIDATED', 'COMMITTED', 'FAILED', 'EXPIRED');

CREATE TABLE import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type import_job_type NOT NULL,
    temp_file_path TEXT NOT NULL,
    status import_job_status NOT NULL DEFAULT 'UPLOADED',
    row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    valid_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
    invalid_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
    validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX import_jobs_user_created_idx ON import_jobs (user_id, created_at DESC);
CREATE INDEX import_jobs_expiry_idx ON import_jobs (status, expires_at);

-- +goose Down
DROP TABLE IF EXISTS import_jobs;
DROP TYPE IF EXISTS import_job_status;
DROP TYPE IF EXISTS import_job_type;
