-- name: GetAccountByUsername :one
SELECT id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at
FROM accounts
WHERE lower(username) = lower($1);

-- name: GetAccountByID :one
SELECT id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at
FROM accounts
WHERE id = $1;

-- name: GetSuperAdmin :one
SELECT id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at
FROM accounts
WHERE role = 'SUPER_ADMIN';

-- name: CreateAccount :one
INSERT INTO accounts (id, username, password_hash, role, status, timezone)
VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
RETURNING id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at;

-- name: UpdateLastLogin :exec
UPDATE accounts SET last_login_at = now(), updated_at = now() WHERE id = $1;

-- name: UpdatePassword :exec
UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1;

-- name: UpdateTimezone :one
UPDATE accounts SET timezone = $2, updated_at = now()
WHERE id = $1
RETURNING id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at;

-- name: SetAccountStatus :one
UPDATE accounts SET status = $2, updated_at = now()
WHERE id = $1
RETURNING id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at;

-- name: DeleteAccount :exec
DELETE FROM accounts WHERE accounts.id = $1;

-- name: CountUsers :one
SELECT count(*)::bigint FROM accounts WHERE role = 'USER';

-- name: ListUsers :many
SELECT id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at
FROM accounts
WHERE role = 'USER'
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountAdmins :one
SELECT count(*)::bigint FROM accounts WHERE role = 'ADMIN';

-- name: ListAdmins :many
SELECT id, username, password_hash, role, status, timezone, created_at, updated_at, last_login_at
FROM accounts
WHERE role = 'ADMIN'
ORDER BY created_at DESC;

-- name: CreateBrowserSession :one
INSERT INTO browser_sessions (id, token_hash, active_account_id, csrf_token_hash, expires_at)
SELECT sqlc.arg('session_id'), sqlc.arg('token_hash'), a.id, sqlc.arg('csrf_token_hash'), sqlc.arg('expires_at')
FROM accounts a
WHERE a.id = sqlc.arg('account_id') AND a.status = 'ACTIVE'
RETURNING id, token_hash, active_account_id, csrf_token_hash, created_at, last_seen_at, expires_at;

-- name: GetBrowserSession :one
SELECT bs.id, bs.token_hash, bs.active_account_id, bs.csrf_token_hash, bs.created_at, bs.last_seen_at, bs.expires_at,
       EXISTS (
           SELECT 1
           FROM browser_session_accounts bsa
           WHERE bsa.browser_session_id = bs.id
             AND bsa.account_id = bs.active_account_id
       ) AS active_account_linked
FROM browser_sessions bs
WHERE bs.token_hash = $1 AND bs.last_seen_at > now() - interval '30 days' AND bs.expires_at > now();

-- name: TouchBrowserSession :exec
UPDATE browser_sessions SET last_seen_at = now() WHERE id = $1;

-- name: AddBrowserSessionAccount :exec
INSERT INTO browser_session_accounts (browser_session_id, account_id)
VALUES ($1, $2)
ON CONFLICT (browser_session_id, account_id) DO NOTHING;

-- name: ListBrowserSessionAccounts :many
SELECT a.id, a.username, a.password_hash, a.role, a.status, a.timezone, a.created_at, a.updated_at, a.last_login_at,
       (a.id = bs.active_account_id) AS active
FROM browser_session_accounts bsa
JOIN accounts a ON a.id = bsa.account_id
JOIN browser_sessions bs ON bs.id = bsa.browser_session_id
WHERE bsa.browser_session_id = $1
ORDER BY bsa.authenticated_at ASC;

-- name: SetActiveAccount :one
UPDATE browser_sessions bs
SET active_account_id = $2, last_seen_at = now()
WHERE bs.id = $1
  AND EXISTS (
      SELECT 1 FROM browser_session_accounts bsa
      JOIN accounts a ON a.id = bsa.account_id
      WHERE bsa.browser_session_id = $1 AND bsa.account_id = $2 AND a.status = 'ACTIVE'
  )
RETURNING bs.id, bs.token_hash, bs.active_account_id, bs.csrf_token_hash, bs.created_at, bs.last_seen_at, bs.expires_at;

-- name: DeleteBrowserSession :exec
DELETE FROM browser_sessions WHERE id = $1;

-- name: DeleteBrowserSessionAccount :one
DELETE FROM browser_session_accounts
WHERE browser_session_id = $1 AND account_id = $2
RETURNING account_id;

-- name: DeleteAccountSessions :exec
WITH deleted_active_sessions AS (
    DELETE FROM browser_sessions
    WHERE active_account_id = $1
    RETURNING id
)
DELETE FROM browser_session_accounts
WHERE account_id = $1
   OR browser_session_id IN (SELECT id FROM deleted_active_sessions);

-- name: DeleteExpiredSessions :exec
DELETE FROM browser_sessions WHERE expires_at <= now() OR last_seen_at <= now() - interval '30 days';

-- name: CreateAuditLog :exec
INSERT INTO security_audit_logs (id, actor_account_id, action, target_account_id, target_id, ip_address, user_agent_summary, request_id)
VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::inet, NULLIF($7, ''), NULLIF($8, ''));
