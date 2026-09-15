package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	minPasswordLength = 10
	maxPasswordLength = 128
	argonMemory       = 64 * 1024
	argonIterations   = 3
	argonParallelism  = 2
	argonKeyLength    = 32
	argonSaltLength   = 16
	// A single derivation reserves 64 MiB. Bound concurrent login and password
	// change work so a burst cannot exhaust the process heap.
	argonMaxConcurrent = 4
)

var argonDerivations = make(chan struct{}, argonMaxConcurrent)

func ValidatePassword(password string) error {
	length := utf8.RuneCountInString(password)
	if length < minPasswordLength || length > maxPasswordLength {
		return fmt.Errorf("password must be between %d and %d characters", minPasswordLength, maxPasswordLength)
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	salt := make([]byte, argonSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	key := deriveArgon2IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemory, argonIterations, argonParallelism,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

func CheckPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false
	}
	var memory, iterations, parallelism uint32
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil || memory == 0 || iterations == 0 || parallelism == 0 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) == 0 {
		return false
	}
	actual := deriveArgon2IDKey([]byte(password), salt, iterations, memory, uint8(parallelism), uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func deriveArgon2IDKey(password, salt []byte, iterations, memory uint32, parallelism uint8, keyLength uint32) []byte {
	argonDerivations <- struct{}{}
	defer func() { <-argonDerivations }()
	return argon2.IDKey(password, salt, iterations, memory, parallelism, keyLength)
}

func ValidateUsername(username string) error {
	if strings.TrimSpace(username) != username || username == "" || utf8.RuneCountInString(username) > 32 || strings.IndexFunc(username, func(r rune) bool { return r == '\u0000' || r == '\n' || r == '\r' || r == '\t' }) >= 0 {
		return errors.New("username must be 1 to 32 characters without surrounding whitespace")
	}
	return nil
}
