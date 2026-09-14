package auth

import (
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestHashPasswordUsesArgon2idAndVerifies(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if len(hash) < 40 || hash[:10] != "$argon2id$" {
		t.Fatalf("hash = %q, want argon2id encoded hash", hash)
	}
	if !CheckPassword("correct horse battery", hash) {
		t.Fatal("CheckPassword() rejected the original password")
	}
	if CheckPassword("wrong password", hash) {
		t.Fatal("CheckPassword() accepted a wrong password")
	}
}

func TestValidatePasswordUsesCharacterBounds(t *testing.T) {
	if err := ValidatePassword("123456789"); err == nil {
		t.Fatal("ValidatePassword() accepted a 9-character password")
	}
	if err := ValidatePassword("1234567890"); err != nil {
		t.Fatalf("ValidatePassword() rejected the minimum password: %v", err)
	}
	if err := ValidatePassword(strings.Repeat("1", 128)); err != nil {
		t.Fatalf("ValidatePassword() rejected a 128-character password: %v", err)
	}
	if err := ValidatePassword(strings.Repeat("1", 129)); err == nil {
		t.Fatal("ValidatePassword() accepted a 129-character password")
	}
}

func TestSuperAdminBootstrapRequiresBothInitialCredentials(t *testing.T) {
	if err := validateSuperAdminBootstrapConfig("", ""); err == nil {
		t.Fatal("bootstrap accepted missing super administrator credentials")
	}
	if err := validateSuperAdminBootstrapConfig("superadmin", ""); err == nil {
		t.Fatal("bootstrap accepted a missing initial password")
	}
	if err := validateSuperAdminBootstrapConfig("", "correct horse battery"); err == nil {
		t.Fatal("bootstrap accepted a missing username")
	}
	if err := validateSuperAdminBootstrapConfig("superadmin", "correct horse battery"); err != nil {
		t.Fatalf("bootstrap rejected a complete credential pair: %v", err)
	}
}

func TestUniqueViolationCheckHandlesNil(t *testing.T) {
	if isUniqueViolation(nil) {
		t.Fatal("nil was classified as a unique violation")
	}
}

func TestUniqueViolationCheckRecognizesPostgresErrorCode(t *testing.T) {
	err := &pgconn.PgError{Code: "23505", Message: "duplicate key value violates unique constraint"}
	if !isUniqueViolation(err) {
		t.Fatal("PostgreSQL unique violation was not recognized")
	}
	if isUniqueViolation(errors.New("connection reset by peer")) {
		t.Fatal("non-unique database error was misclassified")
	}
}
