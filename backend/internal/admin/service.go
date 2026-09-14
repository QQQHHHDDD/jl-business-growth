package admin

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/problem"
)

type Service struct {
	pool    *pgxpool.Pool
	queries *generated.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: generated.New(pool)}
}

func toAccount(value generated.Account) auth.Account {
	return auth.AccountFromGenerated(value)
}

func (s *Service) ListUsers(ctx context.Context, page, pageSize int) ([]auth.Account, int64, error) {
	page, pageSize = normalizePage(page, pageSize)
	items, err := s.queries.ListUsers(ctx, generated.ListUsersParams{Limit: int32(pageSize), Offset: int32((page - 1) * pageSize)})
	if err != nil {
		return nil, 0, err
	}
	total, err := s.queries.CountUsers(ctx)
	if err != nil {
		return nil, 0, err
	}
	accounts := make([]auth.Account, 0, len(items))
	for _, item := range items {
		accounts = append(accounts, toAccount(item))
	}
	return accounts, total, nil
}

func (s *Service) ListAdmins(ctx context.Context) ([]auth.Account, error) {
	items, err := s.queries.ListAdmins(ctx)
	if err != nil {
		return nil, err
	}
	accounts := make([]auth.Account, 0, len(items))
	for _, item := range items {
		accounts = append(accounts, toAccount(item))
	}
	return accounts, nil
}

func (s *Service) Account(ctx context.Context, id uuid.UUID) (auth.Account, error) {
	row, err := s.queries.GetAccountByID(ctx, auth.ToPGUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return auth.Account{}, problem.New("NOT_FOUND", http.StatusNotFound, "account not found")
	}
	if err != nil {
		return auth.Account{}, err
	}
	return toAccount(row), nil
}

func (s *Service) AccountRole(ctx context.Context, id uuid.UUID) (auth.AccountRole, error) {
	account, err := s.Account(ctx, id)
	if err != nil {
		return "", err
	}
	return account.Role, nil
}

