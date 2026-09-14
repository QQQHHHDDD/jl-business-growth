package finance

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/problem"
)

const RuleVersion = "income-v1-excel-compatible"
const PVToNetAmountRate = 12.5

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

type Category struct {
	ID         uuid.UUID
	UserID     *uuid.UUID
	Type, Name string
	ArchivedAt *time.Time
}
type CategoryInput struct{ Type, Name string }
type Transaction struct {
	ID, UserID, CategoryID uuid.UUID
	OccurredOn             time.Time
	Type                   string
	Amount                 float64
	Description, Note      *string
	Source                 string
	CreatedAt, UpdatedAt   time.Time
}
type TransactionInput struct {
	OccurredOn        time.Time
	Type              string
	CategoryID        uuid.UUID
	Amount            float64
	Description, Note *string
	Source            string
}
type Budget struct {
	ID, UserID           uuid.UUID
	Month                time.Time
	CategoryID           *uuid.UUID
	Amount               float64
	CreatedAt, UpdatedAt time.Time
}
type BudgetInput struct {
	Month      time.Time
	CategoryID *uuid.UUID
	Amount     float64
}
type Snapshot struct {
	ID, UserID           uuid.UUID
	SnapshotDate         time.Time
	Kind                 string
	Amount               float64
	Note                 *string
	CreatedAt, UpdatedAt time.Time
}
type SnapshotInput struct {
	SnapshotDate time.Time
	Kind         string
	Amount       float64
	Note         *string
}

type Input struct {
	PersonalUsePV               float64   `json:"personal_use_pv"`
	CustomerPV                  float64   `json:"customer_pv"`
	Markets                     []float64 `json:"markets"`
	AnnualGrowthStatus          string    `json:"annual_growth_status"`
	AnnualGrowthQualifiedMonths int       `json:"annual_growth_qualified_months"`
	BFIPeriodEligible           bool      `json:"bfi_period_eligible"`
	BBIPeriodEligible           bool      `json:"bbi_period_eligible"`
	DoubleYearMode              string    `json:"double_year_mode"`
	DoubleYearRank              string    `json:"double_year_rank,omitempty"`
}

type Result struct {
	PersonalSalesBonus        float64 `json:"personal_sales_bonus"`
	Coupon6Percent            float64 `json:"coupon_6_percent"`
	DifferentialBonus         float64 `json:"differential_bonus"`
	MonthlyMarketingStarBonus float64 `json:"monthly_marketing_star_bonus"`
	AnnualGrowthBonus         float64 `json:"annual_growth_bonus"`
	RubyBonus                 float64 `json:"ruby_bonus"`
	BFIBonus                  float64 `json:"bfi_bonus"`
	BBIBonus                  float64 `json:"bbi_bonus"`
	ExcelTotalIncome          float64 `json:"excel_total_income"`
	DoubleYearBonus           float64 `json:"double_year_bonus"`
	MonthlyIncome             float64 `json:"monthly_income"`
	AnnualOrOneTimeIncome     float64 `json:"annual_or_one_time_income"`
	CombinedIncome            float64 `json:"combined_income"`
}

type Simulation struct {
	ID, UserID           uuid.UUID
	Name, RuleVersion    string
	Input                Input
	Result               Result
	CreatedAt, UpdatedAt time.Time
}

