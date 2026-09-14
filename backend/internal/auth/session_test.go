package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/config"
)

func TestVerifyCSRFRequiresTheSessionToken(t *testing.T) {
	e := echo.New()
	token, tokenHash, err := randomToken()
	if err != nil {
		t.Fatalf("randomToken() error = %v", err)
	}
	session := &Session{CSRFTokenHash: tokenHash}

	missing := e.NewContext(httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil), httptest.NewRecorder())
	if err := VerifyCSRF(missing, session); err == nil {
		t.Fatal("VerifyCSRF() accepted a missing token")
	}

	request := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	request.Header.Set("X-CSRF-Token", token)
	valid := e.NewContext(request, httptest.NewRecorder())
	if err := VerifyCSRF(valid, session); err != nil {
		t.Fatalf("VerifyCSRF() rejected the session token: %v", err)
	}

	request.Header.Set("X-CSRF-Token", "wrong")
	if err := VerifyCSRF(valid, session); err == nil {
		t.Fatal("VerifyCSRF() accepted a wrong token")
	}
}

func TestSecurityMiddlewareRejectsCrossSiteMutations(t *testing.T) {
	e := echo.New()
	handler := SecurityMiddleware(config.Config{PublicBaseURL: "http://127.0.0.1:5173"})(func(echo.Context) error { return nil })

	crossSiteRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	crossSiteRequest.Header.Set("Sec-Fetch-Site", "cross-site")
	if err := handler(e.NewContext(crossSiteRequest, httptest.NewRecorder())); err == nil {
		t.Fatal("SecurityMiddleware() accepted a cross-site mutation")
	}

	wrongOriginRequest := httptest.NewRequest(http.MethodPatch, "/api/auth/me/timezone", nil)
	wrongOriginRequest.Header.Set("Origin", "https://evil.example")
	if err := handler(e.NewContext(wrongOriginRequest, httptest.NewRecorder())); err == nil {
		t.Fatal("SecurityMiddleware() accepted an unexpected origin")
	}

	sameOriginRequest := httptest.NewRequest(http.MethodPatch, "/api/auth/me/timezone", nil)
	sameOriginRequest.Header.Set("Origin", "http://127.0.0.1:5173")
	sameOriginRequest.Header.Set("Content-Type", "application/json; charset=utf-8")
	if err := handler(e.NewContext(sameOriginRequest, httptest.NewRecorder())); err != nil {
		t.Fatalf("SecurityMiddleware() rejected the configured origin: %v", err)
	}

	missingContentTypeRequest := httptest.NewRequest(http.MethodPatch, "/api/auth/me/timezone", nil)
	missingContentTypeRequest.Header.Set("Origin", "http://127.0.0.1:5173")
	if err := handler(e.NewContext(missingContentTypeRequest, httptest.NewRecorder())); err == nil {
		t.Fatal("SecurityMiddleware() accepted a mutation without JSON content type")
	}
}

func TestJSONContentTypeAllowsOnlyApplicationJSON(t *testing.T) {
	e := echo.New()
	handler := SecurityMiddleware(config.Config{PublicBaseURL: "http://127.0.0.1:5173"})(func(echo.Context) error { return nil })

	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Origin", "http://127.0.0.1:5173")
	if err := handler(e.NewContext(request, httptest.NewRecorder())); err == nil {
		t.Fatal("SecurityMiddleware() accepted a form content type")
	}

	request.Header.Set("Content-Type", "application/json")
	if err := handler(e.NewContext(request, httptest.NewRecorder())); err != nil {
		t.Fatalf("SecurityMiddleware() rejected JSON content type: %v", err)
	}
}

func TestSecurityMiddlewareAllowsMultipartFileUploads(t *testing.T) {
	e := echo.New()
	handler := SecurityMiddleware(config.Config{PublicBaseURL: "http://127.0.0.1:5173"})(func(echo.Context) error { return nil })

	for _, path := range []string{"/api/files", "/api/imports"} {
		request := httptest.NewRequest(http.MethodPost, path, nil)
		request.Header.Set("Origin", "http://127.0.0.1:5173")
		request.Header.Set("Content-Type", "multipart/form-data; boundary=test-boundary")
		if err := handler(e.NewContext(request, httptest.NewRecorder())); err != nil {
			t.Fatalf("SecurityMiddleware() rejected multipart upload at %s: %v", path, err)
		}
	}
}

