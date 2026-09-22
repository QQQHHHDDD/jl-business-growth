package communication

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/problem"
)

type FriendRecord struct {
	ID, UserID                                                                                                uuid.UUID
	Platform, AccountLabel, GroupName, AddDirection, LastAppliedPerson, ApplicationScript, FirstMessage, Note string
	Archived                                                                                                  bool
	CreatedAt, UpdatedAt                                                                                      time.Time
}
type FriendInput struct {
	Platform, AccountLabel, GroupName, AddDirection, LastAppliedPerson, ApplicationScript, FirstMessage, Note string
	Archived                                                                                                  *bool
}
type ProgressInput struct{ AddDirection, LastAppliedPerson, Note string }
type Category struct {
	ID, UserID           uuid.UUID
	Name                 string
	SortOrder            int
	CreatedAt, UpdatedAt time.Time
}
type Script struct {
	ID, UserID                            uuid.UUID
	CategoryID                            *uuid.UUID
	CategoryName, Title, ScriptType, Note string
	Tags, Paragraphs                      []string
	Favorite                              bool
	CreatedAt, UpdatedAt                  time.Time
}
type ScriptInput struct {
	CategoryID              *uuid.UUID
	Title, ScriptType, Note string
	Tags, Paragraphs        []string
	Favorite                *bool
}

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }
func clean(value string, max int) string {
	value = strings.TrimSpace(value)
	if len(value) > max {
		return value[:max]
	}
	return value
}
func validateFriend(in FriendInput) error {
	if clean(in.Platform, 64) == "" || clean(in.AccountLabel, 120) == "" || clean(in.GroupName, 200) == "" {
		return problem.New("VALIDATION_ERROR", 400, "platform, account, and group are required")
	}
	if in.AddDirection != "FORWARD" && in.AddDirection != "REVERSE" {
		return problem.New("VALIDATION_ERROR", 400, "add direction is invalid")
	}
	return nil
}
func normalizeParagraphs(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item) != "" {
			out = append(out, item)
		}
	}
	return out
}
func validateScript(in ScriptInput) error {
	if clean(in.Title, 200) == "" || (in.ScriptType != "STAGE" && in.ScriptType != "FAQ") || len(in.Paragraphs) == 0 {
		return problem.New("VALIDATION_ERROR", 400, "script title, type, and at least one paragraph are required")
	}
	for _, paragraph := range in.Paragraphs {
		if strings.TrimSpace(paragraph) == "" {
			return problem.New("VALIDATION_ERROR", 400, "script paragraphs cannot be blank")
		}
	}
	return nil
}

