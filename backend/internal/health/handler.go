package health

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/api"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/database"
)

type Handler struct {
	database database.Pinger
	config   config.Config
}

func New(database database.Pinger, config config.Config) *Handler {
	return &Handler{database: database, config: config}
}

func (h *Handler) GetHealthLive(ctx echo.Context) error {
	return ctx.JSON(http.StatusOK, api.HealthResponse{
		Data: api.HealthData{
			Status: api.Ok,
			Checks: map[string]api.HealthDataChecks{
				"api": api.Ready,
			},
		},
		RequestId: requestID(ctx),
	})
}

func (h *Handler) GetHealthReady(ctx echo.Context) error {
	checks := map[string]api.HealthDataChecks{}
	ready := true

	readinessContext, cancel := context.WithTimeout(ctx.Request().Context(), 2*time.Second)
	defer cancel()
	if err := h.database.Ping(readinessContext); err != nil {
		checks["database"] = api.Unavailable
		ready = false
	} else {
		checks["database"] = api.Ready
	}

	if err := accessibleDirectory(h.config.FileRoot); err != nil {
		checks["files"] = api.Unavailable
		ready = false
	} else {
		checks["files"] = api.Ready
	}
	if !ready {
		return ctx.JSON(http.StatusServiceUnavailable, api.ErrorResponse{
			Error: api.ErrorBody{
				Code:    "INTERNAL_ERROR",
				Message: "service dependencies are unavailable",
			},
			RequestId: requestID(ctx),
		})
	}

	return ctx.JSON(http.StatusOK, api.HealthResponse{
		Data: api.HealthData{
			Status: api.Ok,
			Checks: checks,
		},
		RequestId: requestID(ctx),
	})
}

func accessibleDirectory(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return os.ErrInvalid
	}

	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	return directory.Close()
}

func requestID(ctx echo.Context) string {
	return ctx.Response().Header().Get(echo.HeaderXRequestID)
}
