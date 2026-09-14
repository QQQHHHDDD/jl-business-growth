-- +goose Up
CREATE TYPE team_member_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE team_snapshot_type AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE knowledge_item_type AS ENUM ('AUDIO', 'VIDEO', 'BOOK', 'EVENT', 'MEETING', 'PHP', 'MENTOR', 'PRODUCT', 'OTHER');
CREATE TYPE knowledge_item_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE file_asset_category AS ENUM ('DREAM_IMAGE', 'KNOWLEDGE_DOCUMENT', 'KNOWLEDGE_IMAGE');

ALTER TYPE learning_session_source ADD VALUE IF NOT EXISTS 'ITEM';

CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    parent_member_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    joined_on DATE,
    rank TEXT,
    city TEXT,
    status team_member_status NOT NULL DEFAULT 'ACTIVE',
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (parent_member_id IS NULL OR parent_member_id <> id)
);
CREATE INDEX team_members_user_parent_idx ON team_members (user_id, parent_member_id, sort_order, created_at);

CREATE TABLE team_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    snapshot_month DATE NOT NULL,
    snapshot_type team_snapshot_type NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    captured_late BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (user_id, snapshot_month, snapshot_type)
);
CREATE INDEX team_snapshots_user_month_idx ON team_snapshots (user_id, snapshot_month DESC);

CREATE TABLE team_snapshot_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES team_snapshots(id) ON DELETE CASCADE,
    original_member_id UUID NOT NULL,
    parent_snapshot_member_id UUID,
    name TEXT NOT NULL,
    joined_on DATE,
    rank TEXT,
    city TEXT,
    status team_member_status NOT NULL,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX team_snapshot_members_snapshot_idx ON team_snapshot_members (snapshot_id, sort_order, name);

CREATE TABLE knowledge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
    type knowledge_item_type NOT NULL DEFAULT 'OTHER',
    raw_text TEXT,
    summary TEXT,
    understanding TEXT,
    action_items TEXT,
    source_url TEXT,
    learned_on DATE,
    status knowledge_item_status NOT NULL DEFAULT 'NOT_STARTED',
    progress_current NUMERIC(14,2),
    progress_total NUMERIC(14,2),
    progress_unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (progress_current IS NULL OR progress_current >= 0),
    CHECK (progress_total IS NULL OR progress_total >= 0),
    CHECK (progress_current IS NULL OR progress_total IS NULL OR progress_current <= progress_total)
);
CREATE INDEX knowledge_items_user_updated_idx ON knowledge_items (user_id, updated_at DESC);

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    name_normalized TEXT NOT NULL,
    UNIQUE (user_id, name_normalized)
);

CREATE TABLE knowledge_item_tags (
    knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (knowledge_item_id, tag_id)
);

ALTER TABLE learning_sessions
    ADD COLUMN knowledge_item_id UUID REFERENCES knowledge_items(id) ON DELETE CASCADE;
ALTER TABLE learning_sessions ADD COLUMN note TEXT;
-- Keep this index independent of the enum value added above. PostgreSQL only
-- makes a new enum label usable after the ALTER TYPE transaction commits.
CREATE INDEX learning_sessions_item_idx ON learning_sessions (knowledge_item_id, activity_date);

CREATE TABLE file_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category file_asset_category NOT NULL,
    original_name TEXT NOT NULL CHECK (length(btrim(original_name)) BETWEEN 1 AND 255),
    storage_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX file_assets_user_created_idx ON file_assets (user_id, created_at DESC);

CREATE TABLE knowledge_item_files (
    knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
    PRIMARY KEY (knowledge_item_id, file_id)
);

-- +goose Down
DROP TABLE IF EXISTS knowledge_item_files;
DROP TABLE IF EXISTS file_assets;
ALTER TABLE learning_sessions DROP COLUMN IF EXISTS knowledge_item_id;
DROP TABLE IF EXISTS knowledge_item_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS knowledge_items;
DROP TABLE IF EXISTS team_snapshot_members;
DROP TABLE IF EXISTS team_snapshots;
DROP TABLE IF EXISTS team_members;
DROP TYPE IF EXISTS file_asset_category;
DROP TYPE IF EXISTS knowledge_item_status;
DROP TYPE IF EXISTS knowledge_item_type;
DROP TYPE IF EXISTS team_snapshot_type;
DROP TYPE IF EXISTS team_member_status;