func TestSecurityMiddlewareRejectsMissingOriginOnMutation(t *testing.T) {
	e := echo.New()
	handler := SecurityMiddleware(config.Config{PublicBaseURL: "http://127.0.0.1:5173"})(func(echo.Context) error { return nil })

	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	request.Header.Set("Content-Type", "application/json")
	if err := handler(e.NewContext(request, httptest.NewRecorder())); err == nil {
		t.Fatal("SecurityMiddleware() accepted a mutation without Origin")
	}
}

func TestCookieNamesRequireHostCookiesWhenSecure(t *testing.T) {
	secureSession, secureCSRF := cookieNames(config.Config{CookieSecure: true})
	if secureSession != SessionCookieName || secureCSRF != csrfCookieName {
		t.Fatalf("secure cookie names = %q, %q", secureSession, secureCSRF)
	}
	devSession, devCSRF := cookieNames(config.Config{CookieSecure: false})
	if devSession == SessionCookieName || devCSRF == csrfCookieName {
		t.Fatal("development cookies used __Host- names without Secure")
	}
}

func TestAuthenticationRateLimiterLimitsOnlyTheConfiguredWindow(t *testing.T) {
	clock := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	limiter := newAuthenticationRateLimiter(2, time.Minute, func() time.Time { return clock })

	if !limiter.allow("192.0.2.10") || !limiter.allow("192.0.2.10") {
		t.Fatal("rate limiter rejected attempts before the limit")
	}
	if limiter.allow("192.0.2.10") {
		t.Fatal("rate limiter accepted an attempt after the limit")
	}
	if !limiter.allow("192.0.2.11") {
		t.Fatal("rate limiter shared state across client addresses")
	}

	clock = clock.Add(time.Minute)
	if !limiter.allow("192.0.2.10") {
		t.Fatal("rate limiter did not reset after its window")
	}
}

func TestAuthenticationRateLimitMiddlewareSkipsOtherRoutes(t *testing.T) {
	middleware := AuthenticationRateLimitMiddleware()
	handler := middleware(func(echo.Context) error { return nil })
	e := echo.New()

	request := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", nil)
	request.RemoteAddr = "192.0.2.20:1234"
	if err := handler(e.NewContext(request, httptest.NewRecorder())); err != nil {
		t.Fatalf("middleware limited a non-public authentication route: %v", err)
	}
}

func TestSecurityHeadersMiddlewareSetsBaselineHeaders(t *testing.T) {
	e := echo.New()
	handler := SecurityHeadersMiddleware(config.Config{})(func(ctx echo.Context) error {
		return ctx.NoContent(http.StatusNoContent)
	})
	recorder := httptest.NewRecorder()
	if err := handler(e.NewContext(httptest.NewRequest(http.MethodGet, "/api/health/live", nil), recorder)); err != nil {
		t.Fatalf("SecurityHeadersMiddleware() error = %v", err)
	}
	if recorder.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q", recorder.Header().Get("X-Content-Type-Options"))
	}
	if recorder.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatalf("Referrer-Policy = %q", recorder.Header().Get("Referrer-Policy"))
	}
	if recorder.Header().Get("Content-Security-Policy") == "" {
		t.Fatal("Content-Security-Policy was not set")
	}
	if recorder.Header().Get("Strict-Transport-Security") != "" {
		t.Fatal("HSTS was set for an insecure configuration")
	}
}

func TestSecurityHeadersMiddlewareSetsHSTSForSecureConfiguration(t *testing.T) {
	e := echo.New()
	handler := SecurityHeadersMiddleware(config.Config{CookieSecure: true})(func(ctx echo.Context) error {
		return ctx.NoContent(http.StatusNoContent)
	})
	recorder := httptest.NewRecorder()
	if err := handler(e.NewContext(httptest.NewRequest(http.MethodGet, "/api/health/live", nil), recorder)); err != nil {
		t.Fatalf("SecurityHeadersMiddleware() error = %v", err)
	}
	if recorder.Header().Get("Strict-Transport-Security") != "max-age=31536000; includeSubDomains" {
		t.Fatalf("Strict-Transport-Security = %q", recorder.Header().Get("Strict-Transport-Security"))
	}
}
