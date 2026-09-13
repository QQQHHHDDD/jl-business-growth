package health

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/api"
	"jl-business-growth/backend/internal/config"
)

type fakePinger struct {
	err error
}

func (p fakePinger) Ping(context.Context) error {
	return p.err
}

func TestGetHealthLive(t *testing.T) {
	e := echo.New()
	recorder := httptest.NewRecorder()
	context := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/health/live", nil), recorder)
	context.Response().Header().Set(echo.HeaderXRequestID, "request-1")
	handler := New(fakePinger{}, config.Config{})

	if err := handler.GetHealthLive(context); err != nil {
		t.Fatalf("GetHealthLive() error = %v", err)
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	var response api.HealthResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Data.Checks["api"] != api.Ready {
		t.Fatalf("api check = %q, want %q", response.Data.Checks["api"], api.Ready)
	}
}

func TestGetHealthReadyReturnsServiceUnavailableWhenDatabaseFails(t *testing.T) {
	temporaryDirectory := t.TempDir()
	e := echo.New()
	recorder := httptest.NewRecorder()
	context := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/health/ready", nil), recorder)
	context.Response().Header().Set(echo.HeaderXRequestID, "request-2")
	handler := New(fakePinger{err: errors.New("database unavailable")}, config.Config{
		FileRoot:       temporaryDirectory,
		MailMode:       "file",
		MailOutboxRoot: temporaryDirectory,
	})

	if err := handler.GetHealthReady(context); err != nil {
		t.Fatalf("GetHealthReady() error = %v", err)
	}
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}

	var response api.ErrorResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Error.Code != "INTERNAL_ERROR" {
		t.Fatalf("error code = %q", response.Error.Code)
	}
}
