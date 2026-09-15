package knowledge

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/problem"
)

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

type Item struct {
	ID                                                      uuid.UUID
	UserID                                                  uuid.UUID
	Title                                                   string
	Type                                                    string
	RawText, Summary, Understanding, ActionItems, SourceURL *string
	LearnedOn                                               *time.Time
	Status                                                  string
	ProgressCurrent, ProgressTotal                          *float64
	ProgressUnit                                            *string
	Tags                                                    []string
	FileIDs                                                 []uuid.UUID
	CreatedAt, UpdatedAt                                    time.Time
}

type ItemInput struct {
	Title                                                   string
	Type                                                    string
	RawText, Summary, Understanding, ActionItems, SourceURL *string
	LearnedOn                                               *time.Time
	Status                                                  string
	ProgressCurrent, ProgressTotal                          *float64
	ProgressUnit                                            *string
	Tags                                                    []string
	FileIDs                                                 []uuid.UUID
}

type Session struct {
	ID                   uuid.UUID
	UserID               uuid.UUID
	KnowledgeItemID      *uuid.UUID
	ActivityType         string
	ActivityDate         time.Time
	Minutes              int
	Source               string
	Note                 *string
	CreatedAt, UpdatedAt time.Time
}

type SessionInput struct {
	KnowledgeItemID *uuid.UUID
	ActivityType    string
	ActivityDate    time.Time
	Minutes         int
	Source          string
	Note            *string
}