func Calculate(input Input) (Result, error) {
	if len(input.Markets) != 12 {
		return Result{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "exactly 12 markets are required")
	}
	if input.PersonalUsePV < 0 || input.CustomerPV < 0 {
		return Result{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "PV values must be non-negative")
	}
	for _, value := range input.Markets {
		if value < 0 {
			return Result{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "PV values must be non-negative")
		}
	}
	if input.AnnualGrowthQualifiedMonths < 0 || input.AnnualGrowthQualifiedMonths > 12 {
		return Result{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "qualified months must be between 0 and 12")
	}
	if input.AnnualGrowthStatus == "" {
		input.AnnualGrowthStatus = "NOT_QUALIFIED"
	}
	if input.AnnualGrowthStatus != "KEEP" && input.AnnualGrowthStatus != "GROWTH" && input.AnnualGrowthStatus != "NOT_QUALIFIED" {
		return Result{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "annual growth status is invalid")
	}
	if input.DoubleYearMode == "" {
		input.DoubleYearMode = "NONE"
	}
	if input.DoubleYearMode != "NONE" && input.DoubleYearMode != "FIRST" && input.DoubleYearMode != "REPEAT" {
		return Result{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "double year mode is invalid")
	}
	if input.DoubleYearMode != "NONE" && !validDoubleYearRank(input.DoubleYearRank) {
		return Result{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "double year rank is invalid")
	}
	e9 := input.PersonalUsePV + input.CustomerPV
	nonHighTotal := 0.0
	marketTotal := 0.0
	for _, value := range input.Markets {
		marketTotal += value
		if value < 10000 {
			nonHighTotal += value
		}
	}
	e10 := e9 + nonHighTotal
	rate := globalRate(e10, marketTotal)
	personalSales := rate * (e9 * PVToNetAmountRate)
	coupon := 0.0
	if e9 > 100 {
		coupon = e9 * PVToNetAmountRate * .06
	}
	marketRates := make([]float64, 12)
	for i, value := range input.Markets {
		marketRates[i] = marketRate(value, i)
	}
	differential := 0.0
	for i, value := range input.Markets {
		net := value * PVToNetAmountRate
		if value < 10000 {
			differential += net * (rate - marketRates[i])
			continue
		}
		otherNonHigh := nonHighTotal
		if input.Markets[i] < 10000 {
			otherNonHigh -= input.Markets[i]
		}
		if 10000-e9-nonHighTotal < 0 {
			differential += net * .06
		} else {
			differential += otherNonHigh * PVToNetAmountRate * .06
		}
	}
	star := 0.0
	if rate >= .21 {
		if e10 >= 10000 {
			star = e10 * PVToNetAmountRate * .0145
		} else if e10 >= 8000 {
			star = e10 * PVToNetAmountRate * .0135
		} else if e10 >= 6000 {
			star = e10 * PVToNetAmountRate * .013
		}
		if star > 3000 {
			star = 3000
		}
	}
	ruby := 0.0
	if e10 >= 20000 {
		ruby = e10 * PVToNetAmountRate * .02
	}
	bfi := 0.0
	if input.Markets[0] >= 200 && input.Markets[1] >= 200 && input.Markets[2] >= 200 && input.BFIPeriodEligible && e10 >= 1000 {
		bfi = (personalSales + differential) * .3
	}
	bbi := 0.0
	if input.Markets[0] >= 300 && input.Markets[1] >= 300 && input.Markets[2] >= 300 && input.BBIPeriodEligible && e10 >= 2500 {
		bbi = (personalSales + differential + star + ruby) * .4
	}
	annual := 0.0
	if input.AnnualGrowthQualifiedMonths == 12 {
		annual = (personalSales + ruby + differential) * .35
		for i, value := range input.Markets {
			if value >= 10000 {
				annual += differentialForMarket(input, i) * .1
			}
		}
	} else if input.AnnualGrowthStatus == "GROWTH" {
		annual = (personalSales + ruby + differential) * .35
	} else if input.AnnualGrowthStatus == "KEEP" {
		annual = (personalSales + ruby + differential) * .3
	}
	doubleYear := doubleYearBonus(input.DoubleYearMode, input.DoubleYearRank)
	result := Result{PersonalSalesBonus: personalSales, Coupon6Percent: coupon, DifferentialBonus: differential, MonthlyMarketingStarBonus: star, AnnualGrowthBonus: annual, RubyBonus: ruby, BFIBonus: bfi, BBIBonus: bbi, DoubleYearBonus: doubleYear}
	result.ExcelTotalIncome = personalSales + coupon + differential + star + annual + ruby + bfi + bbi
	result.MonthlyIncome = personalSales + coupon + differential + star + ruby + bfi + bbi
	result.AnnualOrOneTimeIncome = annual + doubleYear
	result.CombinedIncome = result.MonthlyIncome + result.AnnualOrOneTimeIncome
	return roundResult(result), nil
}

