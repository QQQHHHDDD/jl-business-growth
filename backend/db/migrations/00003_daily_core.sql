-- +goose Up
CREATE TYPE goal_type AS ENUM ('LONG_TERM', 'YEAR', 'STAGE', 'MONTH', 'WEEK', 'DAY');
CREATE TYPE goal_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');
CREATE TYPE learning_activity_type AS ENUM ('READING', 'AUDIO');
CREATE TYPE learning_session_source AS ENUM ('DAILY_UNALLOCATED');

CREATE TABLE dreams (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(title)) > 0)
);

CREATE INDEX dreams_user_order_idx ON dreams (user_id, sort_order, created_at);

CREATE TABLE goals (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    type goal_type NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    start_date DATE,
    due_date DATE,
    status goal_status NOT NULL DEFAULT 'NOT_STARTED',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(title)) > 0),
    CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX goals_user_parent_idx ON goals (user_id, parent_id, sort_order, created_at);

CREATE TABLE goal_metrics (
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    metric_code VARCHAR(64) NOT NULL,
    target_value NUMERIC(14,2) NOT NULL CHECK (target_value >= 0),
    unit VARCHAR(32) NOT NULL,
    PRIMARY KEY (goal_id, metric_code)
);

CREATE TABLE dream_goal_links (
    dream_id UUID NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    PRIMARY KEY (dream_id, goal_id)
);

CREATE INDEX dream_goal_links_goal_idx ON dream_goal_links (goal_id);

CREATE TABLE learning_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    activity_type learning_activity_type NOT NULL,
    activity_date DATE NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes >= 0),
    source learning_session_source NOT NULL DEFAULT 'DAILY_UNALLOCATED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX learning_daily_unallocated_unique
    ON learning_sessions (user_id, activity_date, activity_type)
    WHERE source = 'DAILY_UNALLOCATED';

CREATE TABLE daily_worklogs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    open_conversation_count INTEGER NOT NULL DEFAULT 0 CHECK (open_conversation_count >= 0),
    deep_conversation_count INTEGER NOT NULL DEFAULT 0 CHECK (deep_conversation_count >= 0),
    buffer_count INTEGER NOT NULL DEFAULT 0 CHECK (buffer_count >= 0),
    story_share_count INTEGER NOT NULL DEFAULT 0 CHECK (story_share_count >= 0),
    screening_count INTEGER NOT NULL DEFAULT 0 CHECK (screening_count >= 0),
    opportunity_count INTEGER NOT NULL DEFAULT 0 CHECK (opportunity_count >= 0),
    meeting_count INTEGER NOT NULL DEFAULT 0 CHECK (meeting_count >= 0),
    customer_followup_count INTEGER NOT NULL DEFAULT 0 CHECK (customer_followup_count >= 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, work_date)
);

CREATE INDEX daily_worklogs_user_date_idx ON daily_worklogs (user_id, work_date DESC);

CREATE TABLE daily_turnovers (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    turnover_date DATE NOT NULL,
    pv NUMERIC(14,2) NOT NULL CHECK (pv >= 0),
    net_amount NUMERIC(14,2) NOT NULL CHECK (net_amount >= 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, turnover_date)
);

CREATE INDEX daily_turnovers_user_date_idx ON daily_turnovers (user_id, turnover_date DESC);

-- +goose Down
DROP TABLE daily_turnovers;
DROP TABLE daily_worklogs;
DROP TABLE learning_sessions;
DROP TABLE dream_goal_links;
DROP TABLE goal_metrics;
DROP TABLE goals;
DROP TABLE dreams;
DROP TYPE learning_session_source;
DROP TYPE learning_activity_type;
DROP TYPE goal_status;
DROP TYPE goal_type;
