-- +goose Up
CREATE TYPE calendar_recurrence_freq AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE calendar_recurrence_end_type AS ENUM ('NEVER', 'UNTIL', 'COUNT');
CREATE TYPE calendar_exception_type AS ENUM ('MODIFIED', 'CANCELLED');
CREATE TYPE mail_delivery_method AS ENUM ('REQUEST', 'CANCEL');
CREATE TYPE mail_delivery_status AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE review_type AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    uid TEXT NOT NULL UNIQUE,
    sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    description TEXT,
    location_or_link TEXT,
    timezone TEXT NOT NULL CHECK (length(btrim(timezone)) BETWEEN 1 AND 64),
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    recurrence_freq calendar_recurrence_freq NOT NULL DEFAULT 'NONE',
    recurrence_interval INTEGER NOT NULL DEFAULT 1 CHECK (recurrence_interval >= 1),
    recurrence_weekdays SMALLINT[],
    recurrence_end_type calendar_recurrence_end_type NOT NULL DEFAULT 'NEVER',
    recurrence_until TIMESTAMPTZ,
    recurrence_count INTEGER CHECK (recurrence_count IS NULL OR recurrence_count >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_at > start_at),
    CHECK (recurrence_freq = 'WEEKLY' OR recurrence_weekdays IS NULL),
    CHECK ((recurrence_end_type = 'NEVER' AND recurrence_until IS NULL AND recurrence_count IS NULL)
        OR (recurrence_end_type = 'UNTIL' AND recurrence_until IS NOT NULL AND recurrence_count IS NULL)
        OR (recurrence_end_type = 'COUNT' AND recurrence_until IS NULL AND recurrence_count IS NOT NULL)),
    CHECK (recurrence_weekdays IS NULL OR recurrence_weekdays <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[])
);

CREATE INDEX calendar_events_user_start_idx ON calendar_events (user_id, start_at);
CREATE INDEX calendar_events_user_updated_idx ON calendar_events (user_id, updated_at DESC);

CREATE TABLE calendar_event_exceptions (
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    original_occurrence_start TIMESTAMPTZ NOT NULL,
    exception_type calendar_exception_type NOT NULL,
    override_title TEXT,
    override_start_at TIMESTAMPTZ,
    override_end_at TIMESTAMPTZ,
    override_description TEXT,
    override_location TEXT,
    PRIMARY KEY (event_id, original_occurrence_start),
    CHECK (exception_type = 'CANCELLED' OR override_start_at IS NOT NULL AND override_end_at IS NOT NULL AND override_end_at > override_start_at)
);

CREATE TABLE calendar_attendees (
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    email TEXT NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 320),
    display_name TEXT,
    PRIMARY KEY (event_id, email)
);

CREATE TABLE mail_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    occurrence_start TIMESTAMPTZ,
    attendee_email TEXT NOT NULL,
    method mail_delivery_method NOT NULL,
    status mail_delivery_status NOT NULL DEFAULT 'PENDING',
    provider_message_id TEXT,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX mail_deliveries_event_idx ON mail_deliveries (calendar_event_id, created_at DESC);

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type review_type NOT NULL,
    period_start DATE NOT NULL,
    good TEXT NOT NULL DEFAULT '',
    problems TEXT NOT NULL DEFAULT '',
    improvements TEXT NOT NULL DEFAULT '',
    next_focus TEXT NOT NULL DEFAULT '',
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, type, period_start)
);

CREATE INDEX reviews_user_period_idx ON reviews (user_id, period_start DESC);

-- +goose Down
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS mail_deliveries;
DROP TABLE IF EXISTS calendar_attendees;
DROP TABLE IF EXISTS calendar_event_exceptions;
DROP TABLE IF EXISTS calendar_events;
DROP TYPE IF EXISTS review_type;
DROP TYPE IF EXISTS mail_delivery_status;
DROP TYPE IF EXISTS mail_delivery_method;
DROP TYPE IF EXISTS calendar_exception_type;
DROP TYPE IF EXISTS calendar_recurrence_end_type;
DROP TYPE IF EXISTS calendar_recurrence_freq;
