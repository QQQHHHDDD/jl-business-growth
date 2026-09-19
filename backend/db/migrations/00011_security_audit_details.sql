-- +goose Up
ALTER TABLE security_audit_logs
    ADD COLUMN details JSONB NOT NULL DEFAULT '{}'::jsonb;

-- +goose Down
ALTER TABLE security_audit_logs
    DROP COLUMN details;
