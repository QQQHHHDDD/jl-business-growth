package problem

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestHTTPErrorHandlerDoesNotExposeInternalDetails(t *testing.T) {
	e := echo.New()
	recorder := httptest.NewRecorder()
	ctx := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/private", nil), recorder)
	ctx.Response().Header().Set(echo.HeaderXRequestID, "request-1")

	HTTPErrorHandler(errors.New("pq: password authentication failed at /secret/file.go:12"), ctx)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
	body := recorder.Body.String()
	if strings.Contains(body, "password authentication") || strings.Contains(body, "secret/file.go") {
		t.Fatalf("internal details leaked in response: %s", body)
	}
	if !strings.Contains(body, `"code":"INTERNAL_ERROR"`) || !strings.Contains(body, `"request_id":"request-1"`) {
		t.Fatalf("stable public error missing from response: %s", body)
	}
}

func TestHTTPErrorHandlerPreservesKnownClientErrors(t *testing.T) {
	e := echo.New()
	recorder := httptest.NewRecorder()
	ctx := e.NewContext(httptest.NewRequest(http.MethodPost, "/api/auth/login", nil), recorder)

	HTTPErrorHandler(New("PASSWORD_INCORRECT", http.StatusUnauthorized, "username or password is incorrect"), ctx)

	if recorder.Code != http.StatusUnauthorized || !strings.Contains(recorder.Body.String(), "PASSWORD_INCORRECT") {
		t.Fatalf("known client error was not preserved: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}
