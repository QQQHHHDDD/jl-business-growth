package daily

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/money"
	"jl-business-growth/backend/internal/problem"
	pvcalc "jl-business-growth/backend/internal/pv"
)

var metricCodes = map[string]struct{}{
	"conversation_open_count": {},
	"deep_conversation_count": {},
	"buffer_count":            {},
	"story_share_count":       {},
	"screening_count":         {},
	"opportunity_count":       {},
	"meeting_count":           {},
	"customer_followup_count": {},
	"reading_minutes":         {},
	"audio_minutes":           {},
	"turnover_pv":             {},
	"turnover_net_amount":     {},
}

type Service struct {
	pool    *pgxpool.Pool
	queries *generated.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: generated.New(pool)}
}

type WorklogInput struct {
	WorkDate              time.Time
	OpenConversationCount int32
	DeepConversationCount int32
	BufferCount           int32
	StoryShareCount       int32
	ScreeningCount        int32
	OpportunityCount      int32
	MeetingCount          int32
	CustomerFollowupCount int32
	ReadingMinutes        int32
	AudioMinutes          int32
	TurnoverPV            *float64
	TurnoverNetAmount     *money.Cents
	Note                  *string
}

type Worklog struct {
	ID                    uuid.UUID
	UserID                uuid.UUID
	WorkDate              time.Time
	OpenConversationCount int32
	DeepConversationCount int32
	BufferCount           int32
	StoryShareCount       int32
	ScreeningCount        int32
	OpportunityCount      int32
	MeetingCount          int32
	CustomerFollowupCount int32
	ReadingMinutes        int
	AudioMinutes          int
	TurnoverPV            *float64
	TurnoverNetAmount     *money.Cents
	Note                  *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type TurnoverInput struct {
	TurnoverDate time.Time
	PV           *float64
	NetAmount    *money.Cents
	Note         *string
}

type Turnover struct {
	ID           uuid.UUID
	UserID       uuid.UUID
	TurnoverDate time.Time
	PV           float64
	NetAmount    money.Cents
	Note         *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type DreamInput struct {
	Title       string
	Description *string
	GoalIDs     []uuid.UUID
	FileIDs     []uuid.UUID
	SortOrder   int32
}

type Dream struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	Title       string
	Description *string
	GoalIDs     []uuid.UUID
	FileIDs     []uuid.UUID
	SortOrder   int32
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type GoalMetricInput struct {
	MetricCode  string
	TargetValue float64
	Unit        string
}

type GoalInput struct {
	ParentID    *uuid.UUID
	Type        string
	Title       string
	Description *string
	StartDate   *time.Time
	DueDate     *time.Time
	Status      string
	SortOrder   int32
	Metrics     []GoalMetricInput
}

type GoalMetric struct {
	MetricCode  string
	TargetValue float64
	Unit        string
	ActualValue float64
	Progress    float64
}

type Goal struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	ParentID    *uuid.UUID
	Type        string
	Title       string
	Description *string
	StartDate   *time.Time
	DueDate     *time.Time
	Status      string
	SortOrder   int32
	Metrics     []GoalMetric
	Progress    float64
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type WorklogTotals struct {
	OpenConversationCount int64
	DeepConversationCount int64
	BufferCount           int64
	StoryShareCount       int64
	ScreeningCount        int64
	OpportunityCount      int64
	MeetingCount          int64
	CustomerFollowupCount int64
	ReadingMinutes        int64
	AudioMinutes          int64
}

type TurnoverTotals struct {
	PV        float64
	NetAmount money.Cents
}

type Period struct {
	From     time.Time
	To       time.Time
	Worklogs WorklogTotals
	Turnover TurnoverTotals
}

type Dashboard struct {
	Date            time.Time
	Today           Period
	Week            Period
	Month           Period
	ActiveGoals     []Goal
	DreamsCount     int64
	UpcomingEvents  []UpcomingEvent
	TeamSummary     DashboardTeamSummary
	LearningSummary DashboardLearningSummary
	FinanceSummary  DashboardFinanceSummary
}

type UpcomingEvent struct {
	ID             uuid.UUID
	Title          string
	StartAt, EndAt time.Time
}
type DashboardTeamSummary struct{ TotalMembers, ActiveMembers int64 }
type DashboardLearningSummary struct{ ReadingMinutes, AudioMinutes int64 }
type DashboardFinanceSummary struct{ Income, Expense, NetCashFlow money.Cents }

func (s *Service) ListWorklogs(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]Worklog, error) {
	from, to = normalizeRange(from, to)
	rows, err := s.queries.ListWorklogs(ctx, generated.ListWorklogsParams{UserID: auth.ToPGUUID(userID), WorkDate: toPGDate(from), WorkDate_2: toPGDate(to)})
	if err != nil {
		return nil, err
	}
	items := make([]Worklog, 0, len(rows))
	for _, row := range rows {
		item, err := worklogFromListRow(row)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) GetWorklog(ctx context.Context, userID uuid.UUID, date time.Time) (Worklog, error) {
	row, err := s.queries.GetWorklog(ctx, generated.GetWorklogParams{UserID: auth.ToPGUUID(userID), WorkDate: toPGDate(date)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Worklog{}, problem.New("NOT_FOUND", http.StatusNotFound, "worklog not found")
	}
	if err != nil {
		return Worklog{}, err
	}
	return worklogFromGetRow(row)
}

func (s *Service) SaveWorklog(ctx context.Context, userID uuid.UUID, input WorklogInput) (Worklog, error) {
	if err := validateWorklog(input); err != nil {
		return Worklog{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Worklog{}, err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	_, err = queries.UpsertWorklog(ctx, generated.UpsertWorklogParams{
		ID:                    auth.ToPGUUID(uuid.New()),
		UserID:                auth.ToPGUUID(userID),
		WorkDate:              toPGDate(input.WorkDate),
		OpenConversationCount: input.OpenConversationCount,
		DeepConversationCount: input.DeepConversationCount,
		BufferCount:           input.BufferCount,
		StoryShareCount:       input.StoryShareCount,
		ScreeningCount:        input.ScreeningCount,
		OpportunityCount:      input.OpportunityCount,
		MeetingCount:          input.MeetingCount,
		CustomerFollowupCount: input.CustomerFollowupCount,
		Note:                  textValue(input.Note),
	})
	if err != nil {
		return Worklog{}, err
	}
	for activityType, minutes := range map[generated.LearningActivityType]int32{
		generated.LearningActivityTypeREADING: input.ReadingMinutes,
		generated.LearningActivityTypeAUDIO:   input.AudioMinutes,
	} {
		var allocated int32
		if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(minutes), 0)::int FROM learning_sessions WHERE user_id=$1 AND activity_date=$2 AND activity_type=$3 AND source='ITEM'`, userID, input.WorkDate, activityType).Scan(&allocated); err != nil {
			return Worklog{}, err
		}
		if minutes < allocated {
			return Worklog{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "daily learning minutes cannot be less than item learning minutes")
		}
		if minutes == 0 {
			if err := queries.DeleteDailyLearningSession(ctx, generated.DeleteDailyLearningSessionParams{UserID: auth.ToPGUUID(userID), ActivityDate: toPGDate(input.WorkDate), ActivityType: activityType}); err != nil {
				return Worklog{}, err
			}
			continue
		}
		if _, err := queries.UpsertDailyLearningSession(ctx, generated.UpsertDailyLearningSessionParams{ID: auth.ToPGUUID(uuid.New()), UserID: auth.ToPGUUID(userID), ActivityType: activityType, ActivityDate: toPGDate(input.WorkDate), Minutes: minutes}); err != nil {
			return Worklog{}, err
		}
	}
	if input.TurnoverPV != nil || input.TurnoverNetAmount != nil {
		pv, netAmount, err := normalizeTurnover(input.TurnoverPV, input.TurnoverNetAmount)
		if err != nil {
			return Worklog{}, err
		}
		if _, err := queries.UpsertTurnover(ctx, generated.UpsertTurnoverParams{ID: auth.ToPGUUID(uuid.New()), UserID: auth.ToPGUUID(userID), TurnoverDate: toPGDate(input.WorkDate), Pv: numericValue(pv), NetAmount: money.Numeric(netAmount), Note: textValue(input.Note)}); err != nil {
			return Worklog{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Worklog{}, err
	}
	return s.GetWorklog(ctx, userID, input.WorkDate)
}

func (s *Service) DeleteWorklog(ctx context.Context, userID uuid.UUID, date time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if err := queries.DeleteWorklog(ctx, generated.DeleteWorklogParams{UserID: auth.ToPGUUID(userID), WorkDate: toPGDate(date)}); err != nil {
		return err
	}
	for _, activityType := range []generated.LearningActivityType{generated.LearningActivityTypeREADING, generated.LearningActivityTypeAUDIO} {
		if err := queries.DeleteDailyLearningSession(ctx, generated.DeleteDailyLearningSessionParams{UserID: auth.ToPGUUID(userID), ActivityDate: toPGDate(date), ActivityType: activityType}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Service) ListTurnovers(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]Turnover, error) {
	from, to = normalizeRange(from, to)
	rows, err := s.queries.ListTurnovers(ctx, generated.ListTurnoversParams{UserID: auth.ToPGUUID(userID), TurnoverDate: toPGDate(from), TurnoverDate_2: toPGDate(to)})
	if err != nil {
		return nil, err
	}
	items := make([]Turnover, 0, len(rows))
	for _, row := range rows {
		item, err := turnoverFromRow(row)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) GetTurnover(ctx context.Context, userID uuid.UUID, date time.Time) (Turnover, error) {
	row, err := s.queries.GetTurnover(ctx, generated.GetTurnoverParams{UserID: auth.ToPGUUID(userID), TurnoverDate: toPGDate(date)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Turnover{}, problem.New("NOT_FOUND", http.StatusNotFound, "turnover not found")
	}
	if err != nil {
		return Turnover{}, err
	}
	return turnoverFromRow(row)
}

func (s *Service) SaveTurnover(ctx context.Context, userID uuid.UUID, input TurnoverInput) (Turnover, error) {
	pv, netAmount, err := normalizeTurnover(input.PV, input.NetAmount)
	if err != nil {
		return Turnover{}, err
	}
	row, err := s.queries.UpsertTurnover(ctx, generated.UpsertTurnoverParams{ID: auth.ToPGUUID(uuid.New()), UserID: auth.ToPGUUID(userID), TurnoverDate: toPGDate(input.TurnoverDate), Pv: numericValue(pv), NetAmount: money.Numeric(netAmount), Note: textValue(input.Note)})
	if err != nil {
		return Turnover{}, err
	}
	return turnoverFromRow(row)
}

func (s *Service) DeleteTurnover(ctx context.Context, userID uuid.UUID, date time.Time) error {
	return s.queries.DeleteTurnover(ctx, generated.DeleteTurnoverParams{UserID: auth.ToPGUUID(userID), TurnoverDate: toPGDate(date)})
}

func (s *Service) ListDreams(ctx context.Context, userID uuid.UUID) ([]Dream, error) {
	rows, err := s.queries.ListDreams(ctx, auth.ToPGUUID(userID))
	if err != nil {
		return nil, err
	}
	items := make([]Dream, 0, len(rows))
	for _, row := range rows {
		item, err := s.dreamFromRow(ctx, row)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) GetDream(ctx context.Context, userID, dreamID uuid.UUID) (Dream, error) {
	row, err := s.queries.GetDream(ctx, generated.GetDreamParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(dreamID)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Dream{}, problem.New("NOT_FOUND", http.StatusNotFound, "dream not found")
	}
	if err != nil {
		return Dream{}, err
	}
	return s.dreamFromRow(ctx, row)
}

func (s *Service) SaveDream(ctx context.Context, userID, dreamID uuid.UUID, input DreamInput) (Dream, error) {
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 200 {
		return Dream{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "dream title must be between 1 and 200 characters")
	}
	if err := s.validateGoalIDs(ctx, userID, input.GoalIDs); err != nil {
		return Dream{}, err
	}
	if len(input.FileIDs) > 10 {
		return Dream{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "a dream can contain at most 10 images")
	}
	seenFiles := make(map[uuid.UUID]struct{}, len(input.FileIDs))
	for _, fileID := range input.FileIDs {
		if _, exists := seenFiles[fileID]; exists {
			return Dream{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "dream images must be unique")
		}
		seenFiles[fileID] = struct{}{}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Dream{}, err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if dreamID == uuid.Nil {
		dreamID = uuid.New()
		if _, err := queries.CreateDream(ctx, generated.CreateDreamParams{ID: auth.ToPGUUID(dreamID), UserID: auth.ToPGUUID(userID), Title: input.Title, Description: textValue(input.Description), SortOrder: input.SortOrder}); err != nil {
			return Dream{}, err
		}
	} else if _, err := queries.UpdateDream(ctx, generated.UpdateDreamParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(dreamID), Title: input.Title, Description: textValue(input.Description), SortOrder: input.SortOrder}); errors.Is(err, pgx.ErrNoRows) {
		return Dream{}, problem.New("NOT_FOUND", http.StatusNotFound, "dream not found")
	} else if err != nil {
		return Dream{}, err
	}
	if err := queries.DeleteDreamGoalLinks(ctx, auth.ToPGUUID(dreamID)); err != nil {
		return Dream{}, err
	}
	for _, goalID := range input.GoalIDs {
		if err := queries.AddDreamGoalLink(ctx, generated.AddDreamGoalLinkParams{DreamID: auth.ToPGUUID(dreamID), GoalID: auth.ToPGUUID(goalID)}); err != nil {
			return Dream{}, err
		}
	}
	if len(input.FileIDs) > 0 {
		var count int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM file_assets WHERE user_id=$1 AND id=ANY($2::uuid[]) AND category='DREAM_IMAGE'`, userID, input.FileIDs).Scan(&count); err != nil {
			return Dream{}, err
		}
		if count != len(input.FileIDs) {
			return Dream{}, problem.New("FORBIDDEN", http.StatusForbidden, "dream files must belong to the current user")
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM dream_files WHERE dream_id=$1`, dreamID); err != nil {
		return Dream{}, err
	}
	for index, fileID := range input.FileIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO dream_files (dream_id,file_id,sort_order) VALUES ($1,$2,$3)`, dreamID, fileID, index); err != nil {
			return Dream{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Dream{}, err
	}
	return s.GetDream(ctx, userID, dreamID)
}

func (s *Service) DeleteDream(ctx context.Context, userID, dreamID uuid.UUID) error {
	return s.queries.DeleteDream(ctx, generated.DeleteDreamParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(dreamID)})
}

func (s *Service) ListGoals(ctx context.Context, userID uuid.UUID) ([]Goal, error) {
	rows, err := s.queries.ListGoals(ctx, auth.ToPGUUID(userID))
	if err != nil {
		return nil, err
	}
	metrics, err := s.metricsForGoals(ctx, rows)
	if err != nil {
		return nil, err
	}
	items := make([]Goal, 0, len(rows))
	for _, row := range rows {
		item, err := s.goalFromRow(ctx, row, metrics[uuidFromPG(row.ID)])
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) GetGoal(ctx context.Context, userID, goalID uuid.UUID) (Goal, error) {
	row, err := s.queries.GetGoal(ctx, generated.GetGoalParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(goalID)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Goal{}, problem.New("NOT_FOUND", http.StatusNotFound, "goal not found")
	}
	if err != nil {
		return Goal{}, err
	}
	metrics, err := s.metricsForGoals(ctx, []generated.Goal{row})
	if err != nil {
		return Goal{}, err
	}
	return s.goalFromRow(ctx, row, metrics[goalID])
}

func (s *Service) SaveGoal(ctx context.Context, userID, goalID uuid.UUID, input GoalInput) (Goal, error) {
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len(input.Title) > 200 {
		return Goal{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal title must be between 1 and 200 characters")
	}
	if _, ok := map[string]struct{}{"LONG_TERM": {}, "YEAR": {}, "STAGE": {}, "MONTH": {}, "WEEK": {}, "DAY": {}}[input.Type]; !ok {
		return Goal{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal type is invalid")
	}
	if input.Status == "" {
		input.Status = "NOT_STARTED"
	}
	if _, ok := map[string]struct{}{"NOT_STARTED": {}, "IN_PROGRESS": {}, "COMPLETED": {}, "PAUSED": {}, "CANCELLED": {}}[input.Status]; !ok {
		return Goal{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal status is invalid")
	}
	if input.StartDate != nil && input.DueDate != nil && dateOnly(*input.DueDate).Before(dateOnly(*input.StartDate)) {
		return Goal{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal due date cannot be before start date")
	}
	if err := s.validateGoalParent(ctx, userID, goalID, input.ParentID); err != nil {
		return Goal{}, err
	}
	seenMetrics := make(map[string]struct{}, len(input.Metrics))
	for _, metric := range input.Metrics {
		if _, ok := metricCodes[metric.MetricCode]; !ok || metric.TargetValue < 0 || math.IsNaN(metric.TargetValue) || math.IsInf(metric.TargetValue, 0) || strings.TrimSpace(metric.Unit) == "" || len(metric.Unit) > 32 {
			return Goal{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal metric is invalid")
		}
		if _, exists := seenMetrics[metric.MetricCode]; exists {
			return Goal{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal metric codes must be unique")
		}
		seenMetrics[metric.MetricCode] = struct{}{}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Goal{}, err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if goalID == uuid.Nil {
		goalID = uuid.New()
		if _, err := queries.CreateGoal(ctx, goalParams(goalID, userID, input)); err != nil {
			return Goal{}, err
		}
	} else if _, err := queries.UpdateGoal(ctx, updateGoalParams(goalID, userID, input)); errors.Is(err, pgx.ErrNoRows) {
		return Goal{}, problem.New("NOT_FOUND", http.StatusNotFound, "goal not found")
	} else if err != nil {
		return Goal{}, err
	}
	if err := queries.DeleteGoalMetrics(ctx, auth.ToPGUUID(goalID)); err != nil {
		return Goal{}, err
	}
	for _, metric := range input.Metrics {
		if err := queries.UpsertGoalMetric(ctx, generated.UpsertGoalMetricParams{GoalID: auth.ToPGUUID(goalID), MetricCode: metric.MetricCode, TargetValue: numericValue(metric.TargetValue), Unit: strings.TrimSpace(metric.Unit)}); err != nil {
			return Goal{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Goal{}, err
	}
	return s.GetGoal(ctx, userID, goalID)
}

func (s *Service) DeleteGoal(ctx context.Context, userID, goalID uuid.UUID) error {
	return s.queries.DeleteGoal(ctx, generated.DeleteGoalParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(goalID)})
}

func (s *Service) Dashboard(ctx context.Context, userID uuid.UUID, date time.Time) (Dashboard, error) {
	date = dateOnly(date)
	weekFrom := date.AddDate(0, 0, -int((int(date.Weekday())+6)%7))
	monthFrom := time.Date(date.Year(), date.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthTo := monthFrom.AddDate(0, 1, -1)
	today, err := s.period(ctx, userID, date, date)
	if err != nil {
		return Dashboard{}, err
	}
	week, err := s.period(ctx, userID, weekFrom, date)
	if err != nil {
		return Dashboard{}, err
	}
	month, err := s.period(ctx, userID, monthFrom, monthTo)
	if err != nil {
		return Dashboard{}, err
	}
	goals, err := s.ListGoals(ctx, userID)
	if err != nil {
		return Dashboard{}, err
	}
	active := make([]Goal, 0, len(goals))
	for _, goal := range goals {
		if goal.Status != "COMPLETED" && goal.Status != "CANCELLED" {
			active = append(active, goal)
		}
		if len(active) == 5 {
			break
		}
	}
	dreamsCount, err := s.queries.CountDreams(ctx, auth.ToPGUUID(userID))
	if err != nil {
		return Dashboard{}, err
	}
	upcoming, err := s.dashboardEvents(ctx, userID, date)
	if err != nil {
		return Dashboard{}, err
	}
	var teamSummary DashboardTeamSummary
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE status='ACTIVE') FROM team_members WHERE user_id=$1`, userID).Scan(&teamSummary.TotalMembers, &teamSummary.ActiveMembers); err != nil {
		return Dashboard{}, err
	}
	var learning DashboardLearningSummary
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(minutes) FILTER (WHERE activity_type='READING'),0), COALESCE(SUM(minutes) FILTER (WHERE activity_type='AUDIO'),0) FROM learning_sessions WHERE user_id=$1 AND activity_date >= $2 AND activity_date < $3`, userID, monthFrom, monthFrom.AddDate(0, 1, 0)).Scan(&learning.ReadingMinutes, &learning.AudioMinutes); err != nil {
		return Dashboard{}, err
	}
	var incomeRaw, expenseRaw string
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount) FILTER (WHERE type='INCOME'),0)::text, COALESCE(SUM(amount) FILTER (WHERE type='EXPENSE'),0)::text FROM financial_transactions WHERE user_id=$1 AND occurred_on >= $2 AND occurred_on < $3`, userID, monthFrom, monthFrom.AddDate(0, 1, 0)).Scan(&incomeRaw, &expenseRaw); err != nil {
		return Dashboard{}, err
	}
	income, err := money.Parse(incomeRaw)
	if err != nil {
		return Dashboard{}, err
	}
	expense, err := money.Parse(expenseRaw)
	if err != nil {
		return Dashboard{}, err
	}
	return Dashboard{Date: date, Today: today, Week: week, Month: month, ActiveGoals: active, DreamsCount: dreamsCount, UpcomingEvents: upcoming, TeamSummary: teamSummary, LearningSummary: learning, FinanceSummary: DashboardFinanceSummary{Income: income, Expense: expense, NetCashFlow: income - expense}}, nil
}

func (s *Service) dashboardEvents(ctx context.Context, userID uuid.UUID, date time.Time) ([]UpcomingEvent, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,title,start_at,end_at FROM calendar_events WHERE user_id=$1 AND start_at >= $2 AND start_at < $3 ORDER BY start_at LIMIT 5`, userID, date, date.AddDate(0, 0, 7))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]UpcomingEvent, 0)
	for rows.Next() {
		var item UpcomingEvent
		if err := rows.Scan(&item.ID, &item.Title, &item.StartAt, &item.EndAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Service) period(ctx context.Context, userID uuid.UUID, from, to time.Time) (Period, error) {
	worklogs, err := s.queries.GetWorklogTotals(ctx, generated.GetWorklogTotalsParams{UserID: auth.ToPGUUID(userID), ActivityDate: toPGDate(from), ActivityDate_2: toPGDate(to)})
	if err != nil {
		return Period{}, err
	}
	turnover, err := s.queries.GetTurnoverTotals(ctx, generated.GetTurnoverTotalsParams{UserID: auth.ToPGUUID(userID), TurnoverDate: toPGDate(from), TurnoverDate_2: toPGDate(to)})
	if err != nil {
		return Period{}, err
	}
	return Period{From: dateOnly(from), To: dateOnly(to), Worklogs: WorklogTotals{OpenConversationCount: worklogs.OpenConversationCount, DeepConversationCount: worklogs.DeepConversationCount, BufferCount: worklogs.BufferCount, StoryShareCount: worklogs.StoryShareCount, ScreeningCount: worklogs.ScreeningCount, OpportunityCount: worklogs.OpportunityCount, MeetingCount: worklogs.MeetingCount, CustomerFollowupCount: worklogs.CustomerFollowupCount, ReadingMinutes: worklogs.ReadingMinutes, AudioMinutes: worklogs.AudioMinutes}, Turnover: TurnoverTotals{PV: numericFloat(turnover.Pv), NetAmount: numericMoney(turnover.NetAmount)}}, nil
}

func (s *Service) metricsForGoals(ctx context.Context, rows []generated.Goal) (map[uuid.UUID][]GoalMetric, error) {
	ids := make([]pgtype.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	metrics, err := s.queries.ListGoalMetrics(ctx, ids)
	if err != nil {
		return nil, err
	}
	result := make(map[uuid.UUID][]GoalMetric)
	for _, metric := range metrics {
		goalID := uuidFromPG(metric.GoalID)
		value := numericFloat(metric.TargetValue)
		result[goalID] = append(result[goalID], GoalMetric{MetricCode: metric.MetricCode, TargetValue: value, Unit: metric.Unit})
	}
	return result, nil
}

func (s *Service) goalFromRow(ctx context.Context, row generated.Goal, metrics []GoalMetric) (Goal, error) {
	goalID := uuidFromPG(row.ID)
	from := time.Date(1900, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(9999, 12, 31, 0, 0, 0, 0, time.UTC)
	if row.StartDate.Valid {
		from = dateOnly(row.StartDate.Time)
	}
	if row.DueDate.Valid {
		to = dateOnly(row.DueDate.Time)
	}
	worklogs, err := s.queries.GetWorklogTotals(ctx, generated.GetWorklogTotalsParams{UserID: row.UserID, ActivityDate: toPGDate(from), ActivityDate_2: toPGDate(to)})
	if err != nil {
		return Goal{}, err
	}
	turnover, err := s.queries.GetTurnoverTotals(ctx, generated.GetTurnoverTotalsParams{UserID: row.UserID, TurnoverDate: toPGDate(from), TurnoverDate_2: toPGDate(to)})
	if err != nil {
		return Goal{}, err
	}
	totals := WorklogTotals{OpenConversationCount: worklogs.OpenConversationCount, DeepConversationCount: worklogs.DeepConversationCount, BufferCount: worklogs.BufferCount, StoryShareCount: worklogs.StoryShareCount, ScreeningCount: worklogs.ScreeningCount, OpportunityCount: worklogs.OpportunityCount, MeetingCount: worklogs.MeetingCount, CustomerFollowupCount: worklogs.CustomerFollowupCount, ReadingMinutes: worklogs.ReadingMinutes, AudioMinutes: worklogs.AudioMinutes}
	turnoverTotals := TurnoverTotals{PV: numericFloat(turnover.Pv), NetAmount: numericMoney(turnover.NetAmount)}
	progress := 0.0
	if len(metrics) > 0 {
		for index := range metrics {
			metrics[index].ActualValue = metricActual(metrics[index].MetricCode, totals, turnoverTotals)
			if metrics[index].TargetValue == 0 {
				metrics[index].Progress = 1
			} else {
				metrics[index].Progress = math.Min(1, metrics[index].ActualValue/metrics[index].TargetValue)
			}
			progress += metrics[index].Progress
		}
		progress /= float64(len(metrics))
	} else if row.Status == generated.GoalStatusCOMPLETED {
		progress = 1
	}
	var parentID *uuid.UUID
	if row.ParentID.Valid {
		value := uuidFromPG(row.ParentID)
		parentID = &value
	}
	return Goal{ID: goalID, UserID: uuidFromPG(row.UserID), ParentID: parentID, Type: string(row.Type), Title: row.Title, Description: textPointer(row.Description), StartDate: datePointer(row.StartDate), DueDate: datePointer(row.DueDate), Status: string(row.Status), SortOrder: row.SortOrder, Metrics: metrics, Progress: progress, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}, nil
}

func (s *Service) dreamFromRow(ctx context.Context, row generated.Dream) (Dream, error) {
	ids, err := s.queries.ListDreamGoalIDs(ctx, row.ID)
	if err != nil {
		return Dream{}, err
	}
	goalIDs := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		goalIDs = append(goalIDs, uuidFromPG(id))
	}
	fileRows, err := s.pool.Query(ctx, `SELECT file_id FROM dream_files WHERE dream_id=$1 ORDER BY sort_order,file_id`, row.ID)
	if err != nil {
		return Dream{}, err
	}
	defer fileRows.Close()
	fileIDs := make([]uuid.UUID, 0)
	for fileRows.Next() {
		var id uuid.UUID
		if err := fileRows.Scan(&id); err != nil {
			return Dream{}, err
		}
		fileIDs = append(fileIDs, id)
	}
	if err := fileRows.Err(); err != nil {
		return Dream{}, err
	}
	return Dream{ID: uuidFromPG(row.ID), UserID: uuidFromPG(row.UserID), Title: row.Title, Description: textPointer(row.Description), GoalIDs: goalIDs, FileIDs: fileIDs, SortOrder: row.SortOrder, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}, nil
}

func (s *Service) validateGoalIDs(ctx context.Context, userID uuid.UUID, ids []uuid.UUID) error {
	seen := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		if _, exists := seen[id]; exists {
			return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal links must be unique")
		}
		seen[id] = struct{}{}
		if _, err := s.queries.GetGoal(ctx, generated.GetGoalParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(id)}); errors.Is(err, pgx.ErrNoRows) {
			return problem.New("NOT_FOUND", http.StatusNotFound, "linked goal not found")
		} else if err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateGoalParent(ctx context.Context, userID, goalID uuid.UUID, parentID *uuid.UUID) error {
	if parentID == nil {
		return nil
	}
	if *parentID == uuid.Nil || *parentID == goalID {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal parent is invalid")
	}
	current := *parentID
	visited := map[uuid.UUID]struct{}{goalID: {}}
	for current != uuid.Nil {
		if _, exists := visited[current]; exists {
			return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "goal hierarchy cannot contain a cycle")
		}
		visited[current] = struct{}{}
		row, err := s.queries.GetGoal(ctx, generated.GetGoalParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(current)})
		if errors.Is(err, pgx.ErrNoRows) {
			return problem.New("NOT_FOUND", http.StatusNotFound, "goal parent not found")
		}
		if err != nil {
			return err
		}
		if !row.ParentID.Valid {
			return nil
		}
		current = uuidFromPG(row.ParentID)
	}
	return nil
}

func goalParams(goalID, userID uuid.UUID, input GoalInput) generated.CreateGoalParams {
	return generated.CreateGoalParams{ID: auth.ToPGUUID(goalID), UserID: auth.ToPGUUID(userID), ParentID: nullablePGUUID(input.ParentID), Type: generated.GoalType(input.Type), Title: input.Title, Description: textValue(input.Description), StartDate: nullablePGDate(input.StartDate), DueDate: nullablePGDate(input.DueDate), Status: generated.GoalStatus(input.Status), SortOrder: input.SortOrder}
}

func updateGoalParams(goalID, userID uuid.UUID, input GoalInput) generated.UpdateGoalParams {
	return generated.UpdateGoalParams{UserID: auth.ToPGUUID(userID), ID: auth.ToPGUUID(goalID), ParentID: nullablePGUUID(input.ParentID), Type: generated.GoalType(input.Type), Title: input.Title, Description: textValue(input.Description), StartDate: nullablePGDate(input.StartDate), DueDate: nullablePGDate(input.DueDate), Status: generated.GoalStatus(input.Status), SortOrder: input.SortOrder}
}

func metricActual(code string, worklogs WorklogTotals, turnover TurnoverTotals) float64 {
	switch code {
	case "conversation_open_count":
		return float64(worklogs.OpenConversationCount)
	case "deep_conversation_count":
		return float64(worklogs.DeepConversationCount)
	case "buffer_count":
		return float64(worklogs.BufferCount)
	case "story_share_count":
		return float64(worklogs.StoryShareCount)
	case "screening_count":
		return float64(worklogs.ScreeningCount)
	case "opportunity_count":
		return float64(worklogs.OpportunityCount)
	case "meeting_count":
		return float64(worklogs.MeetingCount)
	case "customer_followup_count":
		return float64(worklogs.CustomerFollowupCount)
	case "reading_minutes":
		return float64(worklogs.ReadingMinutes)
	case "audio_minutes":
		return float64(worklogs.AudioMinutes)
	case "turnover_pv":
		return turnover.PV
	case "turnover_net_amount":
		return float64(turnover.NetAmount) / 100
	default:
		return 0
	}
}

func validateWorklog(input WorklogInput) error {
	values := []int32{input.OpenConversationCount, input.DeepConversationCount, input.BufferCount, input.StoryShareCount, input.ScreeningCount, input.OpportunityCount, input.MeetingCount, input.CustomerFollowupCount, input.ReadingMinutes, input.AudioMinutes}
	for _, value := range values {
		if value < 0 {
			return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "worklog counts and minutes cannot be negative")
		}
	}
	return nil
}

func normalizeTurnover(pv *float64, netAmount *money.Cents) (float64, money.Cents, error) {
	if pv == nil && netAmount == nil {
		return 0, 0, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "pv or net amount is required")
	}
	if pv != nil && (*pv < 0 || math.IsNaN(*pv) || math.IsInf(*pv, 0)) || netAmount != nil && *netAmount < 0 {
		return 0, 0, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "turnover values must be non-negative numbers")
	}
	if pv == nil {
		return pvcalc.FromNetAmount(*netAmount), *netAmount, nil
	}
	roundedPV, err := pvcalc.Round(*pv)
	if err != nil {
		return 0, 0, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "turnover values must be finite")
	}
	if netAmount != nil {
		if !pvcalc.Matches(roundedPV, *netAmount) {
			return 0, 0, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "pv and net amount do not match")
		}
		return pvcalc.FromNetAmount(*netAmount), *netAmount, nil
	}
	calculated, err := pvcalc.NetAmount(roundedPV)
	if err != nil {
		return 0, 0, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "pv and net amount do not match")
	}
	return roundedPV, calculated, nil
}

func numericValue(value float64) pgtype.Numeric {
	var result pgtype.Numeric
	_ = result.ScanScientific(strconv.FormatFloat(value, 'f', -1, 64))
	return result
}

func numericFloat(value pgtype.Numeric) float64 {
	result, err := value.Float64Value()
	if err != nil || !result.Valid {
		return 0
	}
	return result.Float64
}

func numericMoney(value pgtype.Numeric) money.Cents {
	result, err := money.FromNumeric(value)
	if err != nil {
		return 0
	}
	return result
}

func worklogFromListRow(row generated.ListWorklogsRow) (Worklog, error) {
	return Worklog{ID: uuidFromPG(row.ID), UserID: uuidFromPG(row.UserID), WorkDate: dateOnly(row.WorkDate.Time), OpenConversationCount: row.OpenConversationCount, DeepConversationCount: row.DeepConversationCount, BufferCount: row.BufferCount, StoryShareCount: row.StoryShareCount, ScreeningCount: row.ScreeningCount, OpportunityCount: row.OpportunityCount, MeetingCount: row.MeetingCount, CustomerFollowupCount: row.CustomerFollowupCount, ReadingMinutes: int(row.ReadingMinutes), AudioMinutes: int(row.AudioMinutes), TurnoverPV: optionalNumeric(row.TurnoverPv), TurnoverNetAmount: optionalMoney(row.TurnoverNetAmount), Note: textPointer(row.Note), CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}, nil
}

func worklogFromGetRow(row generated.GetWorklogRow) (Worklog, error) {
	return Worklog{ID: uuidFromPG(row.ID), UserID: uuidFromPG(row.UserID), WorkDate: dateOnly(row.WorkDate.Time), OpenConversationCount: row.OpenConversationCount, DeepConversationCount: row.DeepConversationCount, BufferCount: row.BufferCount, StoryShareCount: row.StoryShareCount, ScreeningCount: row.ScreeningCount, OpportunityCount: row.OpportunityCount, MeetingCount: row.MeetingCount, CustomerFollowupCount: row.CustomerFollowupCount, ReadingMinutes: int(row.ReadingMinutes), AudioMinutes: int(row.AudioMinutes), TurnoverPV: optionalNumeric(row.TurnoverPv), TurnoverNetAmount: optionalMoney(row.TurnoverNetAmount), Note: textPointer(row.Note), CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}, nil
}

func turnoverFromRow(row generated.DailyTurnover) (Turnover, error) {
	return Turnover{ID: uuidFromPG(row.ID), UserID: uuidFromPG(row.UserID), TurnoverDate: dateOnly(row.TurnoverDate.Time), PV: numericFloat(row.Pv), NetAmount: numericMoney(row.NetAmount), Note: textPointer(row.Note), CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}, nil
}

func optionalNumeric(value pgtype.Numeric) *float64 {
	if !value.Valid {
		return nil
	}
	result := numericFloat(value)
	return &result
}

func optionalMoney(value pgtype.Numeric) *money.Cents {
	if !value.Valid {
		return nil
	}
	result := numericMoney(value)
	return &result
}

func normalizeRange(from, to time.Time) (time.Time, time.Time) {
	if from.IsZero() {
		from = time.Now().UTC().AddDate(-1, 0, 0)
	}
	if to.IsZero() {
		to = time.Now().UTC()
	}
	return dateOnly(from), dateOnly(to)
}

func dateOnly(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func toPGDate(value time.Time) pgtype.Date {
	return pgtype.Date{Time: dateOnly(value), Valid: true}
}

func nullablePGDate(value *time.Time) pgtype.Date {
	if value == nil {
		return pgtype.Date{}
	}
	return toPGDate(*value)
}

func nullablePGUUID(value *uuid.UUID) pgtype.UUID {
	if value == nil {
		return pgtype.UUID{}
	}
	return auth.ToPGUUID(*value)
}

func textValue(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func textPointer(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}

func datePointer(value pgtype.Date) *time.Time {
	if !value.Valid {
		return nil
	}
	result := dateOnly(value.Time)
	return &result
}

func uuidFromPG(value pgtype.UUID) uuid.UUID {
	if !value.Valid {
		return uuid.Nil
	}
	return value.Bytes
}
