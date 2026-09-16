package team

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

type Member struct {
	ID         uuid.UUID
	UserID     uuid.UUID
	MemberCode string
	ParentID   *uuid.UUID
	Name       string
	JoinedOn   *time.Time
	Rank       *string
	City       *string
	Status     string
	Note       *string
	SortOrder  int
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type MemberInput struct {
	MemberCode string
	ParentID   *uuid.UUID
	Name       string
	JoinedOn   *time.Time
	Rank       *string
	City       *string
	Status     string
	Note       *string
	SortOrder  int
}

type Snapshot struct {
	ID            uuid.UUID
	UserID        uuid.UUID
	SnapshotMonth time.Time
	SnapshotType  string
	CapturedAt    time.Time
	CapturedLate  bool
	Members       []SnapshotMember
}

type SnapshotMember struct {
	ID               uuid.UUID
	OriginalMemberID uuid.UUID
	ParentID         *uuid.UUID
	Name             string
	JoinedOn         *time.Time
	Rank             *string
	City             *string
	Status           string
	Note             *string
	SortOrder        int
}

func (s *Service) ListMembers(ctx context.Context, userID uuid.UUID) ([]Member, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, user_id, member_code, parent_member_id, name, joined_on, rank, city, status, note, sort_order, created_at, updated_at
		FROM team_members WHERE user_id=$1 ORDER BY sort_order, created_at, name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Member, 0)
	for rows.Next() {
		item, err := scanMember(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) GetMember(ctx context.Context, userID, id uuid.UUID) (Member, error) {
	row := s.pool.QueryRow(ctx, `SELECT id, user_id, member_code, parent_member_id, name, joined_on, rank, city, status, note, sort_order, created_at, updated_at
		FROM team_members WHERE user_id=$1 AND id=$2`, userID, id)
	item, err := scanMember(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Member{}, problem.New("NOT_FOUND", http.StatusNotFound, "team member not found")
	}
	return item, err
}

func (s *Service) SaveMember(ctx context.Context, userID, id uuid.UUID, input MemberInput) (Member, error) {
	name := strings.TrimSpace(input.Name)
	runes := []rune(name)
	if len(runes) < 2 || len(runes) > 200 {
		return Member{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "member name must contain 2 to 200 characters")
	}
	allDigits := true
	for _, value := range runes {
		if value < '0' || value > '9' {
			allDigits = false
			break
		}
	}
	if allDigits {
		return Member{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "member name cannot contain only digits")
	}
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if input.Status != "ACTIVE" && input.Status != "INACTIVE" {
		return Member{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "member status is invalid")
	}
	if strings.TrimSpace(input.MemberCode) != "" && (len([]rune(strings.TrimSpace(input.MemberCode))) > 100 || strings.ContainsAny(input.MemberCode, "\r\n")) {
		return Member{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "member code is invalid")
	}
	if input.ParentID != nil {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM team_members WHERE id=$1 AND user_id=$2)`, *input.ParentID, userID).Scan(&exists); err != nil {
			return Member{}, err
		}
		if !exists {
			return Member{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "parent member is not in this team")
		}
		if id != uuid.Nil {
			var cycle bool
			err := s.pool.QueryRow(ctx, `WITH RECURSIVE descendants AS (
				SELECT id FROM team_members WHERE id=$1 AND user_id=$2
				UNION ALL SELECT m.id FROM team_members m JOIN descendants d ON m.parent_member_id=d.id WHERE m.user_id=$2
			) SELECT EXISTS(SELECT 1 FROM descendants WHERE id=$3)`, id, userID, *input.ParentID).Scan(&cycle)
			if err != nil {
				return Member{}, err
			}
			if cycle {
				return Member{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "team hierarchy cannot contain a cycle")
			}
		}
	}
	if id == uuid.Nil {
		id = uuid.New()
	}
	code := strings.TrimSpace(input.MemberCode)
	if code == "" {
		code = "member-" + strings.ReplaceAll(id.String(), "-", "")[:12]
	}
	var duplicate bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM team_members WHERE user_id=$1 AND member_code=$2 AND id<>$3)`, userID, code, id).Scan(&duplicate); err != nil {
		return Member{}, err
	}
	if duplicate {
		return Member{}, problem.New("CONFLICT", http.StatusConflict, "member code already exists")
	}
	var item Member
	row := s.pool.QueryRow(ctx, `INSERT INTO team_members (id,user_id,member_code,parent_member_id,name,joined_on,rank,city,status,note,sort_order)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (id) DO UPDATE SET parent_member_id=EXCLUDED.parent_member_id,name=EXCLUDED.name,joined_on=EXCLUDED.joined_on,
		 member_code=EXCLUDED.member_code,rank=EXCLUDED.rank,city=EXCLUDED.city,status=EXCLUDED.status,note=EXCLUDED.note,sort_order=EXCLUDED.sort_order,updated_at=now()
		WHERE team_members.user_id=$2
		RETURNING id,user_id,member_code,parent_member_id,name,joined_on,rank,city,status,note,sort_order,created_at,updated_at`, id, userID, code, input.ParentID, name, input.JoinedOn, input.Rank, input.City, input.Status, input.Note, input.SortOrder)
	var err error
	item, err = scanMember(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Member{}, problem.New("NOT_FOUND", http.StatusNotFound, "team member not found")
	}
	return item, err
}

func (s *Service) DeleteMember(ctx context.Context, userID, id uuid.UUID, promoteChildren bool) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var parent *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT parent_member_id FROM team_members WHERE id=$1 AND user_id=$2`, id, userID).Scan(&parent); errors.Is(err, pgx.ErrNoRows) {
		return problem.New("NOT_FOUND", http.StatusNotFound, "team member not found")
	} else if err != nil {
		return err
	}
	var hasChildren bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM team_members WHERE user_id=$1 AND parent_member_id=$2)`, userID, id).Scan(&hasChildren); err != nil {
		return err
	}
	if hasChildren && !promoteChildren {
		return problem.New("CONFLICT", http.StatusConflict, "member has children; promote them before deleting")
	}
	if hasChildren {
		if _, err := tx.Exec(ctx, `UPDATE team_members SET parent_member_id=$1, updated_at=now() WHERE user_id=$2 AND parent_member_id=$3`, parent, userID, id); err != nil {
			return err
		}
	}
	result, err := tx.Exec(ctx, `DELETE FROM team_members WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return problem.New("NOT_FOUND", http.StatusNotFound, "team member not found")
	}
	return tx.Commit(ctx)
}

func (s *Service) ListSnapshots(ctx context.Context, userID uuid.UUID) ([]Snapshot, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,snapshot_month,snapshot_type,captured_at,captured_late FROM team_snapshots WHERE user_id=$1 ORDER BY snapshot_month DESC, captured_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Snapshot, 0)
	for rows.Next() {
		var item Snapshot
		if err := rows.Scan(&item.ID, &item.UserID, &item.SnapshotMonth, &item.SnapshotType, &item.CapturedAt, &item.CapturedLate); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) GetSnapshot(ctx context.Context, userID, id uuid.UUID) (Snapshot, error) {
	var item Snapshot
	err := s.pool.QueryRow(ctx, `SELECT id,user_id,snapshot_month,snapshot_type,captured_at,captured_late FROM team_snapshots WHERE user_id=$1 AND id=$2`, userID, id).Scan(&item.ID, &item.UserID, &item.SnapshotMonth, &item.SnapshotType, &item.CapturedAt, &item.CapturedLate)
	if errors.Is(err, pgx.ErrNoRows) {
		return Snapshot{}, problem.New("NOT_FOUND", http.StatusNotFound, "team snapshot not found")
	}
	if err != nil {
		return Snapshot{}, err
	}
	rows, err := s.pool.Query(ctx, `SELECT id,original_member_id,parent_snapshot_member_id,name,joined_on,rank,city,status,note,sort_order FROM team_snapshot_members WHERE snapshot_id=$1 ORDER BY sort_order,name`, id)
	if err != nil {
		return Snapshot{}, err
	}
	defer rows.Close()
	item.Members = make([]SnapshotMember, 0)
	for rows.Next() {
		var member SnapshotMember
		if err := rows.Scan(&member.ID, &member.OriginalMemberID, &member.ParentID, &member.Name, &member.JoinedOn, &member.Rank, &member.City, &member.Status, &member.Note, &member.SortOrder); err != nil {
			return Snapshot{}, err
		}
		item.Members = append(item.Members, member)
	}
	return item, rows.Err()
}

func (s *Service) CreateSnapshot(ctx context.Context, userID uuid.UUID, month time.Time, snapshotType string, capturedLate bool) (Snapshot, error) {
	month = time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	if snapshotType == "" {
		snapshotType = "MANUAL"
	}
	if snapshotType != "MANUAL" && snapshotType != "AUTO" {
		return Snapshot{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "snapshot type is invalid")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	defer tx.Rollback(ctx)
	var id uuid.UUID
	err = tx.QueryRow(ctx, `INSERT INTO team_snapshots (id,user_id,snapshot_month,snapshot_type,captured_late) VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (user_id,snapshot_month,snapshot_type) DO UPDATE SET captured_at=now(),captured_late=EXCLUDED.captured_late RETURNING id`, uuid.New(), userID, month, snapshotType, capturedLate).Scan(&id)
	if err != nil {
		return Snapshot{}, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM team_snapshot_members WHERE snapshot_id=$1`, id); err != nil {
		return Snapshot{}, err
	}
	rows, err := tx.Query(ctx, `SELECT id,parent_member_id,name,joined_on,rank,city,status,note,sort_order FROM team_members WHERE user_id=$1 ORDER BY sort_order,created_at,name`, userID)
	if err != nil {
		return Snapshot{}, err
	}
	defer rows.Close()
	type current struct {
		id         uuid.UUID
		parent     *uuid.UUID
		name       string
		joined     *time.Time
		rank, city *string
		status     string
		note       *string
		order      int
	}
	currentMembers := make([]current, 0)
	for rows.Next() {
		var m current
		if err := rows.Scan(&m.id, &m.parent, &m.name, &m.joined, &m.rank, &m.city, &m.status, &m.note, &m.order); err != nil {
			return Snapshot{}, err
		}
		currentMembers = append(currentMembers, m)
	}
	if err := rows.Err(); err != nil {
		return Snapshot{}, err
	}
	ids := make(map[uuid.UUID]uuid.UUID, len(currentMembers))
	for _, m := range currentMembers {
		ids[m.id] = uuid.New()
	}
	for _, m := range currentMembers {
		var parentID *uuid.UUID
		if m.parent != nil {
			converted := ids[*m.parent]
			parentID = &converted
		}
		if _, err := tx.Exec(ctx, `INSERT INTO team_snapshot_members (id,snapshot_id,original_member_id,parent_snapshot_member_id,name,joined_on,rank,city,status,note,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, ids[m.id], id, m.id, parentID, m.name, m.joined, m.rank, m.city, m.status, m.note, m.order); err != nil {
			return Snapshot{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Snapshot{}, err
	}
	return s.GetSnapshot(ctx, userID, id)
}

// CaptureMonthlySnapshots uses each account's IANA timezone to determine the
// just-finished business month. Delayed backfills are visible in the snapshot.
func (s *Service) CaptureMonthlySnapshots(ctx context.Context, now time.Time) error {
	rows, err := s.pool.Query(ctx, `SELECT id,timezone FROM accounts WHERE role='USER' AND status='ACTIVE'`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var userID uuid.UUID
		var timezone string
		if err := rows.Scan(&userID, &timezone); err != nil {
			return err
		}
		month, late, err := SnapshotMonthFor(now, timezone)
		if err != nil {
			return err
		}
		if _, err := s.CreateSnapshot(ctx, userID, month, "AUTO", late); err != nil {
			return err
		}
	}
	return rows.Err()
}

func SnapshotMonthFor(now time.Time, timezone string) (time.Time, bool, error) {
	if strings.TrimSpace(timezone) == "" {
		timezone = "Asia/Shanghai"
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, false, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "account timezone is invalid")
	}
	local := now.In(location)
	currentMonthStart := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, location)
	return currentMonthStart.AddDate(0, -1, 0).UTC(), local.Day() > 1, nil
}

type rowScanner interface{ Scan(...any) error }

func scanMember(row rowScanner) (Member, error) {
	var item Member
	err := row.Scan(&item.ID, &item.UserID, &item.MemberCode, &item.ParentID, &item.Name, &item.JoinedOn, &item.Rank, &item.City, &item.Status, &item.Note, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
