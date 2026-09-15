package analytics

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/money"
	"jl-business-growth/backend/internal/problem"
)

type Bucket struct {
	Period                    string
	ActionCount               int64
	ReadingMinutes            int64
	AudioMinutes              int64
	PV                        float64
	NetAmount                 money.Cents
	IncomeAmount              money.Cents
	ExpenseAmount             money.Cents
	NetCashFlow               money.Cents
	MemberCount               int64
	ActiveMemberCount         int64
	GoalCount, CompletedCount int64
}
type Result struct {
	Metric, Granularity string
	From, To            time.Time
	Buckets             []Bucket
}
type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }
func (s *Service) Worklogs(ctx context.Context, userID uuid.UUID, from, to time.Time, granularity string) (Result, error) {
	if err := validRange(from, to, granularity); err != nil {
		return Result{}, err
	}
	rows, err := s.pool.Query(ctx, `SELECT w.work_date,(w.open_conversation_count+w.deep_conversation_count+w.buffer_count+w.story_share_count+w.screening_count+w.opportunity_count+w.meeting_count+w.customer_followup_count)::bigint,COALESCE((SELECT ls.minutes FROM learning_sessions ls WHERE ls.user_id=w.user_id AND ls.activity_date=w.work_date AND ls.activity_type='READING' AND ls.source='DAILY_UNALLOCATED'),0)::bigint,COALESCE((SELECT ls.minutes FROM learning_sessions ls WHERE ls.user_id=w.user_id AND ls.activity_date=w.work_date AND ls.activity_type='AUDIO' AND ls.source='DAILY_UNALLOCATED'),0)::bigint FROM daily_worklogs w WHERE w.user_id=$1 AND w.work_date >= $2 AND w.work_date < $3 ORDER BY w.work_date`, auth.ToPGUUID(userID), from, to)
	if err != nil {
		return Result{}, err
	}
	defer rows.Close()
	result := Result{Metric: "worklogs", Granularity: granularity, From: from, To: to}
	for rows.Next() {
		var date time.Time
		var b Bucket
		if err := rows.Scan(&date, &b.ActionCount, &b.ReadingMinutes, &b.AudioMinutes); err != nil {
			return Result{}, err
		}
		b.Period = bucketKey(date, granularity)
		mergeWorklog(&result.Buckets, b)
	}
	return result, rows.Err()
}
func (s *Service) Turnover(ctx context.Context, userID uuid.UUID, from, to time.Time, granularity string) (Result, error) {
	if err := validRange(from, to, granularity); err != nil {
		return Result{}, err
	}
	rows, err := s.pool.Query(ctx, `SELECT turnover_date,pv,net_amount FROM daily_turnovers WHERE user_id=$1 AND turnover_date >= $2 AND turnover_date < $3 ORDER BY turnover_date`, auth.ToPGUUID(userID), from, to)
	if err != nil {
		return Result{}, err
	}
	defer rows.Close()
	result := Result{Metric: "turnover", Granularity: granularity, From: from, To: to}
	for rows.Next() {
		var date time.Time
		var b Bucket
		var amount string
		if err := rows.Scan(&date, &b.PV, &amount); err != nil {
			return Result{}, err
		}
		b.NetAmount, _ = money.Parse(amount)
		b.Period = bucketKey(date, granularity)
		mergeTurnover(&result.Buckets, b)
	}
	return result, rows.Err()
}

func (s *Service) Finance(ctx context.Context, userID uuid.UUID, from, to time.Time, granularity string) (Result, error) {
	if err := validRange(from, to, granularity); err != nil {
		return Result{}, err
	}
	rows, err := s.pool.Query(ctx, `SELECT occurred_on,type::text,amount FROM financial_transactions WHERE user_id=$1 AND occurred_on >= $2 AND occurred_on < $3 ORDER BY occurred_on`, auth.ToPGUUID(userID), from, to)
	if err != nil {
		return Result{}, err
	}
	defer rows.Close()
	result := Result{Metric: "finance", Granularity: granularity, From: from, To: to}
	for rows.Next() {
		var date time.Time
		var typ string
		var raw string
		if err := rows.Scan(&date, &typ, &raw); err != nil {
			return Result{}, err
		}
		amount, parseErr := money.Parse(raw)
		if parseErr != nil {
			return Result{}, parseErr
		}
		b := Bucket{Period: bucketKey(date, granularity)}
		if typ == "INCOME" {
			b.IncomeAmount = amount
		} else {
			b.ExpenseAmount = amount
		}
		b.NetCashFlow = b.IncomeAmount - b.ExpenseAmount
		mergeFinance(&result.Buckets, b)
	}
	return result, rows.Err()
}

