package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/admin"
	"jl-business-growth/backend/internal/analytics"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/calendar"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/daily"
	fileassets "jl-business-growth/backend/internal/files"
	"jl-business-growth/backend/internal/finance"
	"jl-business-growth/backend/internal/importexport"
	"jl-business-growth/backend/internal/invitation"
	"jl-business-growth/backend/internal/knowledge"
	"jl-business-growth/backend/internal/mail"
	"jl-business-growth/backend/internal/money"
	"jl-business-growth/backend/internal/problem"
	"jl-business-growth/backend/internal/reviews"
	"jl-business-growth/backend/internal/search"
	"jl-business-growth/backend/internal/team"
)

type Handler struct {
	auth       *auth.Service
	admin      *admin.Service
	invitation *invitation.Service
	daily      *daily.Service
	calendar   *calendar.Service
	reviews    *reviews.Service
	analytics  *analytics.Service
	team       *team.Service
	knowledge  *knowledge.Service
	files      *fileassets.Service
	search     *search.Service
	finance    *finance.Service
	imports    *importexport.Service
	config     config.Config
}

func NewHandler(authService *auth.Service, adminService *admin.Service, invitationService *invitation.Service, cfg config.Config) *Handler {
	pool := authService.Pool()
	return &Handler{auth: authService, admin: adminService, invitation: invitationService, daily: daily.NewService(pool), calendar: calendar.NewService(pool, mail.NewSender(cfg)), reviews: reviews.NewService(pool), analytics: analytics.NewService(pool), team: team.NewService(pool), knowledge: knowledge.NewService(pool), files: fileassets.NewService(pool, cfg), search: search.NewService(pool), finance: finance.NewService(pool), imports: importexport.NewService(pool, cfg), config: cfg}
}

func (h *Handler) PostAuthRegister(ctx echo.Context) error {
	var request PostAuthRegisterJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	account, err := h.auth.Register(ctx.Request().Context(), request.Username, request.Password, request.InvitationCode)
	if err != nil {
		h.audit(ctx, "register_failed", uuid.Nil, uuid.Nil, uuid.Nil)
		return err
	}
	h.audit(ctx, "register_success", uuid.Nil, account.ID, uuid.Nil)
	_, csrfToken, session, err := auth.CreateSession(ctx, h.auth.Pool(), h.config, account.ID, account.Role == auth.RoleUser)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusCreated, h.authResponse(ctx, account, session, csrfToken))
}

func (h *Handler) PostAuthLogin(ctx echo.Context) error {
	var request PostAuthLoginJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	account, err := h.auth.Authenticate(ctx.Request().Context(), request.Username, request.Password)
	if err != nil {
		h.audit(ctx, "login_failed", uuid.Nil, uuid.Nil, uuid.Nil)
		return err
	}
	h.audit(ctx, "login_success", account.ID, account.ID, uuid.Nil)
	_, csrfToken, session, err := auth.CreateSession(ctx, h.auth.Pool(), h.config, account.ID, account.Role == auth.RoleUser)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, h.authResponse(ctx, account, session, csrfToken))
}

func (h *Handler) PostAuthLogout(ctx echo.Context) error {
	session, _, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	auth.DestroySession(ctx, h.auth.Pool(), h.config)
	h.audit(ctx, "logout", accountIDFromSession(session), uuid.Nil, uuid.Nil)
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) GetAuthCsrf(ctx echo.Context) error {
	_, _, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	token := auth.CSRFTokenFromContext(ctx)
	if token == "" {
		return problem.New("FORBIDDEN", http.StatusForbidden, "CSRF token is unavailable")
	}
	return ctx.JSON(http.StatusOK, CsrfResponse{Data: CsrfData{CsrfToken: token}, RequestId: requestID(ctx)})
}

func (h *Handler) GetAuthMe(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, h.authResponse(ctx, *account, session, auth.CSRFTokenFromContext(ctx)))
}

func (h *Handler) PostAuthChangePassword(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request PostAuthChangePasswordJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	if err := h.auth.ChangePassword(ctx.Request().Context(), *account, request.CurrentPassword, request.NewPassword); err != nil {
		return err
	}
	h.audit(ctx, "password_changed", account.ID, account.ID, uuid.Nil)
	auth.DestroySession(ctx, h.auth.Pool(), h.config)
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) PatchAuthTimezone(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request PatchAuthTimezoneJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	updated, err := h.auth.UpdateTimezone(ctx.Request().Context(), account.ID, request.Timezone)
	if err != nil {
		return err
	}
	h.audit(ctx, "timezone_changed", account.ID, account.ID, uuid.Nil)
	return ctx.JSON(http.StatusOK, AccountResponse{Data: h.accountDTO(updated), RequestId: requestID(ctx)})
}

func (h *Handler) GetAuthAccounts(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	return h.accountsResponse(ctx, session, *account)
}

func (h *Handler) PostAuthAccountsAdd(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request PostAuthAccountsAddJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	linkedAccount, err := h.auth.Authenticate(ctx.Request().Context(), request.Username, request.Password)
	if err != nil {
		return err
	}
	if linkedAccount.Role != auth.RoleUser {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only normal users can be linked")
	}
	if err := h.auth.LinkBrowserAccount(ctx.Request().Context(), session.ID, linkedAccount.ID); err != nil {
		return err
	}
	h.audit(ctx, "browser_account_added", account.ID, linkedAccount.ID, uuid.Nil)
	updatedSession, activeAccount, err := auth.LoadSession(ctx, h.auth.Pool(), h.config)
	if err != nil {
		return err
	}
	return h.accountsResponse(ctx, updatedSession, *activeAccount)
}

