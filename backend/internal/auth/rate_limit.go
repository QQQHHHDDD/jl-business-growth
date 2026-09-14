package auth

import (
	"net/http"
	"sync"
	"time"

	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/problem"
)

const (
	authenticationRateLimitAttempts = 10
	authenticationRateLimitWindow   = time.Minute
)

type rateLimitEntry struct {
	startedAt time.Time
	attempts  int
}

type authenticationRateLimiter struct {
	mu          sync.Mutex
	entries     map[string]rateLimitEntry
	maxAttempts int
	window      time.Duration
	now         func() time.Time
}

func newAuthenticationRateLimiter(maxAttempts int, window time.Duration, now func() time.Time) *authenticationRateLimiter {
	if maxAttempts < 1 {
		maxAttempts = authenticationRateLimitAttempts
	}
	if window <= 0 {
		window = authenticationRateLimitWindow
	}
	if now == nil {
		now = time.Now
	}
	return &authenticationRateLimiter{
		entries:     make(map[string]rateLimitEntry),
		maxAttempts: maxAttempts,
		window:      window,
		now:         now,
	}
}

func (limiter *authenticationRateLimiter) allow(identifier string) bool {
	now := limiter.now()
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	for key, entry := range limiter.entries {
		if now.Sub(entry.startedAt) >= limiter.window {
			delete(limiter.entries, key)
		}
	}

	entry, ok := limiter.entries[identifier]
	if !ok || now.Sub(entry.startedAt) >= limiter.window {
		limiter.entries[identifier] = rateLimitEntry{startedAt: now, attempts: 1}
		return true
	}
	if entry.attempts >= limiter.maxAttempts {
		return false
	}
	entry.attempts++
	limiter.entries[identifier] = entry
	return true
}

// AuthenticationRateLimitMiddleware limits the public login and registration
// endpoints by client address. Nginx provides an outer rate limit in
// production; this application-level guard also protects direct local access.
func AuthenticationRateLimitMiddleware() echo.MiddlewareFunc {
	limiter := newAuthenticationRateLimiter(authenticationRateLimitAttempts, authenticationRateLimitWindow, time.Now)
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(ctx echo.Context) error {
			request := ctx.Request()
			if request.Method != http.MethodPost || (request.URL.Path != "/api/auth/login" && request.URL.Path != "/api/auth/register") {
				return next(ctx)
			}
			if limiter.allow(ctx.RealIP()) {
				return next(ctx)
			}
			ctx.Response().Header().Set(echo.HeaderRetryAfter, "60")
			return problem.New("RATE_LIMITED", http.StatusTooManyRequests, "too many authentication attempts; try again later")
		}
	}
}