func (s *Service) Team(ctx context.Context, userID uuid.UUID, from, to time.Time, granularity string) (Result, error) {
	if err := validRange(from, to, granularity); err != nil {
		return Result{}, err
	}
	rows, err := s.pool.Query(ctx, `SELECT COALESCE(joined_on, created_at::date), COUNT(*), COUNT(*) FILTER (WHERE status='ACTIVE') FROM team_members WHERE user_id=$1 AND COALESCE(joined_on, created_at::date) >= $2 AND COALESCE(joined_on, created_at::date) < $3 GROUP BY 1 ORDER BY 1`, auth.ToPGUUID(userID), from, to)
	if err != nil {
		return Result{}, err
	}
	defer rows.Close()
	result := Result{Metric: "team", Granularity: granularity, From: from, To: to}
	for rows.Next() {
		var date time.Time
		var b Bucket
		if err := rows.Scan(&date, &b.MemberCount, &b.ActiveMemberCount); err != nil {
			return Result{}, err
		}
		b.Period = bucketKey(date, granularity)
		i := bucketIndex(result.Buckets, b.Period)
		if i < 0 {
			result.Buckets = append(result.Buckets, b)
		} else {
			result.Buckets[i].MemberCount += b.MemberCount
			result.Buckets[i].ActiveMemberCount += b.ActiveMemberCount
		}
	}
	return result, rows.Err()
}
func (s *Service) Goals(ctx context.Context, userID uuid.UUID, from, to time.Time, granularity string) (Result, error) {
	if err := validRange(from, to, granularity); err != nil {
		return Result{}, err
	}
	rows, err := s.pool.Query(ctx, `SELECT COALESCE(start_date,created_at::date),status::text FROM goals WHERE user_id=$1 AND COALESCE(start_date,created_at::date) >= $2 AND COALESCE(start_date,created_at::date) < $3 ORDER BY 1`, auth.ToPGUUID(userID), from, to)
	if err != nil {
		return Result{}, err
	}
	defer rows.Close()
	result := Result{Metric: "goals", Granularity: granularity, From: from, To: to}
	for rows.Next() {
		var date time.Time
		var status string
		if err := rows.Scan(&date, &status); err != nil {
			return Result{}, err
		}
		key := bucketKey(date, granularity)
		index := bucketIndex(result.Buckets, key)
		if index < 0 {
			result.Buckets = append(result.Buckets, Bucket{Period: key})
			index = len(result.Buckets) - 1
		}
		result.Buckets[index].GoalCount++
		if status == "COMPLETED" {
			result.Buckets[index].CompletedCount++
		}
	}
	return result, rows.Err()
}
func validRange(from, to time.Time, granularity string) error {
	if !from.Before(to) {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "analytics range must have from before to")
	}
	if !map[string]bool{"day": true, "week": true, "month": true}[granularity] {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "granularity must be day, week, or month")
	}
	return nil
}
func bucketKey(date time.Time, g string) string {
	date = date.UTC()
	switch g {
	case "week":
		start := date.AddDate(0, 0, -int((int(date.Weekday())+6)%7))
		return start.Format("2006-01-02")
	case "month":
		return date.Format("2006-01")
	default:
		return date.Format("2006-01-02")
	}
}
func bucketIndex(values []Bucket, key string) int {
	for i := range values {
		if values[i].Period == key {
			return i
		}
	}
	return -1
}
func mergeWorklog(values *[]Bucket, b Bucket) {
	i := bucketIndex(*values, b.Period)
	if i < 0 {
		*values = append(*values, b)
		return
	}
	(*values)[i].ActionCount += b.ActionCount
	(*values)[i].ReadingMinutes += b.ReadingMinutes
	(*values)[i].AudioMinutes += b.AudioMinutes
}
func mergeTurnover(values *[]Bucket, b Bucket) {
	i := bucketIndex(*values, b.Period)
	if i < 0 {
		*values = append(*values, b)
		return
	}
	(*values)[i].PV += b.PV
	(*values)[i].NetAmount += b.NetAmount
}

func mergeFinance(values *[]Bucket, b Bucket) {
	i := bucketIndex(*values, b.Period)
	if i < 0 {
		*values = append(*values, b)
		return
	}
	(*values)[i].IncomeAmount += b.IncomeAmount
	(*values)[i].ExpenseAmount += b.ExpenseAmount
	(*values)[i].NetCashFlow += b.NetCashFlow
}