func (h *Handler) PostAuthAccountsSwitch(ctx echo.Context, accountID AccountId) error {
	session, currentAccount, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*currentAccount); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if _, err := h.auth.Queries().SetActiveAccount(ctx.Request().Context(), generatedActivePair(session.ID, accountID)); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return problem.New("FORBIDDEN", http.StatusForbidden, "account is not linked to this browser session")
		}
		return err
	}
	h.audit(ctx, "browser_account_switched", currentAccount.ID, accountID, uuid.Nil)
	updatedSession, account, err := auth.LoadSession(ctx, h.auth.Pool(), h.config)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, h.authResponse(ctx, *account, updatedSession, auth.CSRFTokenFromContext(ctx)))
}

func (h *Handler) DeleteAuthAccount(ctx echo.Context, accountID AccountId) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if account.ID == accountID {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "active account cannot be removed")
	}
	if _, err := h.auth.Queries().DeleteBrowserSessionAccount(ctx.Request().Context(), generatedDeletePair(session.ID, accountID)); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return problem.New("NOT_FOUND", http.StatusNotFound, "linked account not found")
		}
		return err
	}
	h.audit(ctx, "browser_account_removed", account.ID, accountID, uuid.Nil)
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) GetAdminUsers(ctx echo.Context, params GetAdminUsersParams) error {
	_, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireAdmin(*account); err != nil {
		return err
	}
	page, pageSize := 1, 20
	if params.Page != nil {
		page = *params.Page
	}
	if params.PageSize != nil {
		pageSize = *params.PageSize
	}
	items, total, err := h.admin.ListUsers(ctx.Request().Context(), page, pageSize)
	if err != nil {
		return err
	}
	result := make([]Account, 0, len(items))
	for _, item := range items {
		result = append(result, h.accountDTO(item))
	}
	return ctx.JSON(http.StatusOK, AccountsListResponse{Data: AccountsListData{Items: result}, Meta: PaginationMeta{Page: page, PageSize: pageSize, Total: int(total)}, RequestId: requestID(ctx)})
}

func (h *Handler) PatchAdminUserStatus(ctx echo.Context, accountID AccountId) error {
	return h.changeAccountStatus(ctx, accountID, false)
}

func (h *Handler) PatchAdminAdmin(ctx echo.Context, accountID AccountId) error {
	return h.changeAccountStatus(ctx, accountID, true)
}

func (h *Handler) changeAccountStatus(ctx echo.Context, accountID AccountId, administrator bool) error {
	session, actor, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireAdmin(*actor); err != nil {
		return err
	} else if administrator {
		if err := requireSuperAdmin(*actor); err != nil {
			return err
		}
	}
	var request StatusRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	status := auth.AccountStatus(request.Status)
	var account auth.Account
	if administrator {
		account, err = h.admin.SetAdminStatus(ctx.Request().Context(), accountID, status)
	} else {
		account, err = h.admin.SetUserStatus(ctx.Request().Context(), accountID, status)
	}
	if err != nil {
		return err
	}
	action := "user_status_changed"
	if administrator {
		action = "admin_status_changed"
	}
	h.audit(ctx, action, actor.ID, account.ID, uuid.Nil)
	return ctx.JSON(http.StatusOK, AccountResponse{Data: h.accountDTO(account), RequestId: requestID(ctx)})
}

func (h *Handler) PostAdminUserResetPassword(ctx echo.Context, accountID AccountId) error {
	return h.resetAccountPassword(ctx, accountID, false)
}

func (h *Handler) PostAdminAdminResetPassword(ctx echo.Context, accountID AccountId) error {
	return h.resetAccountPassword(ctx, accountID, true)
}

func (h *Handler) resetAccountPassword(ctx echo.Context, accountID AccountId, administrator bool) error {
	session, actor, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireAdmin(*actor); err != nil {
		return err
	}
	target, targetErr := h.admin.Account(ctx.Request().Context(), accountID)
	if targetErr != nil {
		return targetErr
	}
	if administrator && target.Role != auth.RoleAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only ordinary administrators can be changed here")
	}
	if !administrator && target.Role != auth.RoleUser {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only normal users can be changed here")
	}
	if target.Role == auth.RoleAdmin && actor.Role != auth.RoleSuperAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only the super administrator can manage administrators")
	}
	var request ResetPasswordRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	temporaryPassword, err := h.admin.ResetPassword(ctx.Request().Context(), accountID, request.TemporaryPassword)
	if err != nil {
		return err
	}
	h.audit(ctx, "password_reset", actor.ID, accountID, uuid.Nil)
	return ctx.JSON(http.StatusOK, ResetPasswordResponse{Data: ResetPasswordData{TemporaryPassword: temporaryPassword}, RequestId: requestID(ctx)})
}

func (h *Handler) DeleteAdminUser(ctx echo.Context, accountID AccountId) error {
	return h.deleteAccount(ctx, accountID, false)
}

func (h *Handler) DeleteAdminAdmin(ctx echo.Context, accountID AccountId) error {
	return h.deleteAccount(ctx, accountID, true)
}

func (h *Handler) deleteAccount(ctx echo.Context, accountID AccountId, administrator bool) error {
	session, actor, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireAdmin(*actor); err != nil {
		return err
	}
	if administrator && actor.Role != auth.RoleSuperAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only the super administrator can manage administrators")
	}
	target, err := h.admin.Account(ctx.Request().Context(), accountID)
	if err != nil {
		return err
	}
	if administrator && target.Role != auth.RoleAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only ordinary administrators can be deleted here")
	}
	if !administrator && target.Role != auth.RoleUser {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only normal users can be deleted here")
	}
	if err := h.imports.DeleteAccount(ctx.Request().Context(), accountID); err != nil {
		return err
	}
	h.audit(ctx, "account_deleted", actor.ID, uuid.Nil, accountID)
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) GetAdminAdmins(ctx echo.Context) error {
	_, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireSuperAdmin(*account); err != nil {
		return err
	}
	items, err := h.admin.ListAdmins(ctx.Request().Context())
	if err != nil {
		return err
	}
	result := make([]Account, 0, len(items))
	for _, item := range items {
		result = append(result, h.accountDTO(item))
	}
	return ctx.JSON(http.StatusOK, AccountsListResponse{Data: AccountsListData{Items: result}, Meta: PaginationMeta{Page: 1, PageSize: len(result), Total: len(result)}, RequestId: requestID(ctx)})
}

