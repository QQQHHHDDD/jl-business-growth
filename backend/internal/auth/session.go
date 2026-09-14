package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"mime"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/problem"
)

const (
	SessionCookieName = "__Host-bos_session"
	csrfCookieName    = "__Host-bos_csrf"
	devSessionCookie  = "bos_session"
	devCSRFCookie     = "bos_csrf"
	userSessionMaxAge = 90 * 24 * time.Hour
)

type AccountRole string

const (
	RoleUser       AccountRole = "USER"
	RoleAdmin      AccountRole = "ADMIN"
	RoleSuperAdmin AccountRole = "SUPER_ADMIN"
)

type AccountStatus string

const (
	StatusActive   AccountStatus = "ACTIVE"
	StatusDisabled AccountStatus = "DISABLED"
)

type Account struct {
	ID          uuid.UUID
	Username    string
	Password    string
	Role        AccountRole
	Status      AccountStatus
	Timezone    string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	LastLoginAt *time.Time
}

type Session struct {
	ID              uuid.UUID
	ActiveAccountID *uuid.UUID
	CSRFTokenHash   []byte
	CreatedAt       time.Time
	LastSeenAt      time.Time
	ExpiresAt       time.Time
}

type SessionAccount struct {
	Account
	Active bool
}

func toPGUUID(value uuid.UUID) pgtype.UUID { return pgtype.UUID{Bytes: value, Valid: true} }

func fromPGUUID(value pgtype.UUID) (uuid.UUID, bool) {
	if !value.Valid {
		return uuid.Nil, false
	}
	return value.Bytes, true
}

func fromPGTime(value pgtype.Timestamptz) (time.Time, bool) {
	if !value.Valid {
		return time.Time{}, false
	}
	return value.Time, true
}

func fromGeneratedAccount(value generated.Account) Account {
	account := Account{
		Username: value.Username,
		Password: value.PasswordHash,
		Role:     AccountRole(value.Role),
		Status:   AccountStatus(value.Status),
		Timezone: value.Timezone,
	}
	account.ID, _ = fromPGUUID(value.ID)
	account.CreatedAt, _ = fromPGTime(value.CreatedAt)
	account.UpdatedAt, _ = fromPGTime(value.UpdatedAt)
	if lastLogin, ok := fromPGTime(value.LastLoginAt); ok {
		account.LastLoginAt = &lastLogin
	}
	return account
}

// AccountFromGenerated keeps transport/domain packages independent of sqlc's
// generated representation while preserving the password hash for auth use.
func AccountFromGenerated(value generated.Account) Account { return fromGeneratedAccount(value) }

func fromGeneratedSession(value generated.BrowserSession) Session {
	session := Session{CSRFTokenHash: value.CsrfTokenHash}
	session.ID, _ = fromPGUUID(value.ID)
	session.CreatedAt, _ = fromPGTime(value.CreatedAt)
	session.LastSeenAt, _ = fromPGTime(value.LastSeenAt)
	session.ExpiresAt, _ = fromPGTime(value.ExpiresAt)
	if activeID, ok := fromPGUUID(value.ActiveAccountID); ok {
		session.ActiveAccountID = &activeID
	}
	return session
}

func randomToken() (string, []byte, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", nil, err
	}
	return base64.RawURLEncoding.EncodeToString(value), hashToken(value), nil
}

func hashToken(value []byte) []byte {
	hash := sha256.Sum256(value)
	return hash[:]
}

func hashTokenString(value string) []byte {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil
	}
	return hashToken(decoded)
}