func (s *Service) ListItems(ctx context.Context, userID uuid.UUID) ([]Item, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,title,type,raw_text,summary,understanding,action_items,source_url,learned_on,status,progress_current,progress_total,progress_unit,created_at,updated_at FROM knowledge_items WHERE user_id=$1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Item, 0)
	for rows.Next() {
		item, err := scanItem(rows)
		if err != nil {
			return nil, err
		}
		if err := s.loadRelations(ctx, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) GetItem(ctx context.Context, userID, id uuid.UUID) (Item, error) {
	item, err := scanItem(s.pool.QueryRow(ctx, `SELECT id,user_id,title,type,raw_text,summary,understanding,action_items,source_url,learned_on,status,progress_current,progress_total,progress_unit,created_at,updated_at FROM knowledge_items WHERE user_id=$1 AND id=$2`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, problem.New("NOT_FOUND", http.StatusNotFound, "knowledge item not found")
	}
	if err != nil {
		return Item{}, err
	}
	if err := s.loadRelations(ctx, &item); err != nil {
		return Item{}, err
	}
	return item, nil
}

func (s *Service) SaveItem(ctx context.Context, userID, id uuid.UUID, input ItemInput) (Item, error) {
	if strings.TrimSpace(input.Title) == "" {
		return Item{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "knowledge title is required")
	}
	if input.Type == "" {
		input.Type = "OTHER"
	}
	if !validType(input.Type) {
		return Item{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "knowledge type is invalid")
	}
	if input.Status == "" {
		input.Status = "NOT_STARTED"
	}
	if input.Status != "NOT_STARTED" && input.Status != "IN_PROGRESS" && input.Status != "COMPLETED" {
		return Item{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "knowledge status is invalid")
	}
	if input.ProgressCurrent != nil && *input.ProgressCurrent < 0 || input.ProgressTotal != nil && *input.ProgressTotal < 0 {
		return Item{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "progress must be non-negative")
	}
	if input.ProgressCurrent != nil && input.ProgressTotal != nil && *input.ProgressCurrent > *input.ProgressTotal {
		return Item{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "current progress cannot exceed total")
	}
	if id == uuid.Nil {
		id = uuid.New()
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Item{}, err
	}
	defer tx.Rollback(ctx)
	result, err := tx.Exec(ctx, `INSERT INTO knowledge_items (id,user_id,title,type,raw_text,summary,understanding,action_items,source_url,learned_on,status,progress_current,progress_total,progress_unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,type=EXCLUDED.type,raw_text=EXCLUDED.raw_text,summary=EXCLUDED.summary,understanding=EXCLUDED.understanding,action_items=EXCLUDED.action_items,source_url=EXCLUDED.source_url,learned_on=EXCLUDED.learned_on,status=EXCLUDED.status,progress_current=EXCLUDED.progress_current,progress_total=EXCLUDED.progress_total,progress_unit=EXCLUDED.progress_unit,updated_at=now() WHERE knowledge_items.user_id=$2`, id, userID, strings.TrimSpace(input.Title), input.Type, input.RawText, input.Summary, input.Understanding, input.ActionItems, input.SourceURL, input.LearnedOn, input.Status, input.ProgressCurrent, input.ProgressTotal, input.ProgressUnit)
	if err != nil {
		return Item{}, err
	}
	if result.RowsAffected() != 1 {
		return Item{}, problem.New("NOT_FOUND", http.StatusNotFound, "knowledge item not found")
	}
	if _, err = tx.Exec(ctx, `DELETE FROM knowledge_item_tags WHERE knowledge_item_id=$1`, id); err != nil {
		return Item{}, err
	}
	for _, tag := range uniqueTags(input.Tags) {
		var tagID uuid.UUID
		if err := tx.QueryRow(ctx, `INSERT INTO tags (id,user_id,name,name_normalized) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,name_normalized) DO UPDATE SET name=EXCLUDED.name RETURNING id`, uuid.New(), userID, tag, strings.ToLower(tag)).Scan(&tagID); err != nil {
			return Item{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO knowledge_item_tags (knowledge_item_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, id, tagID); err != nil {
			return Item{}, err
		}
	}
	if _, err = tx.Exec(ctx, `DELETE FROM knowledge_item_files WHERE knowledge_item_id=$1`, id); err != nil {
		return Item{}, err
	}
	for _, fileID := range input.FileIDs {
		var owned bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(
			SELECT 1 FROM file_assets
			WHERE id=$1 AND user_id=$2 AND category IN ('KNOWLEDGE_DOCUMENT','KNOWLEDGE_IMAGE')
		)`, fileID, userID).Scan(&owned); err != nil {
			return Item{}, err
		}
		if !owned {
			return Item{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "file is not owned by this account")
		}
		if _, err := tx.Exec(ctx, `INSERT INTO knowledge_item_files (knowledge_item_id,file_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, id, fileID); err != nil {
			return Item{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Item{}, err
	}
	return s.GetItem(ctx, userID, id)
}

func (s *Service) DeleteItem(ctx context.Context, userID, id uuid.UUID) error {
	r, err := s.pool.Exec(ctx, `DELETE FROM knowledge_items WHERE user_id=$1 AND id=$2`, userID, id)
	if err != nil {
		return err
	}
	if r.RowsAffected() != 1 {
		return problem.New("NOT_FOUND", http.StatusNotFound, "knowledge item not found")
	}
	return nil
}

func (s *Service) ListSessions(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]Session, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,knowledge_item_id,activity_type,activity_date,minutes,source,note,created_at,updated_at FROM learning_sessions WHERE user_id=$1 AND activity_date BETWEEN $2 AND $3 ORDER BY activity_date DESC,created_at DESC`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Session, 0)
	for rows.Next() {
		var item Session
		if err := rows.Scan(&item.ID, &item.UserID, &item.KnowledgeItemID, &item.ActivityType, &item.ActivityDate, &item.Minutes, &item.Source, &item.Note, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) SaveSession(ctx context.Context, userID, id uuid.UUID, input SessionInput) (Session, error) {
	if input.ActivityType != "READING" && input.ActivityType != "AUDIO" {
		return Session{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "activity type is invalid")
	}
	if input.Minutes < 0 {
		return Session{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "minutes must be non-negative")
	}
	if input.Source == "" {
		input.Source = "ITEM"
	}
	if input.Source != "ITEM" && input.Source != "DAILY_UNALLOCATED" {
		return Session{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "session source is invalid")
	}
	if input.Source == "ITEM" && input.KnowledgeItemID == nil {
		return Session{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "item sessions require a knowledge item")
	}
	if input.Source == "DAILY_UNALLOCATED" {
		input.KnowledgeItemID = nil
		var allocated int
		if err := s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(minutes), 0) FROM learning_sessions WHERE user_id=$1 AND activity_date=$2 AND activity_type=$3 AND source='ITEM'`, userID, input.ActivityDate, input.ActivityType).Scan(&allocated); err != nil {
			return Session{}, err
		}
		if input.Minutes < allocated {
			return Session{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "daily unallocated minutes cannot be less than item learning minutes")
		}
	}
	if input.KnowledgeItemID != nil {
		var owned bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM knowledge_items WHERE id=$1 AND user_id=$2)`, *input.KnowledgeItemID, userID).Scan(&owned); err != nil {
			return Session{}, err
		}
		if !owned {
			return Session{}, problem.New("NOT_FOUND", http.StatusNotFound, "knowledge item not found")
		}
	}
	if id == uuid.Nil {
		id = uuid.New()
	}
	var item Session
	if input.Source == "DAILY_UNALLOCATED" {
		err := s.pool.QueryRow(ctx, `INSERT INTO learning_sessions (id,user_id,knowledge_item_id,activity_type,activity_date,minutes,source,note) VALUES ($1,$2,NULL,$3,$4,$5,'DAILY_UNALLOCATED',$6) ON CONFLICT (user_id,activity_date,activity_type) WHERE source='DAILY_UNALLOCATED' DO UPDATE SET minutes=EXCLUDED.minutes,note=EXCLUDED.note,updated_at=now() RETURNING id,user_id,knowledge_item_id,activity_type,activity_date,minutes,source,note,created_at,updated_at`, id, userID, input.ActivityType, input.ActivityDate, input.Minutes, input.Note).Scan(&item.ID, &item.UserID, &item.KnowledgeItemID, &item.ActivityType, &item.ActivityDate, &item.Minutes, &item.Source, &item.Note, &item.CreatedAt, &item.UpdatedAt)
		return item, err
	}
	err := s.pool.QueryRow(ctx, `INSERT INTO learning_sessions (id,user_id,knowledge_item_id,activity_type,activity_date,minutes,source,note) VALUES ($1,$2,$3,$4,$5,$6,'ITEM',$7) RETURNING id,user_id,knowledge_item_id,activity_type,activity_date,minutes,source,note,created_at,updated_at`, id, userID, input.KnowledgeItemID, input.ActivityType, input.ActivityDate, input.Minutes, input.Note).Scan(&item.ID, &item.UserID, &item.KnowledgeItemID, &item.ActivityType, &item.ActivityDate, &item.Minutes, &item.Source, &item.Note, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (s *Service) DeleteSession(ctx context.Context, userID, id uuid.UUID) error {
	r, err := s.pool.Exec(ctx, `DELETE FROM learning_sessions WHERE user_id=$1 AND id=$2`, userID, id)
	if err != nil {
		return err
	}
	if r.RowsAffected() != 1 {
		return problem.New("NOT_FOUND", http.StatusNotFound, "learning session not found")
	}
	return nil
}

func (s *Service) loadRelations(ctx context.Context, item *Item) error {
	rows, err := s.pool.Query(ctx, `SELECT t.name FROM tags t JOIN knowledge_item_tags kit ON kit.tag_id=t.id WHERE kit.knowledge_item_id=$1 ORDER BY t.name`, item.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	item.Tags = make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		item.Tags = append(item.Tags, name)
	}
	rows.Close()
	rows, err = s.pool.Query(ctx, `SELECT file_id FROM knowledge_item_files WHERE knowledge_item_id=$1 ORDER BY file_id`, item.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	item.FileIDs = make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return err
		}
		item.FileIDs = append(item.FileIDs, id)
	}
	return rows.Err()
}

func scanItem(row interface{ Scan(...any) error }) (Item, error) {
	var item Item
	err := row.Scan(&item.ID, &item.UserID, &item.Title, &item.Type, &item.RawText, &item.Summary, &item.Understanding, &item.ActionItems, &item.SourceURL, &item.LearnedOn, &item.Status, &item.ProgressCurrent, &item.ProgressTotal, &item.ProgressUnit, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
func uniqueTags(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0)
	for _, value := range values {
		value = strings.TrimSpace(value)
		key := strings.ToLower(value)
		if value != "" && !seen[key] {
			seen[key] = true
			result = append(result, value)
		}
	}
	return result
}
func validType(value string) bool {
	switch value {
	case "AUDIO", "VIDEO", "BOOK", "EVENT", "MEETING", "PHP", "MENTOR", "PRODUCT", "OTHER":
		return true
	}
	return false
}
