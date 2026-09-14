-- +goose Up
CREATE TYPE finance_transaction_type AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE finance_transaction_source AS ENUM ('MANUAL', 'IMPORT');
CREATE TYPE finance_snapshot_kind AS ENUM ('SAVINGS', 'EMERGENCY_FUND');

CREATE TABLE finance_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    type finance_transaction_type NOT NULL,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    archived_at TIMESTAMPTZ,
    UNIQUE (user_id, type, name)
);
CREATE INDEX finance_categories_scope_idx ON finance_categories (user_id, type, archived_at);

INSERT INTO finance_categories (user_id, type, name)
VALUES
    (NULL, 'INCOME', '其他收入'),
    (NULL, 'EXPENSE', '其他支出'),
    (NULL, 'EXPENSE', '生活'),
    (NULL, 'EXPENSE', '交通'),
    (NULL, 'EXPENSE', '学习');

CREATE TABLE financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    occurred_on DATE NOT NULL,
    type finance_transaction_type NOT NULL,
    category_id UUID NOT NULL REFERENCES finance_categories(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    description TEXT,
    note TEXT,
    source finance_transaction_source NOT NULL DEFAULT 'MANUAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX financial_transactions_user_date_idx ON financial_transactions (user_id, occurred_on DESC);

CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    category_id UUID REFERENCES finance_categories(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, month, category_id)
);
CREATE UNIQUE INDEX budgets_total_unique ON budgets (user_id, month) WHERE category_id IS NULL;

CREATE TABLE financial_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    kind finance_snapshot_kind NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, snapshot_date, kind)
);

CREATE TABLE income_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    rule_version TEXT NOT NULL,
    input_snapshot JSONB NOT NULL,
    result_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX income_simulations_user_updated_idx ON income_simulations (user_id, updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS income_simulations;
DROP TABLE IF EXISTS financial_snapshots;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS financial_transactions;
DROP TABLE IF EXISTS finance_categories;
DROP TYPE IF EXISTS finance_snapshot_kind;
DROP TYPE IF EXISTS finance_transaction_source;
DROP TYPE IF EXISTS finance_transaction_type;
