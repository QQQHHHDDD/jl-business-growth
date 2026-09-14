package reviews

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/problem"
)

type Review struct {
	ID, UserID                                       uuid.UUID
	Type                                             string
	PeriodStart                                      time.Time
	Good, Problems, Improvements, NextFocus, Summary *string
	WorklogActionCount                               int64
	TurnoverPV, TurnoverNetAmount                    float64
	CreatedAt, UpdatedAt                             time.Time
}
type Input struct {
	Type                                             string
	PeriodStart                                      time.Time
	Good, Problems, Improvements, NextFocus, Summary *string
}
type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

func (s *Service) Get(ctx context.Context, userID uuid.UUID, reviewType string, period time.Time) (Review, error) {
	item, err := s.query(ctx, userID, reviewType, period)
	if err != nil {
		return Review{}, err
	}
	item.UserID = userID
	return item, nil
}
func (s *Service) List(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]Review, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,type::text,period_start,good,problems,improvements,next_focus,summary,created_at,updated_at FROM reviews WHERE user_id=$1 AND period_start BETWEEN $2 AND $3 ORDER BY period_start DESC`, auth.ToPGUUID(userID), from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Review{}
	for rows.Next() {
		var v Review
		if err := rows.Scan(&v.ID, &v.UserID, &v.Type, &v.PeriodStart, &v.Good, &v.Problems, &v.Improvements, &v.NextFocus, &v.Summary, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	return result, rows.Err()
}
func (s *Service) Save(ctx context.Context, userID uuid.UUID, input Input) (Review, error) {
	if !validType(input.Type) {
		return Review{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "review type is invalid")
	}
	if input.PeriodStart.IsZero() {
		return Review{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "review period is required")
	}
	var item Review
	err := s.pool.QueryRow(ctx, `INSERT INTO reviews (user_id,type,period_start,good,problems,improvements,next_focus,summary) VALUES ($1,$2,$3,COALESCE($4,''),COALESCE($5,''),COALESCE($6,''),COALESCE($7,''),$8) ON CONFLICT (user_id,type,period_start) DO UPDATE SET good=EXCLUDED.good,problems=EXCLUDED.problems,improvements=EXCLUDED.improvements,next_focus=EXCLUDED.next_focus,summary=EXCLUDED.summary,updated_at=now() RETURNING id,user_id,type::text,period_start,good,problems,improvements,next_focus,summary,created_at,updated_at`, auth.ToPGUUID(userID), input.Type, input.PeriodStart, input.Good, input.Problems, input.Improvements, input.NextFocus, input.Summary).Scan(&item.ID, &item.UserID, &item.Type, &item.PeriodStart, &item.Good, &item.Problems, &item.Improvements, &item.NextFocus, &item.Summary, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
func (s *Service) WithTotals(ctx context.Context, item Review) (Review, error) {
	end := item.PeriodStart.AddDate(0, 0, 1)
	switch item.Type {
	case "WEEKLY":
		end = item.PeriodStart.AddDate(0, 0, 7)
	case "MONTHLY":
		end = item.PeriodStart.AddDate(0, 1, 0)
	}
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(open_conversation_count+deep_conversation_count+buffer_count+story_share_count+screening_count+opportunity_count+meeting_count+customer_followup_count),0) FROM daily_worklogs WHERE user_id=$1 AND work_date >= $2 AND work_date < $3`, auth.ToPGUUID(item.UserID), item.PeriodStart, end).Scan(&item.WorklogActionCount); err != nil {
		return Review{}, err
	}
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(pv),0),COALESCE(SUM(net_amount),0) FROM daily_turnovers WHERE user_id=$1 AND turnover_date >= $2 AND turnover_date < $3`, auth.ToPGUUID(item.UserID), item.PeriodStart, end).Scan(&item.TurnoverPV, &item.TurnoverNetAmount); err != nil {
		return Review{}, err
	}
	return item, nil
}
func (s *Service) query(ctx context.Context, userID uuid.UUID, reviewType string, period time.Time) (Review, error) {
	var v Review
	err := s.pool.QueryRow(ctx, `SELECT id,user_id,type::text,period_start,good,problems,improvements,next_focus,summary,created_at,updated_at FROM reviews WHERE user_id=$1 AND type=$2 AND period_start=$3`, auth.ToPGUUID(userID), reviewType, period).Scan(&v.ID, &v.UserID, &v.Type, &v.PeriodStart, &v.Good, &v.Problems, &v.Improvements, &v.NextFocus, &v.Summary, &v.CreatedAt, &v.UpdatedAt)
	if err == pgx.ErrNoRows {
		return Review{Type: reviewType, PeriodStart: period}, nil
	}
	return v, err
}
func validType(value string) bool {
	return map[string]bool{"DAILY": true, "WEEKLY": true, "MONTHLY": true}[strings.ToUpper(value)]
}