func CreateSession(ctx echo.Context, pool *pgxpool.Pool, cfg config.Config, accountID uuid.UUID, linkAccount bool) (string, string, *Session, error) {
	token, tokenHash, err := randomToken()
	if err != nil {
		return "", "", nil, err
	}
	csrfToken, csrfHash, err := randomToken()
	if err != nil {
		return "", "", nil, err
	}
	now := time.Now().UTC()
	sessionID := uuid.New()
	expires := now.Add(userSessionMaxAge)
	queries := generated.New(pool)
	tx, err := pool.Begin(ctx.Request().Context())
	if err != nil {
		return "", "", nil, err
	}
	defer tx.Rollback(ctx.Request().Context())
	txQueries := queries.WithTx(tx)
	if _, err := txQueries.CreateBrowserSession(ctx.Request().Context(), generated.CreateBrowserSessionParams{
		SessionID:     toPGUUID(sessionID),
		TokenHash:     tokenHash,
		CsrfTokenHash: csrfHash,
		ExpiresAt:     pgtype.Timestamptz{Time: expires, Valid: true},
		AccountID:     toPGUUID(accountID),
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil, problem.New("ACCOUNT_DISABLED", http.StatusForbidden, "account is disabled")
		}
		return "", "", nil, err
	}
	if linkAccount {
		if err := txQueries.AddBrowserSessionAccount(ctx.Request().Context(), generated.AddBrowserSessionAccountParams{BrowserSessionID: toPGUUID(sessionID), AccountID: toPGUUID(accountID)}); err != nil {
			return "", "", nil, err
		}
	}
	if err := tx.Commit(ctx.Request().Context()); err != nil {
		return "", "", nil, err
	}
	setSessionCookies(ctx, cfg, token, csrfToken, int(userSessionMaxAge/time.Second))
	session := &Session{ID: sessionID, ActiveAccountID: &accountID, CSRFTokenHash: csrfHash, CreatedAt: now, LastSeenAt: now, ExpiresAt: expires}
	ctx.Set(sessionContextKey, session)
	ctx.Set(csrfContextKey, csrfToken)
	return token, csrfToken, session, nil
}

