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
type Script struct {
	ID, UserID              uuid.UUID
	Title, ScriptType, Note string
	Tags, Paragraphs        []string
	Favorite                bool
	CreatedAt, UpdatedAt    time.Time
}
type ScriptInput struct {
	Title, ScriptType, Note string
	Tags, Paragraphs        []string
	Favorite                *bool
}
type ScriptType struct {
	ID, UserID           uuid.UUID
	Name                 string
	SortOrder            int
	CreatedAt, UpdatedAt time.Time
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
	if clean(in.Title, 200) == "" || clean(in.ScriptType, 80) == "" || len(in.Paragraphs) == 0 {
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

func validateScriptType(name string) (string, error) {
	name = clean(name, 80)
	if name == "" {
		return "", problem.New("VALIDATION_ERROR", 400, "script type name is required")
	}
	return name, nil
}

func (s *Service) ListScriptTypes(ctx context.Context, userID uuid.UUID) ([]ScriptType, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,name,sort_order,created_at,updated_at FROM communication_script_types WHERE user_id=$1 ORDER BY sort_order,lower(name),name`, auth.ToPGUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ScriptType{}
	for rows.Next() {
		var value ScriptType
		if err := rows.Scan(&value.ID, &value.UserID, &value.Name, &value.SortOrder, &value.CreatedAt, &value.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, value)
	}
	return out, rows.Err()
}

func (s *Service) SaveScriptType(ctx context.Context, userID, id uuid.UUID, name string) (ScriptType, error) {
	name, err := validateScriptType(name)
	if err != nil {
		return ScriptType{}, err
	}
	var duplicate bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM communication_script_types WHERE user_id=$1 AND lower(name)=lower($2) AND id<>$3)`, auth.ToPGUUID(userID), name, auth.ToPGUUID(id)).Scan(&duplicate); err != nil {
		return ScriptType{}, err
	}
	if duplicate {
		return ScriptType{}, problem.New("CONFLICT", 409, "script type already exists")
	}
	if id == uuid.Nil {
		id = uuid.New()
		var value ScriptType
		err = s.pool.QueryRow(ctx, `INSERT INTO communication_script_types(id,user_id,name) VALUES($1,$2,$3) RETURNING id,user_id,name,sort_order,created_at,updated_at`, auth.ToPGUUID(id), auth.ToPGUUID(userID), name).Scan(&value.ID, &value.UserID, &value.Name, &value.SortOrder, &value.CreatedAt, &value.UpdatedAt)
		return value, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ScriptType{}, err
	}
	defer tx.Rollback(ctx)
	var oldName string
	if err := tx.QueryRow(ctx, `SELECT name FROM communication_script_types WHERE id=$1 AND user_id=$2 FOR UPDATE`, auth.ToPGUUID(id), auth.ToPGUUID(userID)).Scan(&oldName); errors.Is(err, pgx.ErrNoRows) {
		return ScriptType{}, problem.New("NOT_FOUND", 404, "script type not found")
	} else if err != nil {
		return ScriptType{}, err
	}
	var value ScriptType
	err = tx.QueryRow(ctx, `UPDATE communication_script_types SET name=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,user_id,name,sort_order,created_at,updated_at`, auth.ToPGUUID(id), auth.ToPGUUID(userID), name).Scan(&value.ID, &value.UserID, &value.Name, &value.SortOrder, &value.CreatedAt, &value.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ScriptType{}, problem.New("NOT_FOUND", 404, "script type not found")
	}
	if err != nil {
		return ScriptType{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE communication_scripts SET script_type=$3,updated_at=now() WHERE user_id=$1 AND script_type=$2`, auth.ToPGUUID(userID), oldName, name); err != nil {
		return ScriptType{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ScriptType{}, err
	}
	return value, nil
}

func (s *Service) DeleteScriptType(ctx context.Context, userID, id uuid.UUID) error {
	var used bool
	var name string
	if err := s.pool.QueryRow(ctx, `SELECT name FROM communication_script_types WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID)).Scan(&name); errors.Is(err, pgx.ErrNoRows) {
		return problem.New("NOT_FOUND", 404, "script type not found")
	} else if err != nil {
		return err
	}
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM communication_scripts WHERE user_id=$1 AND script_type=$2)`, auth.ToPGUUID(userID), name).Scan(&used); err != nil {
		return err
	}
	if used {
		return problem.New("CONFLICT", 409, "cannot delete a type used by scripts; change those scripts first")
	}
	result, err := s.pool.Exec(ctx, `DELETE FROM communication_script_types WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID))
	if err == nil && result.RowsAffected() == 0 {
		return problem.New("NOT_FOUND", 404, "script type not found")
	}
	return err
}

