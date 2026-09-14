package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/problem"
)

type Service struct {
	pool    *pgxpool.Pool
	queries *generated.Queries
	cfg     config.Config
}

func NewService(pool *pgxpool.Pool, cfg config.Config) *Service {
	return &Service{pool: pool, queries: generated.New(pool), cfg: cfg}
}

func (s *Service) BootstrapSuperAdmin(ctx context.Context) error {
	account, err := s.queries.GetSuperAdmin(ctx)
	if err == nil {
		if s.cfg.SuperadminUsername != "" && !strings.EqualFold(account.Username, s.cfg.SuperadminUsername) {
			return errors.New("existing super administrator username does not match configured fixed username")
		}
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err := validateSuperAdminBootstrapConfig(s.cfg.SuperadminUsername, s.cfg.SuperadminPassword); err != nil {
		return err
	}
	if err := ValidateUsername(s.cfg.SuperadminUsername); err != nil {
		return errors.New("SUPERADMIN_USERNAME is invalid")
	}
	hash, err := HashPassword(s.cfg.SuperadminPassword)
	if err != nil {
		return errors.New("SUPERADMIN_INITIAL_PASSWORD is invalid")
	}
	_, err = s.queries.CreateAccount(ctx, generated.CreateAccountParams{ID: toPGUUID(uuid.New()), Username: s.cfg.SuperadminUsername, PasswordHash: hash, Role: generated.AccountRoleSUPERADMIN, Timezone: "Asia/Shanghai"})
	if isUniqueViolation(err) {
		account, lookupErr := s.queries.GetSuperAdmin(ctx)
		if lookupErr == nil && strings.EqualFold(account.Username, s.cfg.SuperadminUsername) {
			return nil
		}
		if lookupErr != nil && !errors.Is(lookupErr, pgx.ErrNoRows) {
			return lookupErr
		}
	}
	return err
}

func (s *Service) FindAccount(ctx context.Context, username string) (Account, error) {
	row, err := s.queries.GetAccountByUsername(ctx, strings.TrimSpace(username))
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, problem.New("PASSWORD_INCORRECT", http.StatusUnauthorized, "username or password is incorrect")
	}
	if err != nil {
		return Account{}, err
	}
	return fromGeneratedAccount(row), nil
}

