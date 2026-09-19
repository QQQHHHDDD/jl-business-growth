package invitation

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/problem"
)

type Service struct {
	pool    *pgxpool.Pool
	queries *generated.Queries
}

type Invitation struct {
	ID        uuid.UUID
	Code      string
	Status    string
	MaxUses   *int
	UsedCount int
	ExpiresAt *time.Time
	CreatedAt time.Time
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: generated.New(pool)}
}

func fromGenerated(value generated.InvitationCode) Invitation {
	result := Invitation{Code: value.Code, Status: string(value.Status), UsedCount: int(value.UsedCount)}
	result.ID, _ = uuidFromPG(value.ID)
	if value.MaxUses.Valid {
		maxUses := int(value.MaxUses.Int32)
		result.MaxUses = &maxUses
	}
	if value.ExpiresAt.Valid {
		expiresAt := value.ExpiresAt.Time
		result.ExpiresAt = &expiresAt
	}
	result.CreatedAt = value.CreatedAt.Time
	return result
}

func uuidFromPG(value pgtype.UUID) (uuid.UUID, bool) {
	if !value.Valid {
		return uuid.Nil, false
	}
	return value.Bytes, true
}

func (s *Service) List(ctx context.Context) ([]Invitation, error) {
	rows, err := s.queries.ListInvitations(ctx)
	if err != nil {
		return nil, err
	}
	items := make([]Invitation, 0, len(rows))
	for _, row := range rows {
		items = append(items, fromGenerated(row))
	}
	return items, nil
}

func (s *Service) Create(ctx context.Context, actor uuid.UUID, code *string, maxUses *int, expiresAt *time.Time) (Invitation, error) {
	value := ""
	if code != nil {
		value = strings.TrimSpace(*code)
	}
	if value == "" {
		var err error
		value, err = generateCode()
		if err != nil {
			return Invitation{}, err
		}
	}
	value = strings.ToUpper(value)
	if len(value) < 8 || len(value) > 64 {
		return Invitation{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "invitation code must be 8 to 64 characters")
	}
	if maxUses != nil && *maxUses < 1 {
		return Invitation{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "max_uses must be positive")
	}
	row, err := s.queries.CreateInvitation(ctx, generated.CreateInvitationParams{
		ID:        auth.ToPGUUID(uuid.New()),
		Code:      value,
		MaxUses:   nullableInt(maxUses),
		ExpiresAt: nullableTime(expiresAt),
		CreatedBy: auth.ToPGUUID(actor),
	})
	if err != nil {
		if auth.IsUniqueViolation(err) {
			return Invitation{}, problem.New("CONFLICT", http.StatusConflict, "invitation code already exists")
		}
		return Invitation{}, err
	}
	return fromGenerated(row), nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, status *string, maxUses *int, expiresAt *time.Time, clearMaxUses, clearExpiresAt bool) (Invitation, error) {
	if clearMaxUses {
		maxUses = nil
	}
	if clearExpiresAt {
		expiresAt = nil
	}
	if maxUses != nil && *maxUses < 1 {
		return Invitation{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "max_uses must be positive")
	}
	if status != nil && *status != "ACTIVE" && *status != "DISABLED" {
		return Invitation{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "status is invalid")
	}
	row, err := s.queries.UpdateInvitation(ctx, generated.UpdateInvitationParams{
		ID:           auth.ToPGUUID(id),
		Status:       nullableInvitationStatus(status),
		SetMaxUses:   maxUses != nil || clearMaxUses,
		MaxUses:      nullableInt(maxUses),
		SetExpiresAt: expiresAt != nil || clearExpiresAt,
		ExpiresAt:    nullableTime(expiresAt),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Invitation{}, problem.New("NOT_FOUND", http.StatusNotFound, "invitation code not found")
	}
	if err != nil {
		return Invitation{}, err
	}
	return fromGenerated(row), nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.queries.DeleteInvitation(ctx, auth.ToPGUUID(id))
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New("NOT_FOUND", http.StatusNotFound, "invitation code not found")
	}
	return err
}

func nullableInt(value *int) pgtype.Int4 {
	if value == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*value), Valid: true}
}

func nullableTime(value *time.Time) pgtype.Timestamptz {
	if value == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: value.UTC(), Valid: true}
}

func nullableInvitationStatus(value *string) generated.NullInvitationStatus {
	if value == nil {
		return generated.NullInvitationStatus{}
	}
	return generated.NullInvitationStatus{InvitationStatus: generated.InvitationStatus(*value), Valid: true}
}

func generateCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	for index := range bytes {
		bytes[index] = alphabet[int(bytes[index])%len(alphabet)]
	}
	return string(bytes), nil
}