func (s *Service) ensureScriptType(ctx context.Context, userID uuid.UUID, name string) (string, error) {
	var canonical string
	err := s.pool.QueryRow(ctx, `SELECT name FROM communication_script_types WHERE user_id=$1 AND lower(name)=lower($2)`, auth.ToPGUUID(userID), name).Scan(&canonical)
	if err == nil {
		return canonical, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO communication_script_types(id,user_id,name) VALUES($1,$2,$3)`, uuid.New(), auth.ToPGUUID(userID), name)
	return name, err
}

func (s *Service) ListScripts(ctx context.Context, userID uuid.UUID, page, pageSize int, q, scriptType string, favorite bool) ([]Script, int, error) {
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
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM communication_scripts WHERE user_id=$1 AND lower(script_type||' '||title||' '||note||' '||array_to_string(tags,' ')||' '||paragraphs::text) LIKE $2 AND script_type LIKE $3 AND ($4=false OR favorite)`, auth.ToPGUUID(userID), q, typ, favorite).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	rows, err := s.pool.Query(ctx, `SELECT s.id,s.user_id,s.title,s.script_type,s.tags,s.paragraphs,s.note,s.favorite,s.created_at,s.updated_at FROM communication_scripts s WHERE s.user_id=$1 AND lower(s.script_type||' '||s.title||' '||s.note||' '||array_to_string(s.tags,' ')||' '||s.paragraphs::text) LIKE $2 AND s.script_type LIKE $3 AND ($4=false OR s.favorite) ORDER BY s.favorite DESC,s.updated_at DESC LIMIT $5 OFFSET $6`, auth.ToPGUUID(userID), q, typ, favorite, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Script{}
	for rows.Next() {
		var v Script
		var raw []byte
		if err := rows.Scan(&v.ID, &v.UserID, &v.Title, &v.ScriptType, &v.Tags, &raw, &v.Note, &v.Favorite, &v.CreatedAt, &v.UpdatedAt); err != nil {
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
	in.ScriptType = clean(in.ScriptType, 80)
	canonicalType, err := s.ensureScriptType(ctx, userID, in.ScriptType)
	if err != nil {
		return Script{}, err
	}
	in.ScriptType = canonicalType
	raw, _ := json.Marshal(in.Paragraphs)
	if id == uuid.Nil {
		id = uuid.New()
		_, err := s.pool.Exec(ctx, `INSERT INTO communication_scripts(id,user_id,title,script_type,tags,paragraphs,note,favorite) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, auth.ToPGUUID(id), auth.ToPGUUID(userID), clean(in.Title, 200), in.ScriptType, in.Tags, raw, in.Note, boolValue(in.Favorite))
		if err != nil {
			return Script{}, err
		}
	} else {
		_, err := s.pool.Exec(ctx, `UPDATE communication_scripts SET title=$3,script_type=$4,tags=$5,paragraphs=$6,note=$7,favorite=COALESCE($8,favorite),updated_at=now() WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID), clean(in.Title, 200), in.ScriptType, in.Tags, raw, in.Note, in.Favorite)
		if err != nil {
			return Script{}, err
		}
	}
	return s.findScript(ctx, userID, id)
}
func boolValue(v *bool) bool { return v != nil && *v }
func (s *Service) findScript(ctx context.Context, userID, id uuid.UUID) (Script, error) {
	var v Script
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT id,user_id,title,script_type,tags,paragraphs,note,favorite,created_at,updated_at FROM communication_scripts WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID)).Scan(&v.ID, &v.UserID, &v.Title, &v.ScriptType, &v.Tags, &raw, &v.Note, &v.Favorite, &v.CreatedAt, &v.UpdatedAt)
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
