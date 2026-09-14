package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/admin"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/invitation"
	"jl-business-growth/backend/internal/problem"
)

type Handler struct {
	auth       *auth.Service
	admin      *admin.Service
	invitation *invitation.Service
	config     config.Config
}

func NewHandler(authService *auth.Service, adminService *admin.Service, invitationService *invitation.Service, cfg config.Config) *Handler {
	return &Handler{auth: authService, admin: adminService, invitation: invitationService, config: cfg}
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
	if administrator {
		err = h.admin.DeleteAdmin(ctx.Request().Context(), accountID)
	} else {
		err = h.admin.DeleteUser(ctx.Request().Context(), accountID)
	}
	if err != nil {
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