func (s *Service) ListFriends(ctx context.Context, userID uuid.UUID, page, pageSize int, q, platform, account string, archived bool) ([]FriendRecord, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	q = "%" + strings.ToLower(strings.TrimSpace(q)) + "%"
	p := "%" + strings.ToLower(strings.TrimSpace(platform)) + "%"
	a := "%" + strings.ToLower(strings.TrimSpace(account)) + "%"
	var total int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM communication_friend_records WHERE user_id=$1 AND archived=$2 AND lower(platform) LIKE $3 AND lower(account_label) LIKE $4 AND lower(platform||' '||account_label||' '||group_name||' '||last_applied_person||' '||application_script||' '||first_message||' '||note) LIKE $5`, auth.ToPGUUID(userID), archived, p, a, q).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,platform,account_label,group_name,add_direction,last_applied_person,application_script,first_message,note,archived,created_at,updated_at FROM communication_friend_records WHERE user_id=$1 AND archived=$2 AND lower(platform) LIKE $3 AND lower(account_label) LIKE $4 AND lower(platform||' '||account_label||' '||group_name||' '||last_applied_person||' '||application_script||' '||first_message||' '||note) LIKE $5 ORDER BY updated_at DESC LIMIT $6 OFFSET $7`, auth.ToPGUUID(userID), archived, p, a, q, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []FriendRecord{}
	for rows.Next() {
		var v FriendRecord
		if err := rows.Scan(&v.ID, &v.UserID, &v.Platform, &v.AccountLabel, &v.GroupName, &v.AddDirection, &v.LastAppliedPerson, &v.ApplicationScript, &v.FirstMessage, &v.Note, &v.Archived, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, v)
	}
	return out, total, rows.Err()
}
func (s *Service) GetFriend(ctx context.Context, userID, id uuid.UUID) (FriendRecord, error) {
	var v FriendRecord
	err := s.pool.QueryRow(ctx, `SELECT id,user_id,platform,account_label,group_name,add_direction,last_applied_person,application_script,first_message,note,archived,created_at,updated_at FROM communication_friend_records WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID)).Scan(&v.ID, &v.UserID, &v.Platform, &v.AccountLabel, &v.GroupName, &v.AddDirection, &v.LastAppliedPerson, &v.ApplicationScript, &v.FirstMessage, &v.Note, &v.Archived, &v.CreatedAt, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, problem.New("NOT_FOUND", 404, "friend record not found")
	}
	return v, err
}
func (s *Service) SaveFriend(ctx context.Context, userID, id uuid.UUID, in FriendInput) (FriendRecord, error) {
	if err := validateFriend(in); err != nil {
		return FriendRecord{}, err
	}
	if id == uuid.Nil {
		id = uuid.New()
		_, err := s.pool.Exec(ctx, `INSERT INTO communication_friend_records (id,user_id,platform,account_label,group_name,add_direction,last_applied_person,application_script,first_message,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, auth.ToPGUUID(id), auth.ToPGUUID(userID), clean(in.Platform, 64), clean(in.AccountLabel, 120), clean(in.GroupName, 200), in.AddDirection, clean(in.LastAppliedPerson, 200), in.ApplicationScript, in.FirstMessage, in.Note)
		if err != nil {
			return FriendRecord{}, err
		}
	} else {
		_, err := s.pool.Exec(ctx, `UPDATE communication_friend_records SET platform=$3,account_label=$4,group_name=$5,add_direction=$6,last_applied_person=$7,application_script=$8,first_message=$9,note=$10,archived=COALESCE($11,archived),updated_at=now() WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID), clean(in.Platform, 64), clean(in.AccountLabel, 120), clean(in.GroupName, 200), in.AddDirection, clean(in.LastAppliedPerson, 200), in.ApplicationScript, in.FirstMessage, in.Note, in.Archived)
		if err != nil {
			return FriendRecord{}, err
		}
	}
	return s.GetFriend(ctx, userID, id)
}
func (s *Service) UpdateProgress(ctx context.Context, userID, id uuid.UUID, in ProgressInput) (FriendRecord, error) {
	if in.AddDirection != "" && in.AddDirection != "FORWARD" && in.AddDirection != "REVERSE" {
		return FriendRecord{}, problem.New("VALIDATION_ERROR", 400, "add direction is invalid")
	}
	_, err := s.pool.Exec(ctx, `UPDATE communication_friend_records SET add_direction=COALESCE(NULLIF($3,''),add_direction),last_applied_person=$4,note=$5,updated_at=now() WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID), in.AddDirection, clean(in.LastAppliedPerson, 200), in.Note)
	if err != nil {
		return FriendRecord{}, err
	}
	return s.GetFriend(ctx, userID, id)
}
func (s *Service) DeleteFriend(ctx context.Context, userID, id uuid.UUID) error {
	r, err := s.pool.Exec(ctx, `DELETE FROM communication_friend_records WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID))
	if err == nil && r.RowsAffected() == 0 {
		return problem.New("NOT_FOUND", 404, "friend record not found")
	}
	return err
}

func (s *Service) ListCategories(ctx context.Context, userID uuid.UUID) ([]Category, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,name,sort_order,created_at,updated_at FROM communication_script_categories WHERE user_id=$1 ORDER BY sort_order,name`, auth.ToPGUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Category{}
	for rows.Next() {
		var v Category
		if err := rows.Scan(&v.ID, &v.UserID, &v.Name, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) SaveCategory(ctx context.Context, userID, id uuid.UUID, name string, sortOrder int) (Category, error) {
	name = clean(name, 80)
	if name == "" {
		return Category{}, problem.New("VALIDATION_ERROR", 400, "category name is required")
	}
	var v Category
	var err error
	if id == uuid.Nil {
		id = uuid.New()
		err = s.pool.QueryRow(ctx, `INSERT INTO communication_script_categories(id,user_id,name,sort_order) VALUES($1,$2,$3,$4) RETURNING id,user_id,name,sort_order,created_at,updated_at`, auth.ToPGUUID(id), auth.ToPGUUID(userID), name, sortOrder).Scan(&v.ID, &v.UserID, &v.Name, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt)
	} else {
		err = s.pool.QueryRow(ctx, `UPDATE communication_script_categories SET name=$3,sort_order=$4,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,user_id,name,sort_order,created_at,updated_at`, auth.ToPGUUID(id), auth.ToPGUUID(userID), name, sortOrder).Scan(&v.ID, &v.UserID, &v.Name, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return Category{}, problem.New("NOT_FOUND", 404, "script category not found")
	}
	return v, err
}
func (s *Service) DeleteCategory(ctx context.Context, userID, id uuid.UUID) error {
	result, err := s.pool.Exec(ctx, `DELETE FROM communication_script_categories WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID))
	if err == nil && result.RowsAffected() == 0 {
		return problem.New("NOT_FOUND", 404, "script category not found")
	}
	return err
}
func (s *Service) ListScripts(ctx context.Context, userID uuid.UUID, page, pageSize int, q, scriptType string, categoryID *uuid.UUID, favorite bool) ([]Script, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	q = "%" + strings.ToLower(strings.TrimSpace(q)) + "%"
	typ := scriptType
	if typ == "" {
		typ = "%"
	} else {
		typ = "%" + typ + "%"
	}
	var total int
	category := nullableUUID(categoryID)
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM communication_scripts WHERE user_id=$1 AND lower(title||' '||note||' '||array_to_string(tags,' ')||' '||paragraphs::text) LIKE $2 AND script_type LIKE $3 AND ($4::uuid IS NULL OR category_id=$4) AND ($5=false OR favorite)`, auth.ToPGUUID(userID), q, typ, category, favorite).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	rows, err := s.pool.Query(ctx, `SELECT s.id,s.user_id,s.category_id,COALESCE(c.name,''),s.title,s.script_type,s.tags,s.paragraphs,s.note,s.favorite,s.created_at,s.updated_at FROM communication_scripts s LEFT JOIN communication_script_categories c ON c.id=s.category_id AND c.user_id=s.user_id WHERE s.user_id=$1 AND lower(s.title||' '||s.note||' '||array_to_string(s.tags,' ')||' '||s.paragraphs::text) LIKE $2 AND s.script_type LIKE $3 AND ($4::uuid IS NULL OR s.category_id=$4) AND ($5=false OR s.favorite) ORDER BY s.favorite DESC,s.updated_at DESC LIMIT $6 OFFSET $7`, auth.ToPGUUID(userID), q, typ, category, favorite, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Script{}
	for rows.Next() {
		var v Script
		var raw []byte
		if err := rows.Scan(&v.ID, &v.UserID, &v.CategoryID, &v.CategoryName, &v.Title, &v.ScriptType, &v.Tags, &raw, &v.Note, &v.Favorite, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, 0, err
		}
		if err := json.Unmarshal(raw, &v.Paragraphs); err != nil {
			return nil, 0, err
		}
		out = append(out, v)
	}
	return out, total, rows.Err()
}
func (s *Service) GetScript(ctx context.Context, userID, id uuid.UUID) (Script, error) {
	return s.findScript(ctx, userID, id)
}
func (s *Service) SaveScript(ctx context.Context, userID, id uuid.UUID, in ScriptInput) (Script, error) {
	if err := validateScript(in); err != nil {
		return Script{}, err
	}
	in.Paragraphs = normalizeParagraphs(in.Paragraphs)
	if in.CategoryID != nil {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM communication_script_categories WHERE id=$1 AND user_id=$2)`, auth.ToPGUUID(*in.CategoryID), auth.ToPGUUID(userID)).Scan(&exists); err != nil {
			return Script{}, err
		}
		if !exists {
			return Script{}, problem.New("NOT_FOUND", 404, "script category not found")
		}
	}
	raw, _ := json.Marshal(in.Paragraphs)
	if id == uuid.Nil {
		id = uuid.New()
		_, err := s.pool.Exec(ctx, `INSERT INTO communication_scripts(id,user_id,category_id,title,script_type,tags,paragraphs,note,favorite) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, auth.ToPGUUID(id), auth.ToPGUUID(userID), nullableUUID(in.CategoryID), clean(in.Title, 200), in.ScriptType, in.Tags, raw, in.Note, boolValue(in.Favorite))
		if err != nil {
			return Script{}, err
		}
	} else {
		_, err := s.pool.Exec(ctx, `UPDATE communication_scripts SET category_id=$3,title=$4,script_type=$5,tags=$6,paragraphs=$7,note=$8,favorite=COALESCE($9,favorite),updated_at=now() WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID), nullableUUID(in.CategoryID), clean(in.Title, 200), in.ScriptType, in.Tags, raw, in.Note, in.Favorite)
		if err != nil {
			return Script{}, err
		}
	}
	return s.findScript(ctx, userID, id)
}
func boolValue(v *bool) bool { return v != nil && *v }
func nullableUUID(v *uuid.UUID) any {
	if v == nil {
		return nil
	}
	return auth.ToPGUUID(*v)
}
func (s *Service) findScript(ctx context.Context, userID, id uuid.UUID) (Script, error) {
	var v Script
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT s.id,s.user_id,s.category_id,COALESCE(c.name,''),s.title,s.script_type,s.tags,s.paragraphs,s.note,s.favorite,s.created_at,s.updated_at FROM communication_scripts s LEFT JOIN communication_script_categories c ON c.id=s.category_id AND c.user_id=s.user_id WHERE s.id=$1 AND s.user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID)).Scan(&v.ID, &v.UserID, &v.CategoryID, &v.CategoryName, &v.Title, &v.ScriptType, &v.Tags, &raw, &v.Note, &v.Favorite, &v.CreatedAt, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, problem.New("NOT_FOUND", 404, "script not found")
	}
	if err != nil {
		return v, err
	}
	err = json.Unmarshal(raw, &v.Paragraphs)
	return v, err
}
func (s *Service) DeleteScript(ctx context.Context, userID, id uuid.UUID) error {
	r, err := s.pool.Exec(ctx, `DELETE FROM communication_scripts WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID))
	if err == nil && r.RowsAffected() == 0 {
		return problem.New("NOT_FOUND", 404, "script not found")
	}
	return err
}
func (s *Service) ToggleFavorite(ctx context.Context, userID, id uuid.UUID) (Script, error) {
	_, err := s.pool.Exec(ctx, `UPDATE communication_scripts SET favorite=NOT favorite,updated_at=now() WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID))
	if err != nil {
		return Script{}, err
	}
	return s.findScript(ctx, userID, id)
}
