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
	development                  = "development"
	test                         = "test"
	production                   = "production"
	productionReleaseRuntimeRoot = "/var/lib/jl-business-growth/release-updater"
	productionReleaseRequestRoot = "/var/lib/jl-business-growth/release-updater/requests"
	productionReleaseStateRoot   = "/var/lib/jl-business-growth/release-updater/state"
	productionReleaseBackendRoot = "/opt/jl-business-growth/releases"
	productionReleaseWebRoot     = "/var/www/jl-business-growth/releases"
)

type Config struct {
	AppEnv               string
	DatabaseURL          string
	PublicBaseURL        string
	SessionSecret        string
	CookieSecure         bool
	SuperadminUsername   string
	SuperadminPassword   string
	FileRoot             string
	MaxDocumentUploadMB  int
	MaxImageUploadMB     int
	MaxRequestBodyMB     int
	ListenAddr           string
	ReleaseRepository    string
	ReleaseUpdateEnabled bool
	GitHubToken          string
	ReleaseRuntimeRoot   string
	ReleaseRequestRoot   string
	ReleaseStateRoot     string
	ReleaseBackendRoot   string
	ReleaseWebRoot       string
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
	documentLimit, err := positiveInt(value(fileValues, "MAX_DOCUMENT_UPLOAD_MB", "50"))
	if err != nil {
		return Config{}, fmt.Errorf("MAX_DOCUMENT_UPLOAD_MB: %w", err)
	}
	imageLimit, err := positiveInt(value(fileValues, "MAX_IMAGE_UPLOAD_MB", "10"))
	if err != nil {
		return Config{}, fmt.Errorf("MAX_IMAGE_UPLOAD_MB: %w", err)
	}
	requestBodyLimit, err := positiveInt(value(fileValues, "MAX_REQUEST_BODY_MB", "60"))
	if err != nil {
		return Config{}, fmt.Errorf("MAX_REQUEST_BODY_MB: %w", err)
	}
	if requestBodyLimit < documentLimit {
		return Config{}, errors.New("MAX_REQUEST_BODY_MB must be at least MAX_DOCUMENT_UPLOAD_MB")
	}
	releaseUpdateEnabled, err := strconv.ParseBool(value(fileValues, "RELEASE_UPDATE_ENABLED", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("RELEASE_UPDATE_ENABLED: must be true or false")
	}

	releaseRuntimeRoot := resolvePath(root, value(fileValues, "RELEASE_RUNTIME_ROOT", "/var/lib/jl-business-growth/release-updater"))
	releaseRequestRoot := resolvePath(root, value(fileValues, "RELEASE_REQUEST_ROOT", filepath.Join(releaseRuntimeRoot, "requests")))
	releaseStateRoot := resolvePath(root, value(fileValues, "RELEASE_STATE_ROOT", filepath.Join(releaseRuntimeRoot, "state")))

	config := Config{
		AppEnv:               env,
		DatabaseURL:          value(fileValues, "DATABASE_URL", "postgres://127.0.0.1:5432/jl_business_dev?sslmode=disable"),
		PublicBaseURL:        value(fileValues, "PUBLIC_BASE_URL", "http://127.0.0.1:5173"),
		SessionSecret:        value(fileValues, "SESSION_SECRET", ""),
		CookieSecure:         value(fileValues, "COOKIE_SECURE", "false") == "true",
		SuperadminUsername:   value(fileValues, "SUPERADMIN_USERNAME", ""),
		SuperadminPassword:   value(fileValues, "SUPERADMIN_INITIAL_PASSWORD", ""),
		FileRoot:             fileRoot,
		MaxDocumentUploadMB:  documentLimit,
		MaxImageUploadMB:     imageLimit,
		MaxRequestBodyMB:     requestBodyLimit,
		ListenAddr:           value(fileValues, "LISTEN_ADDR", "127.0.0.1:8080"),
		ReleaseRepository:    value(fileValues, "RELEASE_REPOSITORY", "QQQHHHDDD/jl-business-growth"),
		ReleaseUpdateEnabled: releaseUpdateEnabled,
		GitHubToken:          value(fileValues, "GITHUB_TOKEN", ""),
		ReleaseRuntimeRoot:   releaseRuntimeRoot,
		ReleaseRequestRoot:   releaseRequestRoot,
		ReleaseStateRoot:     releaseStateRoot,
		ReleaseBackendRoot:   resolvePath(root, value(fileValues, "RELEASE_BACKEND_ROOT", "/opt/jl-business-growth/releases")),
		ReleaseWebRoot:       resolvePath(root, value(fileValues, "RELEASE_WEB_ROOT", "/var/www/jl-business-growth/releases")),
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
	if c.ReleaseRepository != "QQQHHHDDD/jl-business-growth" {
		return errors.New("RELEASE_REPOSITORY must be QQQHHHDDD/jl-business-growth")
	}
	if c.AppEnv == production && c.ReleaseRuntimeRoot != productionReleaseRuntimeRoot {
		return fmt.Errorf("RELEASE_RUNTIME_ROOT must be %s in production", productionReleaseRuntimeRoot)
	}
	releaseRequestRoot := c.ReleaseRequestRoot
	if releaseRequestRoot == "" {
		releaseRequestRoot = filepath.Join(c.ReleaseRuntimeRoot, "requests")
	}
	releaseStateRoot := c.ReleaseStateRoot
	if releaseStateRoot == "" {
		releaseStateRoot = filepath.Join(c.ReleaseRuntimeRoot, "state")
	}
	releaseBackendRoot := c.ReleaseBackendRoot
	if releaseBackendRoot == "" {
		releaseBackendRoot = productionReleaseBackendRoot
	}
	releaseWebRoot := c.ReleaseWebRoot
	if releaseWebRoot == "" {
		releaseWebRoot = productionReleaseWebRoot
	}
	if c.AppEnv == production && releaseRequestRoot != productionReleaseRequestRoot {
		return fmt.Errorf("RELEASE_REQUEST_ROOT must be %s in production", productionReleaseRequestRoot)
	}
	if c.AppEnv == production && releaseStateRoot != productionReleaseStateRoot {
		return fmt.Errorf("RELEASE_STATE_ROOT must be %s in production", productionReleaseStateRoot)
	}
	if c.AppEnv == production && releaseBackendRoot != productionReleaseBackendRoot {
		return fmt.Errorf("RELEASE_BACKEND_ROOT must be %s in production", productionReleaseBackendRoot)
	}
	if c.AppEnv == production && releaseWebRoot != productionReleaseWebRoot {
		return fmt.Errorf("RELEASE_WEB_ROOT must be %s in production", productionReleaseWebRoot)
	}
	return nil
}

func (c Config) EnsureDirectories() error {
	if err := os.MkdirAll(c.FileRoot, 0o700); err != nil {
		return fmt.Errorf("create file root: %w", err)
	}

	if c.ReleaseUpdateEnabled {
		requestRoot := c.ReleaseRequestRoot
		if requestRoot == "" {
			requestRoot = filepath.Join(c.ReleaseRuntimeRoot, "requests")
		}
		if err := os.MkdirAll(requestRoot, 0o770); err != nil {
			return fmt.Errorf("create release updater request root: %w", err)
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