func globalRate(e10, marketTotal float64) float64 {
	if marketTotal >= 10000 {
		return .21
	}
	switch {
	case e10 >= 10000:
		return .21
	case e10 >= 7000:
		return .18
	case e10 >= 4000:
		return .15
	case e10 >= 2000:
		return .12
	case e10 >= 1000:
		return .09
	case e10 >= 600:
		return .06
	case e10 >= 200:
		return .03
	default:
		return 0
	}
}
func marketRate(value float64, index int) float64 {
	threshold := 200.0
	if index == 1 || index == 2 {
		threshold = 100
	}
	switch {
	case value >= 10000:
		return .21
	case value >= 7000:
		return .18
	case value >= 4000:
		return .15
	case value >= 2000:
		return .12
	case value >= 1000:
		return .09
	case value >= 600:
		return .06
	case value >= threshold:
		return .03
	default:
		return 0
	}
}
func differentialForMarket(input Input, index int) float64 {
	value := input.Markets[index]
	if value < 10000 {
		return value * PVToNetAmountRate * (globalRate(input.PersonalUsePV+input.CustomerPV+sumNonHigh(input.Markets), sum(input.Markets)) - marketRate(value, index))
	}
	nonHigh := sumNonHigh(input.Markets)
	if 10000-input.PersonalUsePV-input.CustomerPV-nonHigh < 0 {
		return value * PVToNetAmountRate * .06
	}
	return (nonHigh - nonHighAt(input.Markets, index)) * PVToNetAmountRate * .06
}
func sum(values []float64) float64 {
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total
}
func sumNonHigh(values []float64) float64 {
	total := 0.0
	for _, value := range values {
		if value < 10000 {
			total += value
		}
	}
	return total
}
func nonHighAt(values []float64, index int) float64 {
	if values[index] < 10000 {
		return values[index]
	}
	return 0
}
func doubleYearBonus(mode, rank string) float64 {
	if mode == "NONE" {
		return 0
	}
	values := map[string]float64{"高级营销主任": 12500, "创办人高级营销主任": 25000, "助理营销经理": 33500, "创办人助理营销经理": 50000, "营销经理": 67000, "创办人营销经理": 83500, "高级营销经理": 104500, "创办人高级营销经理": 125000}
	return values[rank]
}
func validDoubleYearRank(rank string) bool {
	switch rank {
	case "高级营销主任", "创办人高级营销主任", "助理营销经理", "创办人助理营销经理", "营销经理", "创办人营销经理", "高级营销经理", "创办人高级营销经理":
		return true
	default:
		return false
	}
}
func round(value float64) float64 { return math.Round(value*100) / 100 }
func roundResult(value Result) Result {
	value.PersonalSalesBonus = round(value.PersonalSalesBonus)
	value.Coupon6Percent = round(value.Coupon6Percent)
	value.DifferentialBonus = round(value.DifferentialBonus)
	value.MonthlyMarketingStarBonus = round(value.MonthlyMarketingStarBonus)
	value.AnnualGrowthBonus = round(value.AnnualGrowthBonus)
	value.RubyBonus = round(value.RubyBonus)
	value.BFIBonus = round(value.BFIBonus)
	value.BBIBonus = round(value.BBIBonus)
	value.DoubleYearBonus = round(value.DoubleYearBonus)
	value.ExcelTotalIncome = round(value.PersonalSalesBonus + value.Coupon6Percent + value.DifferentialBonus + value.MonthlyMarketingStarBonus + value.AnnualGrowthBonus + value.RubyBonus + value.BFIBonus + value.BBIBonus)
	value.MonthlyIncome = round(value.PersonalSalesBonus + value.Coupon6Percent + value.DifferentialBonus + value.MonthlyMarketingStarBonus + value.RubyBonus + value.BFIBonus + value.BBIBonus)
	value.AnnualOrOneTimeIncome = round(value.AnnualGrowthBonus + value.DoubleYearBonus)
	value.CombinedIncome = round(value.MonthlyIncome + value.AnnualOrOneTimeIncome)
	return value
}