func (s *Service) SetUserStatus(ctx context.Context, id uuid.UUID, status auth.AccountStatus) (auth.Account, error) {
	if err := validateStatus(status); err != nil {
		return auth.Account{}, err
	}
	target, err := s.queries.GetAccountByID(ctx, auth.ToPGUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return auth.Account{}, problem.New("NOT_FOUND", http.StatusNotFound, "user not found")
	}
	if err != nil {
		return auth.Account{}, err
	}
	if target.Role != generated.AccountRoleUSER {
		return auth.Account{}, problem.New("FORBIDDEN", http.StatusForbidden, "only normal users can be changed here")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return auth.Account{}, err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	updated, err := queries.SetAccountStatus(ctx, generated.SetAccountStatusParams{ID: auth.ToPGUUID(id), Status: generated.AccountStatus(status)})
	if err != nil {
		return auth.Account{}, err
	}
	if status == auth.StatusDisabled {
		if err := queries.DeleteAccountSessions(ctx, auth.ToPGUUID(id)); err != nil {
			return auth.Account{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return auth.Account{}, err
	}
	return toAccount(updated), nil
}

func (s *Service) DeleteUser(ctx context.Context, id uuid.UUID) error {
	target, err := s.queries.GetAccountByID(ctx, auth.ToPGUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New("NOT_FOUND", http.StatusNotFound, "user not found")
	}
	if err != nil {
		return err
	}
	if target.Role != generated.AccountRoleUSER {
		return problem.New("FORBIDDEN", http.StatusForbidden, "only normal users can be deleted here")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if err := queries.DeleteAccountSessions(ctx, auth.ToPGUUID(id)); err != nil {
		return err
	}
	if err := queries.DeleteAccount(ctx, auth.ToPGUUID(id)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) CreateAdmin(ctx context.Context, username, password string) (auth.Account, error) {
	if err := auth.ValidateUsername(username); err != nil {
		return auth.Account{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, err.Error())
	}
	if err := auth.ValidatePassword(password); err != nil {
		return auth.Account{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, err.Error())
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return auth.Account{}, err
	}
	row, err := s.queries.CreateAccount(ctx, generated.CreateAccountParams{ID: auth.ToPGUUID(uuid.New()), Username: strings.TrimSpace(username), PasswordHash: hash, Role: generated.AccountRoleADMIN, Timezone: "Asia/Shanghai"})
	if err != nil {
		if auth.IsUniqueViolation(err) {
			return auth.Account{}, problem.New("CONFLICT", http.StatusConflict, "username is already in use")
		}
		return auth.Account{}, err
	}
	return toAccount(row), nil
}

func (s *Service) SetAdminStatus(ctx context.Context, id uuid.UUID, status auth.AccountStatus) (auth.Account, error) {
	if err := validateStatus(status); err != nil {
		return auth.Account{}, err
	}
	target, err := s.queries.GetAccountByID(ctx, auth.ToPGUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return auth.Account{}, problem.New("NOT_FOUND", http.StatusNotFound, "administrator not found")
	}
	if err != nil {
		return auth.Account{}, err
	}
	if target.Role != generated.AccountRoleADMIN {
		return auth.Account{}, problem.New("FORBIDDEN", http.StatusForbidden, "fixed super administrator cannot be changed")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return auth.Account{}, err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	updated, err := queries.SetAccountStatus(ctx, generated.SetAccountStatusParams{ID: auth.ToPGUUID(id), Status: generated.AccountStatus(status)})
	if err != nil {
		return auth.Account{}, err
	}
	if status == auth.StatusDisabled {
		if err := queries.DeleteAccountSessions(ctx, auth.ToPGUUID(id)); err != nil {
			return auth.Account{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return auth.Account{}, err
	}
	return toAccount(updated), nil
}

func (s *Service) DeleteAdmin(ctx context.Context, id uuid.UUID) error {
	target, err := s.queries.GetAccountByID(ctx, auth.ToPGUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New("NOT_FOUND", http.StatusNotFound, "administrator not found")
	}
	if err != nil {
		return err
	}
	if target.Role != generated.AccountRoleADMIN {
		return problem.New("FORBIDDEN", http.StatusForbidden, "fixed super administrator cannot be deleted")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if err := queries.DeleteAccountSessions(ctx, auth.ToPGUUID(id)); err != nil {
		return err
	}
	if err := queries.DeleteAccount(ctx, auth.ToPGUUID(id)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ResetPassword(ctx context.Context, id uuid.UUID, supplied *string) (string, error) {
	target, err := s.queries.GetAccountByID(ctx, auth.ToPGUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return "", problem.New("NOT_FOUND", http.StatusNotFound, "account not found")
	}
	if err != nil {
		return "", err
	}
	if target.Role != generated.AccountRoleUSER && target.Role != generated.AccountRoleADMIN {
		return "", problem.New("FORBIDDEN", http.StatusForbidden, "fixed super administrator password cannot be reset here")
	}
	temporaryPassword := ""
	if supplied != nil {
		temporaryPassword = *supplied
	} else {
		temporaryPassword, err = generateTemporaryPassword()
		if err != nil {
			return "", err
		}
	}
	if err := auth.ValidatePassword(temporaryPassword); err != nil {
		return "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, err.Error())
	}
	hash, err := auth.HashPassword(temporaryPassword)
	if err != nil {
		return "", err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	queries := s.queries.WithTx(tx)
	if err := queries.UpdatePassword(ctx, generated.UpdatePasswordParams{ID: auth.ToPGUUID(id), PasswordHash: hash}); err != nil {
		return "", err
	}
	if err := queries.DeleteAccountSessions(ctx, auth.ToPGUUID(id)); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return temporaryPassword, nil
}

func normalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func generateTemporaryPassword() (string, error) {
	const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%"
	value := make([]byte, 18)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	for index := range value {
		value[index] = alphabet[int(value[index])%len(alphabet)]
	}
	return string(value), nil
}

func validateStatus(status auth.AccountStatus) error {
	if status != auth.StatusActive && status != auth.StatusDisabled {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "status is invalid")
	}
	return nil
}
