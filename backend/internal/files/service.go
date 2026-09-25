package files

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/problem"
)

type Service struct {
	pool                      *pgxpool.Pool
	root                      string
	documentLimit, imageLimit int64
}

func NewService(pool *pgxpool.Pool, cfg config.Config) *Service {
	documentLimit, imageLimit := int64(cfg.MaxDocumentUploadMB), int64(cfg.MaxImageUploadMB)
	if documentLimit <= 0 {
		documentLimit = 50
	}
	if imageLimit <= 0 {
		imageLimit = 10
	}
	return &Service{pool: pool, root: cfg.FileRoot, documentLimit: documentLimit * 1024 * 1024, imageLimit: imageLimit * 1024 * 1024}
}

type Asset struct {
	ID           uuid.UUID
	UserID       uuid.UUID
	Category     string
	OriginalName string
	StorageName  string
	MIMEType     string
	SizeBytes    int64
	SHA256       string
	CreatedAt    time.Time
}

var allowed = map[string]map[string]string{
	"application/pdf": {".pdf": "KNOWLEDGE_DOCUMENT"},
	"text/plain":      {".txt": "KNOWLEDGE_DOCUMENT"},
	"text/markdown":   {".md": "KNOWLEDGE_DOCUMENT"},
	"image/jpeg":      {".jpg": "KNOWLEDGE_IMAGE", ".jpeg": "KNOWLEDGE_IMAGE"},
	"image/png":       {".png": "KNOWLEDGE_IMAGE"},
	"image/webp":      {".webp": "KNOWLEDGE_IMAGE"},
}

const orphanFileGracePeriod = time.Hour

