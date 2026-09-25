-- +goose Up
-- Calendar events and contacts remain record-only.  Remove the obsolete
-- delivery queue and enum types now that the application no longer sends mail.
DROP TABLE IF EXISTS mail_deliveries;
DROP TYPE IF EXISTS mail_delivery_method;
DROP TYPE IF EXISTS mail_delivery_status;

-- +goose Down
-- Intentionally no-op: mail delivery is a removed product capability.