func (s *Service) Register(ctx context.Context, username, password, invitationCode string) (Account, error) {
	invitationCode = strings.TrimSpace(invitationCode)
	if err := ValidateUsername(username); err != nil {
		return Account{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, err.Error())
	}
	if err := ValidatePassword(password); err != nil {
		return Account{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, err.Error())
	}
	if invitationCode == "" {
		return Account{}, problem.New("INVITATION_INVALID", http.StatusBadRequest, "invitation code is required")
	}
	hash, err := HashPassword(password)
	if err != nil {
		return Account{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, err.Error())
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	invitation, err := queries.GetInvitationByCode(ctx, invitationCode)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, problem.New("INVITATION_INVALID", http.StatusBadRequest, "invitation code is invalid")
	}
	if err != nil {
		return Account{}, err
	}
	if invitation.Status != generated.InvitationStatusACTIVE {
		return Account{}, problem.New("INVITATION_INVALID", http.StatusBadRequest, "invitation code is disabled")
	}
	if invitation.ExpiresAt.Valid && !invitation.ExpiresAt.Time.After(time.Now()) {
		return Account{}, problem.New("INVITATION_EXPIRED", http.StatusBadRequest, "invitation code has expired")
	}
	if invitation.MaxUses.Valid && invitation.UsedCount >= invitation.MaxUses.Int32 {
		return Account{}, problem.New("INVITATION_EXHAUSTED", http.StatusConflict, "invitation code has no remaining uses")
	}
	consumed, err := queries.ConsumeInvitation(ctx, invitation.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, problem.New("INVITATION_EXHAUSTED", http.StatusConflict, "invitation code has no remaining uses")
	}
	if err != nil {
		return Account{}, err
	}
	accountID := uuid.New()
	account, err := queries.CreateAccount(ctx, generated.CreateAccountParams{ID: toPGUUID(accountID), Username: username, PasswordHash: hash, Role: generated.AccountRoleUSER, Timezone: "Asia/Shanghai"})
	if err != nil {
		if isUniqueViolation(err) {
			return Account{}, problem.New("CONFLICT", http.StatusConflict, "username is already in use")
		}
		return Account{}, err
	}
	if err := queries.RecordInvitationUse(ctx, generated.RecordInvitationUseParams{InvitationCodeID: consumed.ID, AccountID: toPGUUID(accountID)}); err != nil {
		return Account{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Account{}, err
	}
	return fromGeneratedAccount(account), nil
}

func (s *Service) Authenticate(ctx context.Context, username, password string) (Account, error) {
	account, err := s.FindAccount(ctx, username)
	if err != nil {
		if known, ok := problem.As(err); ok && known.Code == "PASSWORD_INCORRECT" {
			return Account{}, known
		}
		return Account{}, err
	}
	if !CheckPassword(password, account.Password) {
		return Account{}, problem.New("PASSWORD_INCORRECT", http.StatusUnauthorized, "username or password is incorrect")
	}
	if account.Status != StatusActive {
		return Account{}, problem.New("ACCOUNT_DISABLED", http.StatusForbidden, "account is disabled")
	}
	if err := s.queries.UpdateLastLogin(ctx, toPGUUID(account.ID)); err != nil {
		return Account{}, err
	}
	return account, nil
}

func (s *Service) ChangePassword(ctx context.Context, account Account, currentPassword, newPassword string) error {
	if !CheckPassword(currentPassword, account.Password) {
		return problem.New("PASSWORD_INCORRECT", http.StatusBadRequest, "current password is incorrect")
	}
	if err := ValidatePassword(newPassword); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, err.Error())
	}
	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if err := queries.UpdatePassword(ctx, generated.UpdatePasswordParams{ID: toPGUUID(account.ID), PasswordHash: hash}); err != nil {
		return err
	}
	if err := queries.DeleteAccountSessions(ctx, toPGUUID(account.ID)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ResetConfiguredSuperAdminPassword is intentionally limited to non-production
// environments. It is a recovery path for a local database whose fixed
// administrator was initialized before the configured password was changed.
func (s *Service) ResetConfiguredSuperAdminPassword(ctx context.Context) error {
	if s.cfg.AppEnv == "production" {
		return errors.New("super administrator password reset is disabled in production")
	}
	if err := validateSuperAdminBootstrapConfig(s.cfg.SuperadminUsername, s.cfg.SuperadminPassword); err != nil {
		return err
	}
	account, err := s.queries.GetSuperAdmin(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("super administrator does not exist; start the API once to initialize it")
	}
	if err != nil {
		return err
	}
	if !strings.EqualFold(account.Username, s.cfg.SuperadminUsername) {
		return errors.New("existing super administrator username does not match configured fixed username")
	}
	hash, err := HashPassword(s.cfg.SuperadminPassword)
	if err != nil {
		return errors.New("SUPERADMIN_INITIAL_PASSWORD is invalid")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if err := queries.UpdatePassword(ctx, generated.UpdatePasswordParams{ID: account.ID, PasswordHash: hash}); err != nil {
		return err
	}
	if err := queries.DeleteAccountSessions(ctx, account.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) UpdateTimezone(ctx context.Context, accountID uuid.UUID, timezone string) (Account, error) {
	if len(timezone) == 0 || len(timezone) > 64 {
		return Account{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "timezone is invalid")
	}
	if _, err := time.LoadLocation(timezone); err != nil {
		return Account{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "timezone must be a valid IANA timezone")
	}
	row, err := s.queries.UpdateTimezone(ctx, generated.UpdateTimezoneParams{ID: toPGUUID(accountID), Timezone: timezone})
	if err != nil {
		return Account{}, err
	}
	return fromGeneratedAccount(row), nil
}

// LinkBrowserAccount authenticates the already-checked account into the
// browser session and makes it active as one atomic state transition.
func (s *Service) LinkBrowserAccount(ctx context.Context, sessionID, accountID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	queries := s.queries.WithTx(tx)
	if err := queries.AddBrowserSessionAccount(ctx, generated.AddBrowserSessionAccountParams{
		BrowserSessionID: toPGUUID(sessionID),
		AccountID:        toPGUUID(accountID),
	}); err != nil {
		return err
	}
	if _, err := queries.SetActiveAccount(ctx, generated.SetActiveAccountParams{
		ID:              toPGUUID(sessionID),
		ActiveAccountID: toPGUUID(accountID),
	}); errors.Is(err, pgx.ErrNoRows) {
		return problem.New("FORBIDDEN", http.StatusForbidden, "account is not available for this browser session")
	} else if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) Queries() *generated.Queries { return s.queries }
func (s *Service) Pool() *pgxpool.Pool         { return s.pool }
func (s *Service) Config() config.Config       { return s.cfg }

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	var pgError *pgconn.PgError
	if errors.As(err, &pgError) {
		return pgError.Code == "23505"
	}
	return strings.Contains(err.Error(), "duplicate key value") || strings.Contains(err.Error(), "unique constraint")
}

func IsUniqueViolation(err error) bool { return isUniqueViolation(err) }

func validateSuperAdminBootstrapConfig(username, password string) error {
	if username == "" || password == "" {
		return errors.New("SUPERADMIN_USERNAME and SUPERADMIN_INITIAL_PASSWORD must be configured together before first startup")
	}
	return nil
}

func ToPGUUID(value uuid.UUID) pgtype.UUID { return toPGUUID(value) }
