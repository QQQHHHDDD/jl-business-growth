-- +goose Up
CREATE TABLE communication_script_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);
CREATE UNIQUE INDEX communication_script_types_user_name_lower_idx
    ON communication_script_types (user_id, lower(name));

-- Preserve the type names already attached to scripts during upgrade. A fresh
-- database has no scripts here, so it starts with an empty type list.
INSERT INTO communication_script_types (user_id, name)
SELECT DISTINCT ON (user_id, lower(script_type)) user_id, script_type
FROM communication_scripts
ORDER BY user_id, lower(script_type), script_type;

UPDATE communication_scripts AS scripts
SET script_type = types.name, updated_at = now()
FROM communication_script_types AS types
WHERE scripts.user_id = types.user_id
  AND lower(scripts.script_type) = lower(types.name)
  AND scripts.script_type <> types.name;

-- +goose Down
-- Intentionally no-op: type management is forward-only and script content must not be rewritten.