func (s *Service) Upload(ctx context.Context, userID uuid.UUID, category string, header *multipart.FileHeader) (Asset, error) {
	if header == nil {
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "file is required")
	}
	if category == "" {
		category = "KNOWLEDGE_DOCUMENT"
	}
	if category != "DREAM_IMAGE" && category != "KNOWLEDGE_DOCUMENT" && category != "KNOWLEDGE_IMAGE" {
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "file category is invalid")
	}
	originalName := filepath.Base(header.Filename)
	ext := strings.ToLower(filepath.Ext(originalName))
	declaredMIME, _, parseErr := mime.ParseMediaType(header.Header.Get("Content-Type"))
	declaredMIME = strings.ToLower(strings.TrimSpace(declaredMIME))
	categoryByMIME, ok := allowed[declaredMIME]
	if parseErr != nil || !ok || categoryByMIME[ext] != category && !(category == "DREAM_IMAGE" && categoryByMIME[ext] == "KNOWLEDGE_IMAGE") {
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "file format is not supported")
	}
	limit := s.documentLimit
	if categoryByMIME[ext] == "KNOWLEDGE_IMAGE" {
		limit = s.imageLimit
	}
	if header.Size > limit {
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusRequestEntityTooLarge, "file exceeds the configured size limit")
	}
	input, err := header.Open()
	if err != nil {
		return Asset{}, err
	}
	defer input.Close()
	sample := make([]byte, 512)
	sampleSize, sampleErr := input.Read(sample)
	if sampleErr != nil && !errors.Is(sampleErr, io.EOF) {
		return Asset{}, sampleErr
	}
	detectedMIME, _, _ := mime.ParseMediaType(http.DetectContentType(sample[:sampleSize]))
	if !contentTypeMatches(declaredMIME, detectedMIME) {
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "file content does not match its declared format")
	}
	if int64(sampleSize) > limit {
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusRequestEntityTooLarge, "file exceeds the configured size limit")
	}
	if err := os.MkdirAll(s.root, 0o700); err != nil {
		return Asset{}, err
	}
	storageName := uuid.NewString() + ext
	path := filepath.Join(s.root, storageName)
	output, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return Asset{}, err
	}
	hash := sha256.New()
	writer := io.MultiWriter(output, hash)
	written, writeErr := writer.Write(sample[:sampleSize])
	if writeErr == nil && written == sampleSize {
		var copied int64
		copied, writeErr = io.Copy(writer, io.LimitReader(input, limit-int64(sampleSize)+1))
		written += int(copied)
	}
	closeErr := output.Close()
	if writeErr != nil || closeErr != nil {
		_ = os.Remove(path)
		if writeErr != nil {
			return Asset{}, writeErr
		}
		return Asset{}, closeErr
	}
	if int64(written) > limit {
		_ = os.Remove(path)
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusRequestEntityTooLarge, "file exceeds the configured size limit")
	}
	asset := Asset{ID: uuid.New(), UserID: userID, Category: category, OriginalName: originalName, StorageName: storageName, MIMEType: declaredMIME, SizeBytes: int64(written), SHA256: hex.EncodeToString(hash.Sum(nil))}
	err = s.pool.QueryRow(ctx, `INSERT INTO file_assets (id,user_id,category,original_name,storage_name,mime_type,size_bytes,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at`, asset.ID, asset.UserID, asset.Category, asset.OriginalName, asset.StorageName, asset.MIMEType, asset.SizeBytes, asset.SHA256).Scan(&asset.CreatedAt)
	if err != nil {
		_ = os.Remove(path)
		return Asset{}, err
	}
	return asset, nil
}

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]Asset, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,category,original_name,storage_name,mime_type,size_bytes,sha256,created_at FROM file_assets WHERE user_id=$1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Asset, 0)
	for rows.Next() {
		var item Asset
		if err := rows.Scan(&item.ID, &item.UserID, &item.Category, &item.OriginalName, &item.StorageName, &item.MIMEType, &item.SizeBytes, &item.SHA256, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) Get(ctx context.Context, userID, id uuid.UUID) (Asset, string, error) {
	var item Asset
	err := s.pool.QueryRow(ctx, `SELECT id,user_id,category,original_name,storage_name,mime_type,size_bytes,sha256,created_at FROM file_assets WHERE id=$1 AND user_id=$2`, id, userID).Scan(&item.ID, &item.UserID, &item.Category, &item.OriginalName, &item.StorageName, &item.MIMEType, &item.SizeBytes, &item.SHA256, &item.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, "", problem.New("NOT_FOUND", http.StatusNotFound, "file not found")
	}
	if err != nil {
		return Asset{}, "", err
	}
	return item, filepath.Join(s.root, item.StorageName), nil
}

func (s *Service) Delete(ctx context.Context, userID, id uuid.UUID) error {
	item, path, err := s.Get(ctx, userID, id)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM file_assets WHERE id=$1 AND user_id=$2`, item.ID, userID)
	return err
}

// DeleteAccount removes an account and its owned files. Failed physical
// removals are recorded for the file cleanup job to retry.
func (s *Service) DeleteAccount(ctx context.Context, accountID uuid.UUID) error {
	result, err := s.pool.Exec(ctx, `UPDATE accounts SET status='DELETING', updated_at=now() WHERE id=$1 AND status <> 'DELETING'`, accountID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return problem.New("CONFLICT", http.StatusConflict, "account is already being deleted")
	}
	rows, err := s.pool.Query(ctx, `SELECT storage_name FROM file_assets WHERE user_id=$1`, accountID)
	if err != nil {
		return err
	}
	var storageNames []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		storageNames = append(storageNames, name)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := generated.New(s.pool).WithTx(tx).DeleteAccountSessions(ctx, auth.ToPGUUID(accountID)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM accounts WHERE id=$1`, accountID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	for _, name := range storageNames {
		path, pathErr := s.storagePath(name)
		if pathErr != nil {
			_ = s.recordFileCleanupFailure(ctx, nil, name, pathErr)
			continue
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			_ = s.recordFileCleanupFailure(ctx, nil, name, err)
		}
	}
	return nil
}

func (s *Service) CleanupOrphanFiles(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT storage_name FROM file_assets`)
	if err != nil {
		return err
	}
	known := make(map[string]struct{})
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		known[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	entries, err := os.ReadDir(s.root)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return infoErr
		}
		if time.Since(info.ModTime()) < orphanFileGracePeriod {
			continue
		}
		if _, ok := known[entry.Name()]; ok {
			continue
		}
		path, pathErr := s.storagePath(entry.Name())
		if pathErr != nil {
			continue
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func (s *Service) RetryFileCleanup(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT id,storage_name FROM file_cleanup_failures WHERE resolved_at IS NULL AND next_attempt_at <= now() ORDER BY created_at LIMIT 100`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return err
		}
		path, pathErr := s.storagePath(name)
		if pathErr == nil {
			pathErr = os.Remove(path)
			if errors.Is(pathErr, os.ErrNotExist) {
				pathErr = nil
			}
		}
		if pathErr == nil {
			if _, err := s.pool.Exec(ctx, `UPDATE file_cleanup_failures SET resolved_at=now() WHERE id=$1`, id); err != nil {
				return err
			}
		} else if _, err := s.pool.Exec(ctx, `UPDATE file_cleanup_failures SET error_message=$2,attempts=attempts+1,next_attempt_at=now()+interval '1 hour' WHERE id=$1`, id, pathErr.Error()); err != nil {
			return err
		}
	}
	return rows.Err()
}

func contentTypeMatches(declared, detected string) bool {
	if declared == "text/plain" || declared == "text/markdown" {
		return detected == "text/plain"
	}
	return declared == detected
}

func (s *Service) storagePath(name string) (string, error) {
	if name == "" || filepath.Base(name) != name || strings.Contains(name, string(filepath.Separator)) {
		return "", errors.New("unsafe storage name")
	}
	path := filepath.Join(s.root, name)
	if filepath.Dir(path) != filepath.Clean(s.root) {
		return "", errors.New("unsafe storage path")
	}
	return path, nil
}

func (s *Service) recordFileCleanupFailure(ctx context.Context, userID *uuid.UUID, name string, cause error) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO file_cleanup_failures (user_id,storage_name,error_message,attempts,next_attempt_at) VALUES ($1,$2,$3,1,now()+interval '5 minutes') ON CONFLICT (storage_name) WHERE resolved_at IS NULL DO UPDATE SET error_message=EXCLUDED.error_message,attempts=file_cleanup_failures.attempts+1,next_attempt_at=now()+interval '5 minutes'`, userID, name, cause.Error())
	return err
}