func (s *Service) ListCategories(ctx context.Context, userID uuid.UUID) ([]Category, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,type,name,archived_at FROM finance_categories WHERE user_id=$1 OR user_id IS NULL ORDER BY user_id NULLS FIRST,type,name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Category, 0)
	for rows.Next() {
		var item Category
		if err := rows.Scan(&item.ID, &item.UserID, &item.Type, &item.Name, &item.ArchivedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) CreateCategory(ctx context.Context, userID uuid.UUID, input CategoryInput) (Category, error) {
	if input.Type != "INCOME" && input.Type != "EXPENSE" {
		return Category{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "category type is invalid")
	}
	if strings.TrimSpace(input.Name) == "" {
		return Category{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "category name is required")
	}
	var item Category
	err := s.pool.QueryRow(ctx, `INSERT INTO finance_categories (id,user_id,type,name) VALUES ($1,$2,$3,$4) RETURNING id,user_id,type,name,archived_at`, uuid.New(), userID, input.Type, strings.TrimSpace(input.Name)).Scan(&item.ID, &item.UserID, &item.Type, &item.Name, &item.ArchivedAt)
	return item, err
}
func (s *Service) ArchiveCategory(ctx context.Context, userID, id uuid.UUID) error {
	r, err := s.pool.Exec(ctx, `UPDATE finance_categories SET archived_at=now() WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if r.RowsAffected() != 1 {
		return problem.New("NOT_FOUND", http.StatusNotFound, "finance category not found")
	}
	return nil
}

func (s *Service) ListTransactions(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]Transaction, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,occurred_on,type,category_id,amount,description,note,source,created_at,updated_at FROM financial_transactions WHERE user_id=$1 AND occurred_on BETWEEN $2 AND $3 ORDER BY occurred_on DESC,created_at DESC`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Transaction, 0)
	for rows.Next() {
		var item Transaction
		if err := rows.Scan(&item.ID, &item.UserID, &item.OccurredOn, &item.Type, &item.CategoryID, &item.Amount, &item.Description, &item.Note, &item.Source, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) SaveTransaction(ctx context.Context, userID, id uuid.UUID, input TransactionInput) (Transaction, error) {
	if input.Amount < 0 {
		return Transaction{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "amount must be non-negative")
	}
	if input.Type != "INCOME" && input.Type != "EXPENSE" {
		return Transaction{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "transaction type is invalid")
	}
	var valid bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM finance_categories WHERE id=$1 AND (user_id=$2 OR user_id IS NULL) AND type=$3 AND archived_at IS NULL)`, input.CategoryID, userID, input.Type).Scan(&valid); err != nil {
		return Transaction{}, err
	}
	if !valid {
		return Transaction{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "category is invalid for this transaction")
	}
	if input.Source == "" {
		input.Source = "MANUAL"
	}
	if input.Source != "MANUAL" && input.Source != "IMPORT" {
		return Transaction{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "transaction source is invalid")
	}
	if id == uuid.Nil {
		id = uuid.New()
	}
	var item Transaction
	r, err := s.pool.Exec(ctx, `INSERT INTO financial_transactions (id,user_id,occurred_on,type,category_id,amount,description,note,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET occurred_on=EXCLUDED.occurred_on,type=EXCLUDED.type,category_id=EXCLUDED.category_id,amount=EXCLUDED.amount,description=EXCLUDED.description,note=EXCLUDED.note,source=EXCLUDED.source,updated_at=now() WHERE financial_transactions.user_id=$2`, id, userID, input.OccurredOn, input.Type, input.CategoryID, input.Amount, input.Description, input.Note, input.Source)
	if err != nil {
		return Transaction{}, err
	}
	if r.RowsAffected() != 1 {
		return Transaction{}, problem.New("NOT_FOUND", http.StatusNotFound, "financial transaction not found")
	}
	err = s.pool.QueryRow(ctx, `SELECT id,user_id,occurred_on,type,category_id,amount,description,note,source,created_at,updated_at FROM financial_transactions WHERE id=$1 AND user_id=$2`, id, userID).Scan(&item.ID, &item.UserID, &item.OccurredOn, &item.Type, &item.CategoryID, &item.Amount, &item.Description, &item.Note, &item.Source, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
func (s *Service) DeleteTransaction(ctx context.Context, userID, id uuid.UUID) error {
	r, err := s.pool.Exec(ctx, `DELETE FROM financial_transactions WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if r.RowsAffected() != 1 {
		return problem.New("NOT_FOUND", http.StatusNotFound, "financial transaction not found")
	}
	return nil
}

func (s *Service) ListBudgets(ctx context.Context, userID uuid.UUID) ([]Budget, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,month,category_id,amount,created_at,updated_at FROM budgets WHERE user_id=$1 ORDER BY month DESC,category_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Budget, 0)
	for rows.Next() {
		var item Budget
		if err := rows.Scan(&item.ID, &item.UserID, &item.Month, &item.CategoryID, &item.Amount, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) SaveBudget(ctx context.Context, userID uuid.UUID, input BudgetInput) (Budget, error) {
	if input.Amount < 0 {
		return Budget{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "budget amount must be non-negative")
	}
	if input.CategoryID != nil {
		var valid bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM finance_categories WHERE id=$1 AND (user_id=$2 OR user_id IS NULL) AND archived_at IS NULL)`, *input.CategoryID, userID).Scan(&valid); err != nil {
			return Budget{}, err
		}
		if !valid {
			return Budget{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "budget category is invalid")
		}
	}
	var item Budget
	month := time.Date(input.Month.Year(), input.Month.Month(), 1, 0, 0, 0, 0, time.UTC)
	var err error
	if input.CategoryID == nil {
		err = s.pool.QueryRow(ctx, `INSERT INTO budgets (id,user_id,month,category_id,amount) VALUES ($1,$2,$3,NULL,$4) ON CONFLICT (user_id,month) WHERE category_id IS NULL DO UPDATE SET amount=EXCLUDED.amount,updated_at=now() RETURNING id,user_id,month,category_id,amount,created_at,updated_at`, uuid.New(), userID, month, input.Amount).Scan(&item.ID, &item.UserID, &item.Month, &item.CategoryID, &item.Amount, &item.CreatedAt, &item.UpdatedAt)
	} else {
		err = s.pool.QueryRow(ctx, `INSERT INTO budgets (id,user_id,month,category_id,amount) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,month,category_id) DO UPDATE SET amount=EXCLUDED.amount,updated_at=now() RETURNING id,user_id,month,category_id,amount,created_at,updated_at`, uuid.New(), userID, month, input.CategoryID, input.Amount).Scan(&item.ID, &item.UserID, &item.Month, &item.CategoryID, &item.Amount, &item.CreatedAt, &item.UpdatedAt)
	}
	return item, err
}
func (s *Service) ListSnapshots(ctx context.Context, userID uuid.UUID) ([]Snapshot, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,snapshot_date,kind,amount,note,created_at,updated_at FROM financial_snapshots WHERE user_id=$1 ORDER BY snapshot_date DESC,kind`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Snapshot, 0)
	for rows.Next() {
		var item Snapshot
		if err := rows.Scan(&item.ID, &item.UserID, &item.SnapshotDate, &item.Kind, &item.Amount, &item.Note, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) SaveSnapshot(ctx context.Context, userID uuid.UUID, input SnapshotInput) (Snapshot, error) {
	if input.Amount < 0 {
		return Snapshot{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "snapshot amount must be non-negative")
	}
	if input.Kind != "SAVINGS" && input.Kind != "EMERGENCY_FUND" {
		return Snapshot{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "snapshot kind is invalid")
	}
	var item Snapshot
	err := s.pool.QueryRow(ctx, `INSERT INTO financial_snapshots (id,user_id,snapshot_date,kind,amount,note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,snapshot_date,kind) DO UPDATE SET amount=EXCLUDED.amount,note=EXCLUDED.note,updated_at=now() RETURNING id,user_id,snapshot_date,kind,amount,note,created_at,updated_at`, uuid.New(), userID, input.SnapshotDate, input.Kind, input.Amount, input.Note).Scan(&item.ID, &item.UserID, &item.SnapshotDate, &item.Kind, &item.Amount, &item.Note, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (s *Service) ListSimulations(ctx context.Context, userID uuid.UUID) ([]Simulation, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,name,rule_version,input_snapshot,result_snapshot,created_at,updated_at FROM income_simulations WHERE user_id=$1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Simulation, 0)
	for rows.Next() {
		item, err := scanSimulation(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) GetSimulation(ctx context.Context, userID, id uuid.UUID) (Simulation, error) {
	item, err := scanSimulation(s.pool.QueryRow(ctx, `SELECT id,user_id,name,rule_version,input_snapshot,result_snapshot,created_at,updated_at FROM income_simulations WHERE user_id=$1 AND id=$2`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Simulation{}, problem.New("NOT_FOUND", http.StatusNotFound, "income simulation not found")
	}
	return item, err
}
func (s *Service) SaveSimulation(ctx context.Context, userID, id uuid.UUID, name string, input Input) (Simulation, error) {
	if strings.TrimSpace(name) == "" {
		return Simulation{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "simulation name is required")
	}
	result, err := Calculate(input)
	if err != nil {
		return Simulation{}, err
	}
	inputJSON, _ := json.Marshal(input)
	resultJSON, _ := json.Marshal(result)
	if id == uuid.Nil {
		id = uuid.New()
	}
	tag, err := s.pool.Exec(ctx, `INSERT INTO income_simulations (id,user_id,name,rule_version,input_snapshot,result_snapshot) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,rule_version=EXCLUDED.rule_version,input_snapshot=EXCLUDED.input_snapshot,result_snapshot=EXCLUDED.result_snapshot,updated_at=now() WHERE income_simulations.user_id=$2`, id, userID, strings.TrimSpace(name), RuleVersion, inputJSON, resultJSON)
	if err != nil {
		return Simulation{}, err
	}
	if tag.RowsAffected() != 1 {
		return Simulation{}, problem.New("NOT_FOUND", http.StatusNotFound, "income simulation not found")
	}
	return s.GetSimulation(ctx, userID, id)
}
func (s *Service) DuplicateSimulation(ctx context.Context, userID, id uuid.UUID, name string) (Simulation, error) {
	item, err := s.GetSimulation(ctx, userID, id)
	if err != nil {
		return Simulation{}, err
	}
	if strings.TrimSpace(name) == "" {
		name = item.Name + " 副本"
	}
	return s.SaveSimulation(ctx, userID, uuid.Nil, name, item.Input)
}
func (s *Service) DeleteSimulation(ctx context.Context, userID, id uuid.UUID) error {
	r, err := s.pool.Exec(ctx, `DELETE FROM income_simulations WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if r.RowsAffected() != 1 {
		return problem.New("NOT_FOUND", http.StatusNotFound, "income simulation not found")
	}
	return nil
}
func (s *Service) CompareSimulations(ctx context.Context, userID uuid.UUID, ids []uuid.UUID) ([]Simulation, error) {
	if len(ids) == 0 {
		return []Simulation{}, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,name,rule_version,input_snapshot,result_snapshot,created_at,updated_at FROM income_simulations WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY updated_at DESC`, userID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Simulation, 0)
	for rows.Next() {
		item, err := scanSimulation(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func scanSimulation(row interface{ Scan(...any) error }) (Simulation, error) {
	var item Simulation
	var inputJSON, resultJSON []byte
	err := row.Scan(&item.ID, &item.UserID, &item.Name, &item.RuleVersion, &inputJSON, &resultJSON, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return item, err
	}
	if err := json.Unmarshal(inputJSON, &item.Input); err != nil {
		return item, err
	}
	if err := json.Unmarshal(resultJSON, &item.Result); err != nil {
		return item, err
	}
	return item, nil
}
