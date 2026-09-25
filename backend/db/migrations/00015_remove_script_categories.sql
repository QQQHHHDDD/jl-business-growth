-- +goose Up
-- Script categories are replaced by user-defined script_type values.
ALTER TABLE communication_scripts
    DROP CONSTRAINT IF EXISTS communication_scripts_script_type_check;
ALTER TABLE communication_scripts
    ALTER COLUMN script_type DROP DEFAULT;

-- Preserve the old category label on every script before removing the
-- category relationship.  This migration is intentionally data-preserving:
-- user-created categories are the new script types.
UPDATE communication_scripts AS scripts
SET script_type = btrim(categories.name), updated_at = now()
FROM communication_script_categories AS categories
WHERE scripts.category_id = categories.id;

ALTER TABLE communication_scripts DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS communication_script_categories;

ALTER TABLE communication_scripts
    ADD CONSTRAINT communication_scripts_script_type_check
    CHECK (length(btrim(script_type)) BETWEEN 1 AND 80);

-- +goose Down
-- Intentionally no-op: the old category relationship is not reconstructed.
