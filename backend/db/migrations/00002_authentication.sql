-- +goose Up
CREATE TYPE account_role AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE account_status AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE invitation_status AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    password_hash TEXT NOT NULL,
    role account_role NOT NULL,
    status account_status NOT NULL DEFAULT 'ACTIVE',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX accounts_username_lower_unique ON accounts (lower(username));
CREATE UNIQUE INDEX accounts_one_super_admin ON accounts (role) WHERE role = 'SUPER_ADMIN';

CREATE TABLE browser_sessions (
    id UUID PRIMARY KEY,
    token_hash BYTEA NOT NULL UNIQUE,
    active_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    csrf_token_hash BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX browser_sessions_active_account_idx ON browser_sessions (active_account_id);
CREATE INDEX browser_sessions_expires_at_idx ON browser_sessions (expires_at);

CREATE TABLE browser_session_accounts (
    browser_session_id UUID NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    authenticated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (browser_session_id, account_id)
);

CREATE INDEX browser_session_accounts_account_idx ON browser_session_accounts (account_id);

CREATE TABLE invitation_codes (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    status invitation_status NOT NULL DEFAULT 'ACTIVE',
    max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invitation_codes_status_idx ON invitation_codes (status, expires_at);
CREATE UNIQUE INDEX invitation_codes_code_lower_unique ON invitation_codes (lower(code));

CREATE TABLE invitation_uses (
    invitation_code_id UUID NOT NULL REFERENCES invitation_codes(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (invitation_code_id, account_id)
);

CREATE TABLE security_audit_logs (
    id UUID PRIMARY KEY,
    actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    target_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    target_id UUID,
    ip_address INET,
    user_agent_summary VARCHAR(256),
    request_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX security_audit_logs_created_at_idx ON security_audit_logs (created_at DESC);
CREATE INDEX security_audit_logs_actor_idx ON security_audit_logs (actor_account_id, created_at DESC);

-- +goose Down
DROP TABLE security_audit_logs;
DROP TABLE invitation_uses;
DROP TABLE invitation_codes;
DROP TABLE browser_session_accounts;
DROP TABLE browser_sessions;
DROP TABLE accounts;
DROP TYPE invitation_status;
DROP TYPE account_status;
DROP TYPE account_role;
