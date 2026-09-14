package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/joho/godotenv"
)

const (
	development = "development"
	test        = "test"
	production  = "production"
)

type Config struct {
	AppEnv              string
	DatabaseURL         string
	PublicBaseURL       string
	SessionSecret       string
	CookieSecure        bool
	SuperadminUsername  string
	SuperadminPassword  string
	MailMode            string
	FileRoot            string
	MailOutboxRoot      string
	MaxDocumentUploadMB int
	MaxImageUploadMB    int
	ListenAddr          string
}

func Load() (Config, error) {
	fileValues, err := loadFileValues()
	if err != nil {
		return Config{}, err
	}

	env := value(fileValues, "APP_ENV", development)
	if env != development && env != test && env != production {
		return Config{}, fmt.Errorf("APP_ENV must be development, test, or production")
	}

	root := projectRoot()
	fileRoot := resolvePath(root, value(fileValues, "FILE_ROOT", "./.local/files"))
	mailOutboxRoot := filepath.Join(filepath.Dir(fileRoot), "mail-outbox")
	documentLimit, err := positiveInt(value(fileValues, "MAX_DOCUMENT_UPLOAD_MB", "50"))
	if err != nil {
		return Config{}, fmt.Errorf("MAX_DOCUMENT_UPLOAD_MB: %w", err)
	}
	imageLimit, err := positiveInt(value(fileValues, "MAX_IMAGE_UPLOAD_MB", "10"))
	if err != nil {
		return Config{}, fmt.Errorf("MAX_IMAGE_UPLOAD_MB: %w", err)
	}

	config := Config{
		AppEnv:              env,
		DatabaseURL:         value(fileValues, "DATABASE_URL", "postgres://127.0.0.1:5432/jl_business_dev?sslmode=disable"),
		PublicBaseURL:       value(fileValues, "PUBLIC_BASE_URL", "http://127.0.0.1:5173"),
		SessionSecret:       value(fileValues, "SESSION_SECRET", ""),
		CookieSecure:        value(fileValues, "COOKIE_SECURE", "false") == "true",
		SuperadminUsername:  value(fileValues, "SUPERADMIN_USERNAME", ""),
		SuperadminPassword:  value(fileValues, "SUPERADMIN_INITIAL_PASSWORD", ""),
		MailMode:            value(fileValues, "MAIL_MODE", "file"),
		FileRoot:            fileRoot,
		MailOutboxRoot:      mailOutboxRoot,
		MaxDocumentUploadMB: documentLimit,
		MaxImageUploadMB:    imageLimit,
		ListenAddr:          value(fileValues, "LISTEN_ADDR", "127.0.0.1:8080"),
	}

	if err := config.Validate(); err != nil {
		return Config{}, err
	}

	return config, nil
}

func (c Config) Validate() error {
	if c.DatabaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	if c.MailMode != "file" && c.MailMode != "smtp" {
		return errors.New("MAIL_MODE must be file or smtp")
	}
	if (c.AppEnv == development || c.AppEnv == test) && c.CookieSecure {
		return errors.New("COOKIE_SECURE must be false in development and test")
	}
	if c.AppEnv == production {
		if !c.CookieSecure {
			return errors.New("COOKIE_SECURE must be true in production")
		}
		if c.SessionSecret == "" {
			return errors.New("SESSION_SECRET is required in production")
		}
	}
	return nil
}

func (c Config) EnsureDirectories() error {
	if err := os.MkdirAll(c.FileRoot, 0o700); err != nil {
		return fmt.Errorf("create file root: %w", err)
	}
	if c.MailMode == "file" {
		if err := os.MkdirAll(c.MailOutboxRoot, 0o700); err != nil {
			return fmt.Errorf("create mail outbox: %w", err)
		}
	}
	return nil
}

func loadFileValues() (map[string]string, error) {
	root := projectRoot()
	values := make(map[string]string)

	for _, name := range []string{".env", ".env." + fileEnvironment(root) + ".local"} {
		parsed, err := godotenv.Read(filepath.Join(root, name))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		for key, parsedValue := range parsed {
			values[key] = parsedValue
		}
	}

	return values, nil
}

func fileEnvironment(root string) string {
	if environment, ok := os.LookupEnv("APP_ENV"); ok && environment != "" {
		return environment
	}
	parsed, err := godotenv.Read(filepath.Join(root, ".env"))
	if err == nil && parsed["APP_ENV"] != "" {
		return parsed["APP_ENV"]
	}
	return development
}

func value(fileValues map[string]string, key, fallback string) string {
	if environmentValue, ok := os.LookupEnv(key); ok {
		return environmentValue
	}
	if fileValue, ok := fileValues[key]; ok {
		return fileValue
	}
	return fallback
}

func positiveInt(raw string) (int, error) {
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return 0, errors.New("must be a positive integer")
	}
	return value, nil
}

func projectRoot() string {
	workingDirectory, err := os.Getwd()
	if err != nil {
		return "."
	}
	if filepath.Base(workingDirectory) == "backend" {
		return filepath.Dir(workingDirectory)
	}
	return workingDirectory
}

func resolvePath(root, value string) string {
	if filepath.IsAbs(value) {
		return filepath.Clean(value)
	}
	return filepath.Join(root, value)
}
