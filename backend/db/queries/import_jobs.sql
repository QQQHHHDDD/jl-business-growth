-- name: CreateImportJob :one
INSERT INTO import_jobs (id, user_id, type, temp_file_path, expires_at, file_sha256)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, user_id, type, temp_file_path, status, row_count, valid_count,
          invalid_count, validation_summary, expires_at, created_at, file_sha256, duplicate_of_id, committed_at;

-- name: GetImportJob :one
SELECT id, user_id, type, temp_file_path, status, row_count, valid_count,
       invalid_count, validation_summary, expires_at, created_at, file_sha256, duplicate_of_id, committed_at
FROM import_jobs
WHERE id = $1 AND user_id = $2;

-- name: UpdateImportValidation :one
UPDATE import_jobs
SET status = $2, row_count = $3, valid_count = $4, invalid_count = $5,
    validation_summary = $6
WHERE id = $1 AND user_id = $7
RETURNING id, user_id, type, temp_file_path, status, row_count, valid_count,
          invalid_count, validation_summary, expires_at, created_at, file_sha256, duplicate_of_id, committed_at;

-- name: CommitImportJob :one
UPDATE import_jobs
SET status = 'COMMITTED', committed_at = now()
WHERE id = $1 AND user_id = $2 AND status = 'VALIDATED'
RETURNING id, user_id, type, temp_file_path, status, row_count, valid_count,
          invalid_count, validation_summary, expires_at, created_at, file_sha256, duplicate_of_id, committed_at;

-- name: DeleteImportJob :one
DELETE FROM import_jobs
WHERE id = $1 AND user_id = $2 AND status <> 'COMMITTED'
RETURNING temp_file_path;

-- name: ListExpiredImportJobs :many
SELECT id, user_id, type, temp_file_path, status, row_count, valid_count,
       invalid_count, validation_summary, expires_at, created_at, file_sha256, duplicate_of_id, committed_at
FROM import_jobs
WHERE expires_at <= now() AND status IN ('UPLOADED', 'VALIDATED', 'FAILED');

-- name: MarkImportExpired :exec
UPDATE import_jobs SET status = 'EXPIRED'
WHERE id = $1 AND status IN ('UPLOADED', 'VALIDATED', 'FAILED');
