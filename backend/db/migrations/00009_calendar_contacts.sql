-- +goose Up
CREATE TABLE calendar_contacts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 200),
    CHECK (length(btrim(email)) BETWEEN 3 AND 320)
);

CREATE UNIQUE INDEX calendar_contacts_user_email_uidx
    ON calendar_contacts (user_id, lower(email));
CREATE INDEX calendar_contacts_user_updated_idx
    ON calendar_contacts (user_id, updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS calendar_contacts;
