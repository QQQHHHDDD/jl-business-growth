-- +goose Up
CREATE TABLE communication_friend_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (length(btrim(platform)) BETWEEN 1 AND 64),
    account_label TEXT NOT NULL CHECK (length(btrim(account_label)) BETWEEN 1 AND 120),
    group_name TEXT NOT NULL CHECK (length(btrim(group_name)) BETWEEN 1 AND 200),
    add_direction TEXT NOT NULL DEFAULT 'FORWARD' CHECK (add_direction IN ('FORWARD', 'REVERSE')),
    last_applied_person TEXT NOT NULL DEFAULT '' CHECK (length(last_applied_person) <= 200),
    application_script TEXT NOT NULL DEFAULT '',
    first_message TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX communication_friend_records_user_updated_idx ON communication_friend_records (user_id, archived, updated_at DESC);

CREATE TABLE communication_script_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE communication_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id UUID REFERENCES communication_script_categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    script_type TEXT NOT NULL DEFAULT 'STAGE' CHECK (script_type IN ('STAGE', 'FAQ')),
    tags TEXT[] NOT NULL DEFAULT '{}',
    paragraphs JSONB NOT NULL CHECK (jsonb_typeof(paragraphs) = 'array' AND jsonb_array_length(paragraphs) > 0),
    note TEXT NOT NULL DEFAULT '',
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX communication_scripts_user_updated_idx ON communication_scripts (user_id, favorite DESC, updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS communication_scripts;
DROP TABLE IF EXISTS communication_script_categories;
DROP TABLE IF EXISTS communication_friend_records;
