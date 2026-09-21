-- name: ListInvitations :many
SELECT id, code, status, max_uses, used_count, expires_at, created_by, created_at
FROM invitation_codes
ORDER BY created_at DESC;

-- name: GetInvitationByID :one
SELECT id, code, status, max_uses, used_count, expires_at, created_by, created_at
FROM invitation_codes WHERE id = $1;

-- name: GetInvitationByCode :one
SELECT id, code, status, max_uses, used_count, expires_at, created_by, created_at
FROM invitation_codes WHERE lower(code) = lower($1);

-- name: CreateInvitation :one
INSERT INTO invitation_codes (id, code, status, max_uses, expires_at, created_by)
VALUES ($1, $2, 'ACTIVE', $3, $4, $5)
RETURNING id, code, status, max_uses, used_count, expires_at, created_by, created_at;

-- name: UpdateInvitation :one
UPDATE invitation_codes
SET status = COALESCE(sqlc.narg('status'), status),
    max_uses = CASE WHEN sqlc.arg('set_max_uses')::boolean THEN sqlc.narg('max_uses') ELSE max_uses END,
    expires_at = CASE WHEN sqlc.arg('set_expires_at')::boolean THEN sqlc.narg('expires_at') ELSE expires_at END
WHERE id = sqlc.arg('id')
RETURNING id, code, status, max_uses, used_count, expires_at, created_by, created_at;

-- name: DeleteInvitation :one
DELETE FROM invitation_codes WHERE id = $1
RETURNING id;

-- name: ConsumeInvitation :one
UPDATE invitation_codes
SET used_count = used_count + 1,
    status = CASE
        WHEN max_uses IS NOT NULL AND used_count + 1 >= max_uses
            THEN 'DISABLED'::invitation_status
        ELSE status
    END
WHERE id = $1
  AND status = 'ACTIVE'
  AND (expires_at IS NULL OR expires_at > now())
  AND (max_uses IS NULL OR used_count < max_uses)
RETURNING id, code, status, max_uses, used_count, expires_at, created_by, created_at;

-- name: RecordInvitationUse :exec
INSERT INTO invitation_uses (invitation_code_id, account_id) VALUES ($1, $2);
