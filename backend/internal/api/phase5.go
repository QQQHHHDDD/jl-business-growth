package api

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/finance"
	"jl-business-growth/backend/internal/problem"
)

func (h *Handler) ListFinanceCategories(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.finance.ListCategories(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	result := make([]FinanceCategory, 0, len(items))
	for _, item := range items {
		result = append(result, financeCategoryDTO(item))
	}
	return ctx.JSON(http.StatusOK, FinanceCategoryListResponse{Data: struct {
		Items []FinanceCategory `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) CreateFinanceCategory(ctx echo.Context) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request CreateFinanceCategoryJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.finance.CreateCategory(ctx.Request().Context(), account.ID, finance.CategoryInput{Type: string(request.Type), Name: request.Name})
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusCreated, FinanceCategoryResponse{Data: financeCategoryDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) ArchiveFinanceCategory(ctx echo.Context, categoryID CategoryId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.finance.ArchiveCategory(ctx.Request().Context(), account.ID, uuid.UUID(categoryID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListFinanceTransactions(ctx echo.Context, params ListFinanceTransactionsParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	from, to := dateRange(params.From, params.To)
	items, err := h.finance.ListTransactions(ctx.Request().Context(), userID, from, to)
	if err != nil {
		return err
	}
	result := make([]FinanceTransaction, 0, len(items))
	for _, item := range items {
		result = append(result, financeTransactionDTO(item))
	}
	return ctx.JSON(http.StatusOK, FinanceTransactionListResponse{Data: struct {
		Items []FinanceTransaction `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) CreateFinanceTransaction(ctx echo.Context) error {
	return h.saveFinanceTransaction(ctx, uuid.Nil, http.StatusCreated)
}

func (h *Handler) UpdateFinanceTransaction(ctx echo.Context, transactionID TransactionId) error {
	return h.saveFinanceTransaction(ctx, uuid.UUID(transactionID), http.StatusOK)
}

func (h *Handler) saveFinanceTransaction(ctx echo.Context, id uuid.UUID, status int) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request CreateFinanceTransactionJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	source := "MANUAL"
	if request.Source != nil {
		source = string(*request.Source)
	}
	item, err := h.finance.SaveTransaction(ctx.Request().Context(), account.ID, id, finance.TransactionInput{OccurredOn: request.OccurredOn.Time, Type: string(request.Type), CategoryID: uuid.UUID(request.CategoryId), Amount: float64(request.Amount), Description: request.Description, Note: request.Note, Source: source})
	if err != nil {
		return err
	}
	return ctx.JSON(status, FinanceTransactionResponse{Data: financeTransactionDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteFinanceTransaction(ctx echo.Context, transactionID TransactionId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.finance.DeleteTransaction(ctx.Request().Context(), account.ID, uuid.UUID(transactionID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListFinanceBudgets(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.finance.ListBudgets(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	result := make([]FinanceBudget, 0, len(items))
	for _, item := range items {
		result = append(result, financeBudgetDTO(item))
	}
	return ctx.JSON(http.StatusOK, FinanceBudgetListResponse{Data: struct {
		Items []FinanceBudget `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) SaveFinanceBudget(ctx echo.Context) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request SaveFinanceBudgetJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	var categoryID *uuid.UUID
	if request.CategoryId != nil {
		value := uuid.UUID(*request.CategoryId)
		categoryID = &value
	}
	item, err := h.finance.SaveBudget(ctx.Request().Context(), account.ID, finance.BudgetInput{Month: request.Month.Time, CategoryID: categoryID, Amount: float64(request.Amount)})
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, FinanceBudgetResponse{Data: financeBudgetDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) ListFinanceSnapshots(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.finance.ListSnapshots(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	result := make([]FinanceSnapshot, 0, len(items))
	for _, item := range items {
		result = append(result, financeSnapshotDTO(item))
	}
	return ctx.JSON(http.StatusOK, FinanceSnapshotListResponse{Data: struct {
		Items []FinanceSnapshot `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) SaveFinanceSnapshot(ctx echo.Context) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request SaveFinanceSnapshotJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.finance.SaveSnapshot(ctx.Request().Context(), account.ID, finance.SnapshotInput{SnapshotDate: request.SnapshotDate.Time, Kind: string(request.Kind), Amount: float64(request.Amount), Note: request.Note})
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, FinanceSnapshotResponse{Data: financeSnapshotDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CalculateIncome(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	_ = userID
	var request CalculateIncomeJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	input := incomeInput(request)
	result, err := finance.Calculate(input)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, IncomeCalculationResponse{Data: struct {
		Input       IncomeSimulationInput  `json:"input"`
		Result      IncomeSimulationResult `json:"result"`
		RuleVersion string                 `json:"rule_version"`
	}{Input: request, Result: incomeResultDTO(result), RuleVersion: finance.RuleVersion}, RequestId: requestID(ctx)})
}

func (h *Handler) ListIncomeSimulations(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.finance.ListSimulations(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	return incomeSimulationListResponse(ctx, items)
}

func (h *Handler) CreateIncomeSimulation(ctx echo.Context) error {
	return h.saveIncomeSimulation(ctx, uuid.Nil, http.StatusCreated)
}

func (h *Handler) UpdateIncomeSimulation(ctx echo.Context, simulationID SimulationId) error {
	return h.saveIncomeSimulation(ctx, uuid.UUID(simulationID), http.StatusOK)
}

func (h *Handler) saveIncomeSimulation(ctx echo.Context, id uuid.UUID, status int) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request CreateIncomeSimulationJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.finance.SaveSimulation(ctx.Request().Context(), account.ID, id, request.Name, incomeInput(request.Input))
	if err != nil {
		return err
	}
	return ctx.JSON(status, IncomeSimulationResponse{Data: incomeSimulationDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) GetIncomeSimulation(ctx echo.Context, simulationID SimulationId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.finance.GetSimulation(ctx.Request().Context(), userID, uuid.UUID(simulationID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, IncomeSimulationResponse{Data: incomeSimulationDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DuplicateIncomeSimulation(ctx echo.Context, simulationID SimulationId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	item, err := h.finance.DuplicateSimulation(ctx.Request().Context(), account.ID, uuid.UUID(simulationID), "")
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusCreated, IncomeSimulationResponse{Data: incomeSimulationDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteIncomeSimulation(ctx echo.Context, simulationID SimulationId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.finance.DeleteSimulation(ctx.Request().Context(), account.ID, uuid.UUID(simulationID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) CompareIncomeSimulations(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	var request CompareIncomeSimulationsJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	ids := make([]uuid.UUID, 0, len(request.Ids))
	for _, id := range request.Ids {
		ids = append(ids, uuid.UUID(id))
	}
	items, err := h.finance.CompareSimulations(ctx.Request().Context(), userID, ids)
	if err != nil {
		return err
	}
	return incomeSimulationListResponse(ctx, items)
}

func incomeSimulationListResponse(ctx echo.Context, items []finance.Simulation) error {
	result := make([]IncomeSimulation, 0, len(items))
	for _, item := range items {
		result = append(result, incomeSimulationDTO(item))
	}
	return ctx.JSON(http.StatusOK, IncomeSimulationListResponse{Data: struct {
		Items []IncomeSimulation `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func financeCategoryDTO(value finance.Category) FinanceCategory {
	systemDefault := value.UserID == nil
	return FinanceCategory{Id: value.ID, Type: FinanceCategoryType(value.Type), Name: value.Name, ArchivedAt: value.ArchivedAt, SystemDefault: &systemDefault}
}

func financeTransactionDTO(value finance.Transaction) FinanceTransaction {
	return FinanceTransaction{Id: value.ID, OccurredOn: apiDate(value.OccurredOn), Type: FinanceTransactionType(value.Type), CategoryId: value.CategoryID, Amount: float32(value.Amount), Description: value.Description, Note: value.Note, Source: FinanceTransactionSource(value.Source), CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}

func financeBudgetDTO(value finance.Budget) FinanceBudget {
	return FinanceBudget{Id: value.ID, Month: apiDate(value.Month), CategoryId: uuidPtr(value.CategoryID), Amount: float32(value.Amount), CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}

func financeSnapshotDTO(value finance.Snapshot) FinanceSnapshot {
	return FinanceSnapshot{Id: value.ID, SnapshotDate: apiDate(value.SnapshotDate), Kind: FinanceSnapshotKind(value.Kind), Amount: float32(value.Amount), Note: value.Note, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}

func incomeInput(value IncomeSimulationInput) finance.Input {
	markets := make([]float64, 0, len(value.Markets))
	for _, market := range value.Markets {
		markets = append(markets, float64(market))
	}
	rank := ""
	if value.DoubleYearRank != nil {
		rank = *value.DoubleYearRank
	}
	return finance.Input{PersonalUsePV: float64(value.PersonalUsePv), CustomerPV: float64(value.CustomerPv), Markets: markets, AnnualGrowthStatus: string(value.AnnualGrowthStatus), AnnualGrowthQualifiedMonths: value.AnnualGrowthQualifiedMonths, BFIPeriodEligible: value.BfiPeriodEligible, BBIPeriodEligible: value.BbiPeriodEligible, DoubleYearMode: string(value.DoubleYearMode), DoubleYearRank: rank}
}

func incomeInputDTO(value finance.Input) IncomeSimulationInput {
	markets := make([]float32, 0, len(value.Markets))
	for _, market := range value.Markets {
		markets = append(markets, float32(market))
	}
	var rank *string
	if value.DoubleYearRank != "" {
		rank = &value.DoubleYearRank
	}
	return IncomeSimulationInput{PersonalUsePv: float32(value.PersonalUsePV), CustomerPv: float32(value.CustomerPV), Markets: markets, AnnualGrowthStatus: IncomeSimulationInputAnnualGrowthStatus(value.AnnualGrowthStatus), AnnualGrowthQualifiedMonths: value.AnnualGrowthQualifiedMonths, BfiPeriodEligible: value.BFIPeriodEligible, BbiPeriodEligible: value.BBIPeriodEligible, DoubleYearMode: IncomeSimulationInputDoubleYearMode(value.DoubleYearMode), DoubleYearRank: rank}
}

func incomeResultDTO(value finance.Result) IncomeSimulationResult {
	return IncomeSimulationResult{PersonalSalesBonus: float32(value.PersonalSalesBonus), Coupon6Percent: float32(value.Coupon6Percent), DifferentialBonus: float32(value.DifferentialBonus), MonthlyMarketingStarBonus: float32(value.MonthlyMarketingStarBonus), AnnualGrowthBonus: float32(value.AnnualGrowthBonus), RubyBonus: float32(value.RubyBonus), BfiBonus: float32(value.BFIBonus), BbiBonus: float32(value.BBIBonus), ExcelTotalIncome: float32(value.ExcelTotalIncome), DoubleYearBonus: float32(value.DoubleYearBonus), MonthlyIncome: float32(value.MonthlyIncome), AnnualOrOneTimeIncome: float32(value.AnnualOrOneTimeIncome), CombinedIncome: float32(value.CombinedIncome)}
}

func incomeSimulationDTO(value finance.Simulation) IncomeSimulation {
	return IncomeSimulation{Id: value.ID, Name: value.Name, RuleVersion: value.RuleVersion, Input: incomeInputDTO(value.Input), Result: incomeResultDTO(value.Result), CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