func (h *Handler) PostAdminAdmin(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireSuperAdmin(*account); err != nil {
		return err
	}
	var request PostAdminAdminJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	createdAccount, err := h.admin.CreateAdmin(ctx.Request().Context(), request.Username, request.Password)
	if err != nil {
		return err
	}
	h.audit(ctx, "admin_created", account.ID, createdAccount.ID, uuid.Nil)
	return ctx.JSON(http.StatusCreated, AccountResponse{Data: h.accountDTO(createdAccount), RequestId: requestID(ctx)})
}

func (h *Handler) GetAdminInvitationCodes(ctx echo.Context) error {
	_, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireAdmin(*account); err != nil {
		return err
	}
	items, err := h.invitation.List(ctx.Request().Context())
	if err != nil {
		return err
	}
	result := make([]Invitation, 0, len(items))
	for _, item := range items {
		result = append(result, h.invitationDTO(item))
	}
	response := InvitationListResponse{RequestId: requestID(ctx)}
	response.Data.Items = result
	return ctx.JSON(http.StatusOK, response)
}

func (h *Handler) PostAdminInvitationCode(ctx echo.Context) error {
	session, actor, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireAdmin(*actor); err != nil {
		return err
	}
	var request PostAdminInvitationCodeJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.invitation.Create(ctx.Request().Context(), actor.ID, request.Code, request.MaxUses, request.ExpiresAt)
	if err != nil {
		return err
	}
	h.audit(ctx, "invitation_created", actor.ID, uuid.Nil, item.ID)
	return ctx.JSON(http.StatusCreated, InvitationResponse{Data: h.invitationDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) PatchAdminInvitationCode(ctx echo.Context, invitationID InvitationId) error {
	session, actor, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireAdmin(*actor); err != nil {
		return err
	}
	var request PatchAdminInvitationCodeJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	var status *string
	if request.Status != nil {
		value := string(*request.Status)
		status = &value
	}
	clearMaxUses := request.ClearMaxUses != nil && *request.ClearMaxUses
	clearExpiresAt := request.ClearExpiresAt != nil && *request.ClearExpiresAt
	item, err := h.invitation.Update(ctx.Request().Context(), invitationID, status, request.MaxUses, request.ExpiresAt, clearMaxUses, clearExpiresAt)
	if err != nil {
		return err
	}
	h.audit(ctx, "invitation_updated", actor.ID, uuid.Nil, invitationID)
	return ctx.JSON(http.StatusOK, InvitationResponse{Data: h.invitationDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteAdminInvitationCode(ctx echo.Context, invitationID InvitationId) error {
	session, actor, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := requireAdmin(*actor); err != nil {
		return err
	}
	if err := h.invitation.Disable(ctx.Request().Context(), invitationID); err != nil {
		return err
	}
	h.audit(ctx, "invitation_disabled", actor.ID, uuid.Nil, invitationID)
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) GetDashboard(ctx echo.Context, params GetDashboardParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	dashboard, err := h.daily.Dashboard(ctx.Request().Context(), userID, params.Date.Time)
	if err != nil {
		return err
	}
	events := make([]DashboardUpcomingEvent, 0, len(dashboard.UpcomingEvents))
	for _, event := range dashboard.UpcomingEvents {
		events = append(events, DashboardUpcomingEvent{Id: event.ID, Title: event.Title, StartAt: event.StartAt, EndAt: event.EndAt})
	}
	return ctx.JSON(http.StatusOK, DashboardResponse{Data: DashboardData{Date: apiDate(dashboard.Date), Today: dashboardPeriodDTO(dashboard.Today), Week: dashboardPeriodDTO(dashboard.Week), Month: dashboardPeriodDTO(dashboard.Month), ActiveGoals: goalsDTO(dashboard.ActiveGoals), DreamsCount: int(dashboard.DreamsCount), UpcomingEvents: events, TeamSummary: DashboardTeamSummary{TotalMembers: int(dashboard.TeamSummary.TotalMembers), ActiveMembers: int(dashboard.TeamSummary.ActiveMembers)}, LearningSummary: DashboardLearningSummary{ReadingMinutes: int(dashboard.LearningSummary.ReadingMinutes), AudioMinutes: int(dashboard.LearningSummary.AudioMinutes)}, FinanceSummary: DashboardFinanceSummary{Income: money.Format(dashboard.FinanceSummary.Income), Expense: money.Format(dashboard.FinanceSummary.Expense), NetCashFlow: money.Format(dashboard.FinanceSummary.NetCashFlow)}}, RequestId: requestID(ctx)})
}

func (h *Handler) ListWorklogs(ctx echo.Context, params ListWorklogsParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	from, to := dateRange(params.From, params.To)
	items, err := h.daily.ListWorklogs(ctx.Request().Context(), userID, from, to)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, WorklogListResponse{Data: struct {
		Items []Worklog `json:"items"`
	}{Items: worklogsDTO(items)}, RequestId: requestID(ctx)})
}

func (h *Handler) GetWorklog(ctx echo.Context, workDate WorkDate) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.daily.GetWorklog(ctx.Request().Context(), userID, workDate.Time)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, WorklogResponse{Data: worklogDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CreateWorklog(ctx echo.Context) error {
	return h.saveWorklog(ctx, time.Time{}, http.StatusCreated)
}

func (h *Handler) UpdateWorklog(ctx echo.Context, workDate WorkDate) error {
	return h.saveWorklog(ctx, workDate.Time, http.StatusOK)
}

func (h *Handler) saveWorklog(ctx echo.Context, pathDate time.Time, status int) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request WorklogRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	if !pathDate.IsZero() {
		request.WorkDate = openapi_types.Date{Time: pathDate}
	}
	item, err := h.daily.SaveWorklog(ctx.Request().Context(), account.ID, worklogInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(status, WorklogResponse{Data: worklogDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteWorklog(ctx echo.Context, workDate WorkDate) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := h.daily.DeleteWorklog(ctx.Request().Context(), account.ID, workDate.Time); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListTurnovers(ctx echo.Context, params ListTurnoversParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	from, to := dateRange(params.From, params.To)
	items, err := h.daily.ListTurnovers(ctx.Request().Context(), userID, from, to)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, TurnoverListResponse{Data: struct {
		Items []Turnover `json:"items"`
	}{Items: turnoversDTO(items)}, RequestId: requestID(ctx)})
}

func (h *Handler) GetTurnover(ctx echo.Context, turnoverDate TurnoverDate) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.daily.GetTurnover(ctx.Request().Context(), userID, turnoverDate.Time)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, TurnoverResponse{Data: turnoverDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CreateTurnover(ctx echo.Context) error {
	return h.saveTurnover(ctx, time.Time{}, http.StatusCreated)
}

func (h *Handler) UpdateTurnover(ctx echo.Context, turnoverDate TurnoverDate) error {
	return h.saveTurnover(ctx, turnoverDate.Time, http.StatusOK)
}

func (h *Handler) saveTurnover(ctx echo.Context, pathDate time.Time, status int) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request TurnoverRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	if !pathDate.IsZero() {
		request.TurnoverDate = openapi_types.Date{Time: pathDate}
	}
	item, err := h.daily.SaveTurnover(ctx.Request().Context(), account.ID, turnoverInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(status, TurnoverResponse{Data: turnoverDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteTurnover(ctx echo.Context, turnoverDate TurnoverDate) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := h.daily.DeleteTurnover(ctx.Request().Context(), account.ID, turnoverDate.Time); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListDreams(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.daily.ListDreams(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, DreamListResponse{Data: struct {
		Items []Dream `json:"items"`
	}{Items: dreamsDTO(items)}, RequestId: requestID(ctx)})
}

func (h *Handler) GetDream(ctx echo.Context, dreamID DreamId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.daily.GetDream(ctx.Request().Context(), userID, uuid.UUID(dreamID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, DreamResponse{Data: dreamDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CreateDream(ctx echo.Context) error {
	return h.saveDream(ctx, uuid.Nil, http.StatusCreated)
}

func (h *Handler) UpdateDream(ctx echo.Context, dreamID DreamId) error {
	return h.saveDream(ctx, uuid.UUID(dreamID), http.StatusOK)
}

func (h *Handler) saveDream(ctx echo.Context, dreamID uuid.UUID, status int) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request DreamRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.daily.SaveDream(ctx.Request().Context(), account.ID, dreamID, dreamInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(status, DreamResponse{Data: dreamDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteDream(ctx echo.Context, dreamID DreamId) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := h.daily.DeleteDream(ctx.Request().Context(), account.ID, uuid.UUID(dreamID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListGoals(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.daily.ListGoals(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, GoalListResponse{Data: struct {
		Items []Goal `json:"items"`
	}{Items: goalsDTO(items)}, RequestId: requestID(ctx)})
}

func (h *Handler) GetGoal(ctx echo.Context, goalID GoalId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.daily.GetGoal(ctx.Request().Context(), userID, uuid.UUID(goalID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, GoalResponse{Data: goalDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CreateGoal(ctx echo.Context) error {
	return h.saveGoal(ctx, uuid.Nil, http.StatusCreated)
}

func (h *Handler) UpdateGoal(ctx echo.Context, goalID GoalId) error {
	return h.saveGoal(ctx, uuid.UUID(goalID), http.StatusOK)
}

func (h *Handler) saveGoal(ctx echo.Context, goalID uuid.UUID, status int) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request GoalRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.daily.SaveGoal(ctx.Request().Context(), account.ID, goalID, goalInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(status, GoalResponse{Data: goalDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteGoal(ctx echo.Context, goalID GoalId) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := h.daily.DeleteGoal(ctx.Request().Context(), account.ID, uuid.UUID(goalID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListCalendarEvents(ctx echo.Context, params ListCalendarEventsParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.calendar.List(ctx.Request().Context(), userID, params.From, params.To)
	if err != nil {
		return err
	}
	result := make([]CalendarEvent, 0, len(items))
	for _, item := range items {
		result = append(result, calendarDTO(item))
	}
	return ctx.JSON(http.StatusOK, CalendarEventListResponse{Data: struct {
		Items []CalendarEvent `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) GetCalendarEvent(ctx echo.Context, eventID CalendarEventId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.calendar.Get(ctx.Request().Context(), userID, uuid.UUID(eventID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, CalendarEventResponse{Data: calendarDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CreateCalendarEvent(ctx echo.Context) error {
	return h.saveCalendarEvent(ctx, uuid.Nil, http.StatusCreated)
}

func (h *Handler) UpdateCalendarEvent(ctx echo.Context, eventID CalendarEventId) error {
	return h.saveCalendarEvent(ctx, uuid.UUID(eventID), http.StatusOK)
}

func (h *Handler) saveCalendarEvent(ctx echo.Context, eventID uuid.UUID, status int) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request CalendarEventRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.calendar.Save(ctx.Request().Context(), account.ID, eventID, calendarInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(status, CalendarEventResponse{Data: calendarDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteCalendarEvent(ctx echo.Context, eventID CalendarEventId) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if err := h.calendar.Delete(ctx.Request().Context(), account.ID, uuid.UUID(eventID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListReviews(ctx echo.Context, params ListReviewsParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	from, to := dateRange(params.From, params.To)
	items, err := h.reviews.List(ctx.Request().Context(), userID, from, to)
	if err != nil {
		return err
	}
	result := make([]Review, 0, len(items))
	for _, item := range items {
		item, err = h.reviews.WithTotals(ctx.Request().Context(), item)
		if err != nil {
			return err
		}
		result = append(result, reviewDTO(item))
	}
	return ctx.JSON(http.StatusOK, ReviewListResponse{Data: struct {
		Items []Review `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) GetReview(ctx echo.Context, reviewType GetReviewParamsReviewType, periodStart ReviewPeriodStart) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.reviews.Get(ctx.Request().Context(), userID, string(reviewType), periodStart.Time)
	if err != nil {
		return err
	}
	item, err = h.reviews.WithTotals(ctx.Request().Context(), item)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, ReviewResponse{Data: reviewDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) UpdateReview(ctx echo.Context, reviewType UpdateReviewParamsReviewType, periodStart ReviewPeriodStart) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := requireUser(*account); err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	var request UpdateReviewJSONRequestBody
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.reviews.Save(ctx.Request().Context(), account.ID, reviews.Input{Type: string(reviewType), PeriodStart: periodStart.Time, Good: request.Good, Problems: request.Problems, Improvements: request.Improvements, NextFocus: request.NextFocus, Summary: request.Summary})
	if err != nil {
		return err
	}
	item, err = h.reviews.WithTotals(ctx.Request().Context(), item)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, ReviewResponse{Data: reviewDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) GetWorklogAnalytics(ctx echo.Context, params GetWorklogAnalyticsParams) error {
	return h.analyticsResponse(ctx, string(params.Granularity), params.From, params.To, func(from, to time.Time, granularity string, userID uuid.UUID) (analytics.Result, error) {
		return h.analytics.Worklogs(ctx.Request().Context(), userID, from, to, granularity)
	})
}

func (h *Handler) GetTurnoverAnalytics(ctx echo.Context, params GetTurnoverAnalyticsParams) error {
	return h.analyticsResponse(ctx, string(params.Granularity), params.From, params.To, func(from, to time.Time, granularity string, userID uuid.UUID) (analytics.Result, error) {
		return h.analytics.Turnover(ctx.Request().Context(), userID, from, to, granularity)
	})
}

func (h *Handler) GetGoalAnalytics(ctx echo.Context, params GetGoalAnalyticsParams) error {
	return h.analyticsResponse(ctx, string(params.Granularity), params.From, params.To, func(from, to time.Time, granularity string, userID uuid.UUID) (analytics.Result, error) {
		return h.analytics.Goals(ctx.Request().Context(), userID, from, to, granularity)
	})
}

func (h *Handler) GetFinanceAnalytics(ctx echo.Context, params GetFinanceAnalyticsParams) error {
	return h.analyticsResponse(ctx, string(params.Granularity), params.From, params.To, func(from, to time.Time, granularity string, userID uuid.UUID) (analytics.Result, error) {
		return h.analytics.Finance(ctx.Request().Context(), userID, from, to, granularity)
	})
}

func (h *Handler) GetTeamAnalytics(ctx echo.Context, params GetTeamAnalyticsParams) error {
	return h.analyticsResponse(ctx, string(params.Granularity), params.From, params.To, func(from, to time.Time, granularity string, userID uuid.UUID) (analytics.Result, error) {
		return h.analytics.Team(ctx.Request().Context(), userID, from, to, granularity)
	})
}

func (h *Handler) analyticsResponse(ctx echo.Context, granularity string, fromParam, toParam *openapi_types.Date, query func(time.Time, time.Time, string, uuid.UUID) (analytics.Result, error)) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	from, to := dateRange(fromParam, toParam)
	from, to = dailyDate(from), dailyDate(to).AddDate(0, 0, 1)
	result, err := query(from, to, granularity, userID)
	if err != nil {
		return err
	}
	buckets := make([]AnalyticsBucket, 0, len(result.Buckets))
	for _, item := range result.Buckets {
		memberCount, activeMemberCount := int(item.MemberCount), int(item.ActiveMemberCount)
		income, expense, netCashFlow := money.Format(item.IncomeAmount), money.Format(item.ExpenseAmount), money.Format(item.NetCashFlow)
		buckets = append(buckets, AnalyticsBucket{
			Period: item.Period, ActionCount: int(item.ActionCount),
			OpenConversationCount: int(item.OpenConversationCount), DeepConversationCount: int(item.DeepConversationCount),
			BufferCount: int(item.BufferCount), StoryShareCount: int(item.StoryShareCount),
			ScreeningCount: int(item.ScreeningCount), OpportunityCount: int(item.OpportunityCount),
			MeetingCount: int(item.MeetingCount), CustomerFollowupCount: int(item.CustomerFollowupCount),
			ReadingMinutes: int(item.ReadingMinutes), AudioMinutes: int(item.AudioMinutes),
			Pv: float32(item.PV), NetAmount: money.Format(item.NetAmount), IncomeAmount: &income,
			ExpenseAmount: &expense, NetCashFlow: &netCashFlow, MemberCount: &memberCount,
			ActiveMemberCount: &activeMemberCount, GoalCount: int(item.GoalCount), CompletedCount: int(item.CompletedCount),
		})
	}
	return ctx.JSON(http.StatusOK, AnalyticsResponse{Data: AnalyticsData{
		Metric: result.Metric, Granularity: AnalyticsDataGranularity(result.Granularity),
		From: apiDate(result.From), To: apiDate(result.To), Buckets: buckets,
		CurrentMemberCount: int(result.CurrentMemberCount), CurrentActiveMemberCount: int(result.CurrentActiveCount),
		SnapshotCount: int(result.SnapshotCount),
	}, RequestId: requestID(ctx)})
}

func (h *Handler) dailyUser(ctx echo.Context) (uuid.UUID, *auth.Session, error) {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return uuid.Nil, nil, err
	}
	if err := requireUser(*account); err != nil {
		return uuid.Nil, nil, err
	}
	return account.ID, session, nil
}

func worklogInput(value WorklogRequest) daily.WorklogInput {
	var pv *float64
	if value.TurnoverPv != nil {
		converted := float64(*value.TurnoverPv)
		pv = &converted
	}
	netAmount := moneyPointer(value.TurnoverNetAmount)
	return daily.WorklogInput{WorkDate: value.WorkDate.Time, OpenConversationCount: int32(value.OpenConversationCount), DeepConversationCount: int32(value.DeepConversationCount), BufferCount: int32(value.BufferCount), StoryShareCount: int32(value.StoryShareCount), ScreeningCount: int32(value.ScreeningCount), OpportunityCount: int32(value.OpportunityCount), MeetingCount: int32(value.MeetingCount), CustomerFollowupCount: int32(value.CustomerFollowupCount), ReadingMinutes: int32(value.ReadingMinutes), AudioMinutes: int32(value.AudioMinutes), TurnoverPV: pv, TurnoverNetAmount: netAmount, Note: value.Note}
}

func turnoverInput(value TurnoverRequest) daily.TurnoverInput {
	var pv *float64
	if value.Pv != nil {
		converted := float64(*value.Pv)
		pv = &converted
	}
	netAmount := moneyPointer(value.NetAmount)
	return daily.TurnoverInput{TurnoverDate: value.TurnoverDate.Time, PV: pv, NetAmount: netAmount, Note: value.Note}
}

func dreamInput(value DreamRequest) daily.DreamInput {
	goalIDs := []uuid.UUID{}
	if value.GoalIds != nil {
		for _, id := range *value.GoalIds {
			goalIDs = append(goalIDs, uuid.UUID(id))
		}
	}
	fileIDs := []uuid.UUID{}
	if value.FileIds != nil {
		for _, id := range *value.FileIds {
			fileIDs = append(fileIDs, uuid.UUID(id))
		}
	}
	sortOrder := 0
	if value.SortOrder != nil {
		sortOrder = *value.SortOrder
	}
	return daily.DreamInput{Title: value.Title, Description: value.Description, GoalIDs: goalIDs, FileIDs: fileIDs, SortOrder: int32(sortOrder)}
}

func goalInput(value GoalRequest) daily.GoalInput {
	var parentID *uuid.UUID
	if value.ParentId != nil {
		converted := uuid.UUID(*value.ParentId)
		parentID = &converted
	}
	var startDate, dueDate *time.Time
	if value.StartDate != nil {
		converted := value.StartDate.Time
		startDate = &converted
	}
	if value.DueDate != nil {
		converted := value.DueDate.Time
		dueDate = &converted
	}
	status := "NOT_STARTED"
	if value.Status != nil {
		status = string(*value.Status)
	}
	sortOrder := 0
	if value.SortOrder != nil {
		sortOrder = *value.SortOrder
	}
	metrics := []daily.GoalMetricInput{}
	if value.Metrics != nil {
		for _, metric := range *value.Metrics {
			metrics = append(metrics, daily.GoalMetricInput{MetricCode: string(metric.MetricCode), TargetValue: float64(metric.TargetValue), Unit: metric.Unit})
		}
	}
	return daily.GoalInput{ParentID: parentID, Type: string(value.Type), Title: value.Title, Description: value.Description, StartDate: startDate, DueDate: dueDate, Status: status, SortOrder: int32(sortOrder), Metrics: metrics}
}

func dateRange(from *DateFrom, to *DateTo) (time.Time, time.Time) {
	start := time.Now().UTC().AddDate(0, 0, -30)
	end := time.Now().UTC()
	if from != nil {
		start = from.Time
	}
	if to != nil {
		end = to.Time
	}
	return start, end
}

func apiDate(value time.Time) openapi_types.Date { return openapi_types.Date{Time: dailyDate(value)} }
func dailyDate(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func worklogDTO(value daily.Worklog) Worklog {
	return Worklog{Id: value.ID, WorkDate: apiDate(value.WorkDate), OpenConversationCount: int(value.OpenConversationCount), DeepConversationCount: int(value.DeepConversationCount), BufferCount: int(value.BufferCount), StoryShareCount: int(value.StoryShareCount), ScreeningCount: int(value.ScreeningCount), OpportunityCount: int(value.OpportunityCount), MeetingCount: int(value.MeetingCount), CustomerFollowupCount: int(value.CustomerFollowupCount), ReadingMinutes: value.ReadingMinutes, AudioMinutes: value.AudioMinutes, TurnoverPv: float32Pointer(value.TurnoverPV), TurnoverNetAmount: moneyPointerString(value.TurnoverNetAmount), Note: value.Note, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}

func worklogsDTO(values []daily.Worklog) []Worklog {
	result := make([]Worklog, 0, len(values))
	for _, value := range values {
		result = append(result, worklogDTO(value))
	}
	return result
}

func turnoverDTO(value daily.Turnover) Turnover {
	return Turnover{Id: value.ID, TurnoverDate: apiDate(value.TurnoverDate), Pv: float32(value.PV), NetAmount: money.Format(value.NetAmount), Note: value.Note, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func turnoversDTO(values []daily.Turnover) []Turnover {
	result := make([]Turnover, 0, len(values))
	for _, value := range values {
		result = append(result, turnoverDTO(value))
	}
	return result
}

func dreamDTO(value daily.Dream) Dream {
	ids := make([]openapi_types.UUID, 0, len(value.GoalIDs))
	for _, id := range value.GoalIDs {
		ids = append(ids, id)
	}
	fileIDs := make([]openapi_types.UUID, 0, len(value.FileIDs))
	for _, id := range value.FileIDs {
		fileIDs = append(fileIDs, openapi_types.UUID(id))
	}
	return Dream{Id: value.ID, Title: value.Title, Description: value.Description, GoalIds: ids, FileIds: fileIDs, SortOrder: int(value.SortOrder), CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func dreamsDTO(values []daily.Dream) []Dream {
	result := make([]Dream, 0, len(values))
	for _, value := range values {
		result = append(result, dreamDTO(value))
	}
	return result
}

func goalDTO(value daily.Goal) Goal {
	metrics := make([]GoalMetric, 0, len(value.Metrics))
	for _, metric := range value.Metrics {
		metrics = append(metrics, GoalMetric{MetricCode: GoalMetricMetricCode(metric.MetricCode), TargetValue: float32(metric.TargetValue), Unit: metric.Unit, ActualValue: float32(metric.ActualValue), Progress: float32(metric.Progress)})
	}
	var parentID *openapi_types.UUID
	if value.ParentID != nil {
		converted := openapi_types.UUID(*value.ParentID)
		parentID = &converted
	}
	return Goal{Id: value.ID, ParentId: parentID, Type: GoalType(value.Type), Title: value.Title, Description: value.Description, StartDate: datePointer(value.StartDate), DueDate: datePointer(value.DueDate), Status: GoalStatus(value.Status), SortOrder: int(value.SortOrder), Metrics: metrics, Progress: float32(value.Progress), CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func goalsDTO(values []daily.Goal) []Goal {
	result := make([]Goal, 0, len(values))
	for _, value := range values {
		result = append(result, goalDTO(value))
	}
	return result
}

func dashboardPeriodDTO(value daily.Period) DashboardPeriod {
	return DashboardPeriod{From: apiDate(value.From), To: apiDate(value.To), Worklogs: WorklogTotals{OpenConversationCount: int(value.Worklogs.OpenConversationCount), DeepConversationCount: int(value.Worklogs.DeepConversationCount), BufferCount: int(value.Worklogs.BufferCount), StoryShareCount: int(value.Worklogs.StoryShareCount), ScreeningCount: int(value.Worklogs.ScreeningCount), OpportunityCount: int(value.Worklogs.OpportunityCount), MeetingCount: int(value.Worklogs.MeetingCount), CustomerFollowupCount: int(value.Worklogs.CustomerFollowupCount), ReadingMinutes: int(value.Worklogs.ReadingMinutes), AudioMinutes: int(value.Worklogs.AudioMinutes)}, Turnover: TurnoverTotals{Pv: float32(value.Turnover.PV), NetAmount: money.Format(value.Turnover.NetAmount)}}
}

func float32Pointer(value *float64) *float32 {
	if value == nil {
		return nil
	}
	converted := float32(*value)
	return &converted
}

func moneyPointer(value *string) *money.Cents {
	if value == nil {
		return nil
	}
	parsed, err := money.Parse(*value)
	if err != nil {
		return nil
	}
	return &parsed
}

func moneyPointerString(value *money.Cents) *string {
	if value == nil {
		return nil
	}
	formatted := money.Format(*value)
	return &formatted
}

func calendarInput(value CalendarEventRequest) calendar.Input {
	freq, endType, scope := "NONE", "NEVER", "SERIES"
	if value.RecurrenceFreq != nil {
		freq = string(*value.RecurrenceFreq)
	}
	if value.RecurrenceEndType != nil {
		endType = string(*value.RecurrenceEndType)
	}
	if value.EditScope != nil {
		scope = string(*value.EditScope)
	}
	interval := 1
	if value.RecurrenceInterval != nil {
		interval = *value.RecurrenceInterval
	}
	allDay := false
	if value.AllDay != nil {
		allDay = *value.AllDay
	}
	weekdays := []int{}
	if value.RecurrenceWeekdays != nil {
		weekdays = *value.RecurrenceWeekdays
	}
	attendees := []calendar.Attendee{}
	if value.Attendees != nil {
		for _, item := range *value.Attendees {
			attendees = append(attendees, calendar.Attendee{Email: string(item.Email), DisplayName: stringPointerValue(item.DisplayName)})
		}
	}
	return calendar.Input{Title: value.Title, Description: value.Description, Location: value.LocationOrLink, Timezone: value.Timezone, AllDay: allDay, StartAt: value.StartAt, EndAt: value.EndAt, RecurrenceFreq: freq, RecurrenceInterval: interval, RecurrenceWeekdays: weekdays, RecurrenceEndType: endType, RecurrenceUntil: value.RecurrenceUntil, RecurrenceCount: value.RecurrenceCount, Attendees: attendees, EditScope: scope, OccurrenceStart: value.OccurrenceStart}
}

func calendarDTO(value calendar.Event) CalendarEvent {
	weekdays := append([]int(nil), value.RecurrenceWeekdays...)
	attendees := make([]CalendarAttendee, 0, len(value.Attendees))
	for _, item := range value.Attendees {
		email := openapi_types.Email(item.Email)
		name := item.DisplayName
		var display *string
		if name != "" {
			display = &name
		}
		attendees = append(attendees, CalendarAttendee{Email: email, DisplayName: display})
	}
	isException := value.IsException
	return CalendarEvent{Id: value.ID, OccurrenceId: calendar.EventOccurrenceID(value), Uid: value.UID, Sequence: value.Sequence, Title: value.Title, Description: value.Description, LocationOrLink: value.Location, Timezone: value.Timezone, AllDay: value.AllDay, StartAt: value.StartAt, EndAt: value.EndAt, RecurrenceFreq: CalendarEventRecurrenceFreq(value.RecurrenceFreq), RecurrenceInterval: value.RecurrenceInterval, RecurrenceWeekdays: weekdays, RecurrenceEndType: CalendarEventRecurrenceEndType(value.RecurrenceEndType), RecurrenceUntil: value.RecurrenceUntil, RecurrenceCount: value.RecurrenceCount, OriginalOccurrenceStart: value.OriginalOccurrenceStart, IsException: &isException, Attendees: attendees}
}

func reviewDTO(value reviews.Review) Review {
	var id *openapi_types.UUID
	if value.ID != uuid.Nil {
		converted := openapi_types.UUID(value.ID)
		id = &converted
	}
	return Review{Id: id, Type: ReviewType(value.Type), PeriodStart: apiDate(value.PeriodStart), Good: stringPointerValue(value.Good), Problems: stringPointerValue(value.Problems), Improvements: stringPointerValue(value.Improvements), NextFocus: stringPointerValue(value.NextFocus), Summary: value.Summary, Totals: ReviewPeriodTotals{WorklogActionCount: int(value.WorklogActionCount), TurnoverPv: float32(value.TurnoverPV), TurnoverNetAmount: formatFloatMoney(value.TurnoverNetAmount)}}
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func formatFloatMoney(value float64) string {
	parsed, err := money.FromFloat(value)
	if err != nil {
		return "0.00"
	}
	return money.Format(parsed)
}

func datePointer(value *time.Time) *openapi_types.Date {
	if value == nil {
		return nil
	}
	converted := apiDate(*value)
	return &converted
}

func (h *Handler) authResponse(ctx echo.Context, account auth.Account, session *auth.Session, csrfToken string) AuthResponse {
	accounts := h.sessionAccounts(ctx, session)
	return AuthResponse{Data: AuthData{Account: h.accountDTO(account), Accounts: accounts, CsrfToken: csrfToken}, RequestId: requestID(ctx)}
}

func (h *Handler) accountsResponse(ctx echo.Context, session *auth.Session, account auth.Account) error {
	return ctx.JSON(http.StatusOK, AccountsResponse{Data: AccountsData{Account: h.accountDTO(account), Accounts: h.sessionAccounts(ctx, session), CsrfToken: auth.CSRFTokenFromContext(ctx)}, RequestId: requestID(ctx)})
}

func (h *Handler) sessionAccounts(ctx echo.Context, session *auth.Session) []SessionAccount {
	rows, err := h.auth.Queries().ListBrowserSessionAccounts(ctx.Request().Context(), auth.ToPGUUID(session.ID))
	if err != nil {
		return []SessionAccount{}
	}
	accounts := make([]SessionAccount, 0, len(rows))
	for _, row := range rows {
		id, _ := uuid.Parse(row.ID.String())
		account := SessionAccount{Id: id, Username: row.Username, Role: SessionAccountRole(row.Role), Status: SessionAccountStatus(row.Status), Timezone: row.Timezone, CreatedAt: row.CreatedAt.Time, Active: row.Active}
		if row.LastLoginAt.Valid {
			lastLogin := row.LastLoginAt.Time
			account.LastLoginAt = &lastLogin
		}
		accounts = append(accounts, account)
	}
	return accounts
}

func (h *Handler) accountDTO(value auth.Account) Account {
	return Account{Id: value.ID, Username: value.Username, Role: AccountRole(value.Role), Status: AccountStatus(value.Status), Timezone: value.Timezone, CreatedAt: value.CreatedAt, LastLoginAt: value.LastLoginAt}
}

func (h *Handler) invitationDTO(value invitation.Invitation) Invitation {
	return Invitation{Id: value.ID, Code: value.Code, Status: InvitationStatus(value.Status), MaxUses: value.MaxUses, UsedCount: value.UsedCount, ExpiresAt: value.ExpiresAt, CreatedAt: value.CreatedAt}
}

func generatedUUIDPair(sessionID, accountID uuid.UUID) generated.AddBrowserSessionAccountParams {
	return generated.AddBrowserSessionAccountParams{BrowserSessionID: auth.ToPGUUID(sessionID), AccountID: auth.ToPGUUID(accountID)}
}

func generatedActivePair(sessionID, accountID uuid.UUID) generated.SetActiveAccountParams {
	return generated.SetActiveAccountParams{ID: auth.ToPGUUID(sessionID), ActiveAccountID: auth.ToPGUUID(accountID)}
}

func generatedDeletePair(sessionID, accountID uuid.UUID) generated.DeleteBrowserSessionAccountParams {
	return generated.DeleteBrowserSessionAccountParams{BrowserSessionID: auth.ToPGUUID(sessionID), AccountID: auth.ToPGUUID(accountID)}
}

func requestID(ctx echo.Context) string { return ctx.Response().Header().Get(echo.HeaderXRequestID) }

func (h *Handler) audit(ctx echo.Context, action string, actor, target, targetID uuid.UUID) {
	userAgent := strings.TrimSpace(ctx.Request().UserAgent())
	if len(userAgent) > 256 {
		userAgent = userAgent[:256]
	}
	_ = h.auth.Queries().CreateAuditLog(ctx.Request().Context(), generated.CreateAuditLogParams{
		ID:              auth.ToPGUUID(uuid.New()),
		ActorAccountID:  nullableUUID(actor),
		Action:          action,
		TargetAccountID: nullableUUID(target),
		TargetID:        nullableUUID(targetID),
		Column6:         ctx.RealIP(),
		Column7:         userAgent,
		Column8:         requestID(ctx),
	})
}

func nullableUUID(value uuid.UUID) pgtype.UUID {
	if value == uuid.Nil {
		return pgtype.UUID{}
	}
	return auth.ToPGUUID(value)
}

func actorID(ctx echo.Context) uuid.UUID {
	_, account, err := auth.SessionFromContext(ctx)
	if err != nil || account == nil {
		return uuid.Nil
	}
	return account.ID
}

func accountIDFromSession(session *auth.Session) uuid.UUID {
	if session == nil || session.ActiveAccountID == nil {
		return uuid.Nil
	}
	return *session.ActiveAccountID
}

func requireUser(account auth.Account) error {
	if account.Role != auth.RoleUser {
		return problem.New("FORBIDDEN", http.StatusForbidden, "normal user account required")
	}
	return nil
}

func requireAdmin(account auth.Account) error {
	if account.Role != auth.RoleAdmin && account.Role != auth.RoleSuperAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "administrator access required")
	}
	return nil
}

func requireSuperAdmin(account auth.Account) error {
	if account.Role != auth.RoleSuperAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "super administrator access required")
	}
	return nil
}
