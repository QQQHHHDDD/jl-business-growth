package files

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

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
	ext := strings.ToLower(filepath.Ext(header.Filename))
	categoryByMIME, ok := allowed[header.Header.Get("Content-Type")]
	if !ok || categoryByMIME[ext] != category && !(category == "DREAM_IMAGE" && categoryByMIME[ext] == "KNOWLEDGE_IMAGE") {
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
	written, copyErr := io.Copy(io.MultiWriter(output, hash), io.LimitReader(input, limit+1))
	closeErr := output.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(path)
		if copyErr != nil {
			return Asset{}, copyErr
		}
		return Asset{}, closeErr
	}
	if written > limit {
		_ = os.Remove(path)
		return Asset{}, problem.New("VALIDATION_ERROR", http.StatusRequestEntityTooLarge, "file exceeds the configured size limit")
	}
	asset := Asset{ID: uuid.New(), UserID: userID, Category: category, OriginalName: filepath.Base(header.Filename), StorageName: storageName, MIMEType: header.Header.Get("Content-Type"), SizeBytes: written, SHA256: hex.EncodeToString(hash.Sum(nil))}
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
