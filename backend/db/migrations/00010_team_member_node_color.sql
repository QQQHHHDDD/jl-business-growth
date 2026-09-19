-- +goose Up
ALTER TABLE team_members
    ADD COLUMN node_color TEXT NOT NULL DEFAULT '#0f766e';

ALTER TABLE team_members
    ADD CONSTRAINT team_members_node_color_format
    CHECK (node_color ~ '^#[0-9A-Fa-f]{6}$');

-- +goose Down
ALTER TABLE team_members
    DROP CONSTRAINT IF EXISTS team_members_node_color_format;

ALTER TABLE team_members
    DROP COLUMN IF EXISTS node_color;