func setSessionCookies(ctx echo.Context, cfg config.Config, sessionToken, csrfToken string, maxAge int) {
	sessionName, csrfName := cookieNames(cfg)
	http.SetCookie(ctx.Response(), &http.Cookie{Name: sessionName, Value: sessionToken, Path: "/", HttpOnly: true, Secure: cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
	http.SetCookie(ctx.Response(), &http.Cookie{Name: csrfName, Value: csrfToken, Path: "/", HttpOnly: false, Secure: cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}

func cookieNames(cfg config.Config) (string, string) {
	// __Host- cookies are rejected by browsers over plain HTTP. Development uses
	// the same server-side session model with a scoped name; production keeps the
	// required __Host- prefix and must set COOKIE_SECURE=true.
	if !cfg.CookieSecure {
		return devSessionCookie, devCSRFCookie
	}
	return SessionCookieName, csrfCookieName
}

func LoadSession(ctx echo.Context, pool *pgxpool.Pool, cfg config.Config) (*Session, *Account, error) {
	sessionName, csrfName := cookieNames(cfg)
	cookie, err := ctx.Cookie(sessionName)
	if err != nil || cookie.Value == "" {
		return nil, nil, problem.New("UNAUTHENTICATED", http.StatusUnauthorized, "authentication required")
	}
	tokenHash := hashTokenString(cookie.Value)
	if tokenHash == nil {
		return nil, nil, problem.New("UNAUTHENTICATED", http.StatusUnauthorized, "authentication required")
	}
	queries := generated.New(pool)
	sessionRow, err := queries.GetBrowserSession(ctx.Request().Context(), tokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, problem.New("UNAUTHENTICATED", http.StatusUnauthorized, "authentication required")
	}
	if err != nil {
		return nil, nil, err
	}
	session := fromGeneratedSession(sessionRow)
	if session.ActiveAccountID == nil {
		return nil, nil, problem.New("UNAUTHENTICATED", http.StatusUnauthorized, "authentication required")
	}
	accountRow, err := queries.GetAccountByID(ctx.Request().Context(), toPGUUID(*session.ActiveAccountID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, problem.New("UNAUTHENTICATED", http.StatusUnauthorized, "authentication required")
	}
	if err != nil {
		return nil, nil, err
	}
	account := fromGeneratedAccount(accountRow)
	if account.Status != StatusActive {
		return nil, nil, problem.New("ACCOUNT_DISABLED", http.StatusForbidden, "account is disabled")
	}
	_ = queries.TouchBrowserSession(ctx.Request().Context(), toPGUUID(session.ID))
	ctx.Set(sessionContextKey, &session)
	ctx.Set(accountContextKey, &account)
	if csrfCookie, cookieErr := ctx.Cookie(csrfName); cookieErr == nil {
		ctx.Set(csrfContextKey, csrfCookie.Value)
	}
	return &session, &account, nil
}

func DestroySession(ctx echo.Context, pool *pgxpool.Pool, cfg config.Config) {
	if session, ok := ctx.Get(sessionContextKey).(*Session); ok && session != nil {
		_ = generated.New(pool).DeleteBrowserSession(ctx.Request().Context(), toPGUUID(session.ID))
	}
	sessionName, csrfName := cookieNames(cfg)
	http.SetCookie(ctx.Response(), &http.Cookie{Name: sessionName, Value: "", Path: "/", HttpOnly: true, Secure: cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	http.SetCookie(ctx.Response(), &http.Cookie{Name: csrfName, Value: "", Path: "/", HttpOnly: false, Secure: cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}

func SessionFromContext(ctx echo.Context) (*Session, *Account, error) {
	session, sessionOK := ctx.Get(sessionContextKey).(*Session)
	account, accountOK := ctx.Get(accountContextKey).(*Account)
	if !sessionOK || !accountOK || session == nil || account == nil {
		return nil, nil, problem.New("UNAUTHENTICATED", http.StatusUnauthorized, "authentication required")
	}
	return session, account, nil
}

func CSRFTokenFromContext(ctx echo.Context) string {
	token, _ := ctx.Get(csrfContextKey).(string)
	return token
}

func VerifyCSRF(ctx echo.Context, session *Session) error {
	provided := ctx.Request().Header.Get("X-CSRF-Token")
	if provided == "" || session == nil || !equalBytes(hashTokenString(provided), session.CSRFTokenHash) {
		return problem.New("FORBIDDEN", http.StatusForbidden, "invalid CSRF token")
	}
	return nil
}

func equalBytes(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	var result byte
	for index := range left {
		result |= left[index] ^ right[index]
	}
	return result == 0
}

func SecurityMiddleware(cfg config.Config) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(ctx echo.Context) error {
			method := ctx.Request().Method
			if method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch || method == http.MethodDelete {
				if err := validateOrigin(ctx, cfg); err != nil {
					return err
				}
				if err := validateJSONContentType(ctx); err != nil {
					return err
				}
			}
			return next(ctx)
		}
	}
}

func validateJSONContentType(ctx echo.Context) error {
	mediaType, _, err := mime.ParseMediaType(ctx.Request().Header.Get(echo.HeaderContentType))
	if err != nil || mediaType != "application/json" {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "JSON content type is required")
	}
	return nil
}

// SessionMiddleware loads the active account for every protected API request.
// The public endpoints are deliberately explicit so adding a new endpoint does
// not accidentally create an unauthenticated route.
func SessionMiddleware(pool *pgxpool.Pool, cfg config.Config) echo.MiddlewareFunc {
	public := map[string]struct{}{
		"/api/health/live":   {},
		"/api/health/ready":  {},
		"/api/auth/login":    {},
		"/api/auth/register": {},
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(ctx echo.Context) error {
			if _, ok := public[ctx.Request().URL.Path]; ok {
				return next(ctx)
			}
			if _, _, err := LoadSession(ctx, pool, cfg); err != nil {
				return err
			}
			return next(ctx)
		}
	}
}

func validateOrigin(ctx echo.Context, cfg config.Config) error {
	if fetchSite := ctx.Request().Header.Get("Sec-Fetch-Site"); fetchSite == "cross-site" {
		return problem.New("FORBIDDEN", http.StatusForbidden, "cross-site request rejected")
	}
	origin := ctx.Request().Header.Get("Origin")
	if origin == "" || cfg.PublicBaseURL == "" {
		return problem.New("FORBIDDEN", http.StatusForbidden, "request origin rejected")
	}
	configured, err := http.NewRequest(http.MethodGet, cfg.PublicBaseURL, nil)
	if err != nil {
		return problem.New("FORBIDDEN", http.StatusForbidden, "request origin rejected")
	}
	requested, err := http.NewRequest(http.MethodGet, origin, nil)
	if err != nil || requested.URL.Scheme != configured.URL.Scheme || requested.URL.Host != configured.URL.Host {
		return problem.New("FORBIDDEN", http.StatusForbidden, "request origin rejected")
	}
	return nil
}

const (
	sessionContextKey = "auth.session"
	accountContextKey = "auth.account"
	csrfContextKey    = "auth.csrf"
)
