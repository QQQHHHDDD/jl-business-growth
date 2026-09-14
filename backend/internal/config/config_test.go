package config

import "testing"

func TestLoadUsesProcessEnvironment(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("DATABASE_URL", "postgres://127.0.0.1:5432/jl_business_test?sslmode=disable")
	t.Setenv("FILE_ROOT", t.TempDir())
	t.Setenv("MAIL_MODE", "file")
	t.Setenv("MAX_DOCUMENT_UPLOAD_MB", "50")
	t.Setenv("MAX_IMAGE_UPLOAD_MB", "10")

	config, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if config.AppEnv != test {
		t.Fatalf("AppEnv = %q, want %q", config.AppEnv, test)
	}
	if config.DatabaseURL != "postgres://127.0.0.1:5432/jl_business_test?sslmode=disable" {
		t.Fatalf("DatabaseURL = %q", config.DatabaseURL)
	}
}

func TestProductionRequiresSecureCookieAndSessionSecret(t *testing.T) {
	config := Config{AppEnv: production, DatabaseURL: "postgres://example", MailMode: "smtp"}

	if err := config.Validate(); err == nil {
		t.Fatal("Validate() error = nil, want production validation failure")
	}
}

func TestNonProductionRejectsSecureCookie(t *testing.T) {
	for _, environment := range []string{development, test} {
		config := Config{AppEnv: environment, DatabaseURL: "postgres://example", MailMode: "file", CookieSecure: true}
		if err := config.Validate(); err == nil {
			t.Fatalf("Validate() accepted COOKIE_SECURE=true for %s", environment)
		}
	}
}
