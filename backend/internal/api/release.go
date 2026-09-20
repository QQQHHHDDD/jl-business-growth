package api

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/problem"
	releases "jl-business-growth/backend/internal/release"
)

func (h *Handler) GetAdminSystemRelease(ctx echo.Context) error {
	if _, _, err := h.requireReleaseAccess(ctx, false); err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, h.releaseResponse(ctx, h.releases.State(ctx.Request().Context(), false)))
}

func (h *Handler) PostAdminSystemReleaseCheck(ctx echo.Context) error {
	_, account, err := h.requireReleaseAccess(ctx, true)
	if err != nil {
		return err
	}
	state := h.releases.State(ctx.Request().Context(), true)
	h.auditDetails(ctx, "SYSTEM_RELEASE_CHECK", account.ID, uuid.Nil, uuid.Nil, map[string]string{"current_version": state.Build.Version})
	return ctx.JSON(http.StatusOK, h.releaseResponse(ctx, state))
}

func (h *Handler) PostAdminSystemReleaseUpdate(ctx echo.Context) error {
	return h.queueReleaseAction(ctx, "update", "SYSTEM_RELEASE_UPDATE_REQUEST")
}

func (h *Handler) PostAdminSystemReleaseRollback(ctx echo.Context) error {
	return h.queueReleaseAction(ctx, "rollback", "SYSTEM_RELEASE_ROLLBACK_REQUEST")
}

func (h *Handler) queueReleaseAction(ctx echo.Context, action, auditAction string) error {
	_, account, err := h.requireReleaseAccess(ctx, true)
	if err != nil {
		return err
	}
	var request ReleaseActionRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	state, updaterRequestID, err := h.releases.Queue(ctx.Request().Context(), action, request.Version)
	if err != nil {
		return err
	}
	targetID, _ := uuid.Parse(updaterRequestID)
	h.auditDetails(ctx, auditAction, account.ID, uuid.Nil, targetID, map[string]string{
		"target_version": request.Version,
		"request_id":     updaterRequestID,
	})
	return ctx.JSON(http.StatusAccepted, h.releaseResponse(ctx, state))
}

func (h *Handler) requireReleaseAccess(ctx echo.Context, csrf bool) (*auth.Session, *auth.Account, error) {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return nil, nil, err
	}
	if err := requireSuperAdmin(*account); err != nil {
		return nil, nil, err
	}
	if csrf {
		if err := auth.VerifyCSRF(ctx, session); err != nil {
			return nil, nil, err
		}
	}
	return session, account, nil
}

func (h *Handler) releaseResponse(ctx echo.Context, state releases.State) ReleaseResponse {
	data := ReleaseData{
		CurrentVersion:    state.Build.Version,
		CurrentCommit:     state.Build.Commit,
		BuildTime:         state.Build.BuildTime,
		UpdateAvailable:   state.UpdateAvailable,
		UpdateEnabled:     state.UpdateEnabled,
		InstalledVersions: make([]InstalledRelease, 0, len(state.InstalledVersions)),
	}
	if state.Latest != nil {
		data.LatestRelease = &LatestRelease{Version: state.Latest.Version, Name: state.Latest.Name, PublishedAt: state.Latest.PublishedAt, HtmlUrl: state.Latest.HTMLURL}
	}
	if state.CheckError != "" {
		data.CheckError = &state.CheckError
	}
	for _, item := range state.InstalledVersions {
		installed := InstalledRelease{Version: item.Version, Current: item.Current, RollbackAllowed: item.RollbackAllowed, InstalledAt: item.InstalledAt}
		if item.RollbackBlockedReason != "" {
			reason := item.RollbackBlockedReason
			installed.RollbackBlockedReason = &reason
		}
		data.InstalledVersions = append(data.InstalledVersions, installed)
	}
	if state.UpdateStatus != nil {
		statusID, err := uuid.Parse(state.UpdateStatus.RequestID)
		if err == nil {
			data.UpdateStatus = &ReleaseUpdateStatus{
				RequestId:     statusID,
				Action:        ReleaseUpdateStatusAction(state.UpdateStatus.Action),
				FromVersion:   state.UpdateStatus.FromVersion,
				TargetVersion: state.UpdateStatus.TargetVersion,
				State:         ReleaseUpdateStatusState(state.UpdateStatus.State),
				StartedAt:     state.UpdateStatus.StartedAt,
				FinishedAt:    state.UpdateStatus.FinishedAt,
				SafeMessage:   state.UpdateStatus.SafeMessage,
			}
		}
	}
	return ReleaseResponse{Data: data, RequestId: requestID(ctx)}
}
