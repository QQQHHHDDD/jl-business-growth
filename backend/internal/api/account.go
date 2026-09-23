package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/problem"
)

func (h *Handler) DeleteCurrentAccount(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if account.Role == auth.RoleSuperAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "the fixed super administrator cannot be deleted")
	}
	if err := h.files.DeleteAccount(ctx.Request().Context(), account.ID); err != nil {
		return err
	}
	auth.DestroySession(ctx, h.auth.Pool(), h.config)
	return ctx.NoContent(http.StatusNoContent)
}
