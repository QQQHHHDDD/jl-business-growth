package auth

import (
	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/config"
)

// SecurityHeadersMiddleware applies headers that are valid for both API and
// same-origin development traffic. HSTS is only emitted when HTTPS is enabled.
func SecurityHeadersMiddleware(cfg config.Config) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(ctx echo.Context) error {
			response := ctx.Response().Header()
			response.Set("X-Content-Type-Options", "nosniff")
			response.Set("Referrer-Policy", "no-referrer")
			response.Set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'")
			if cfg.CookieSecure {
				response.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			return next(ctx)
		}
	}
}
