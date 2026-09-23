package database_test

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
)

var migrationNamePattern = regexp.MustCompile(`^(\d+)_.*\.sql$`)

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve migration test path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
}

func migrationsRoot(t *testing.T) string {
	t.Helper()
	return filepath.Join(repositoryRoot(t), "backend", "db", "migrations")
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(contents)
}

func TestPgcryptoMigrationCompatibility(t *testing.T) {
	root := migrationsRoot(t)
	extensions := readFile(t, filepath.Join(root, "00001_extensions.sql"))
	removeUnused := readFile(t, filepath.Join(root, "00012_remove_unused_pgcrypto.sql"))

	if strings.Contains(strings.ToLower(extensions), "pgcrypto") {
		t.Fatal("00001 must not reference pgcrypto on the fresh migration path")
	}
	if !strings.Contains(extensions, "CREATE EXTENSION IF NOT EXISTS pg_trgm;") {
		t.Fatal("00001 must continue to install the required pg_trgm extension")
	}
	if !strings.Contains(removeUnused, "DROP EXTENSION IF EXISTS pgcrypto;") {
		t.Fatal("00012 must remove pgcrypto from databases upgraded from schema 11")
	}
	if strings.Contains(strings.ToUpper(removeUnused), "CREATE EXTENSION") {
		t.Fatal("00012 Down must not reintroduce an extension dependency")
	}
	if !strings.Contains(removeUnused, "-- +goose Down\n-- Intentionally no-op:") {
		t.Fatal("00012 must declare an explicit no-op Down migration")
	}

	matches, err := filepath.Glob(filepath.Join(root, "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	createPgcrypto := regexp.MustCompile(`(?i)CREATE\s+EXTENSION(?:\s+IF\s+NOT\s+EXISTS)?\s+pgcrypto`)
	for _, path := range matches {
		if createPgcrypto.MatchString(readFile(t, path)) {
			t.Fatalf("fresh migration path still installs pgcrypto: %s", filepath.Base(path))
		}
	}
}

func TestCommunicationMigrationDefinesUserScopedContent(t *testing.T) {
	migration := readFile(t, filepath.Join(migrationsRoot(t), "00013_communication_tools.sql"))
	for _, table := range []string{"communication_friend_records", "communication_script_categories", "communication_scripts"} {
		if !strings.Contains(migration, "CREATE TABLE "+table) {
			t.Fatalf("00013 must create %s", table)
		}
	}
	if !strings.Contains(migration, "REFERENCES accounts(id) ON DELETE CASCADE") {
		t.Fatal("communication records must be removed with their account")
	}
	if !strings.Contains(migration, "paragraphs JSONB") || !strings.Contains(migration, "jsonb_array_length(paragraphs) > 0") {
		t.Fatal("scripts must store at least one ordered paragraph")
	}
	if !strings.Contains(migration, "ON DELETE SET NULL") {
		t.Fatal("deleting a category must retain its scripts")
	}
}

func TestImportExportRemovalMigration(t *testing.T) {
	migration := readFile(t, filepath.Join(migrationsRoot(t), "00014_remove_import_export.sql"))
	for _, statement := range []string{
		"DROP TABLE IF EXISTS import_jobs;",
		"DROP TYPE IF EXISTS import_job_status;",
		"DROP TYPE IF EXISTS import_job_type;",
		"ALTER TABLE financial_transactions DROP COLUMN IF EXISTS import_fingerprint;",
	} {
		if !strings.Contains(migration, statement) {
			t.Fatalf("00014 must contain %q", statement)
		}
	}
	if strings.Contains(migration, "DROP TABLE IF EXISTS file_cleanup_failures") {
		t.Fatal("00014 must preserve independent file cleanup retries")
	}
	if !strings.Contains(migration, "-- +goose Down\n-- Intentionally no-op:") {
		t.Fatal("00014 must declare an explicit irreversible no-op Down migration")
	}
}

func TestApplicationCodeDoesNotUsePgcryptoFunctions(t *testing.T) {
	root := repositoryRoot(t)
	pgcryptoFunction := regexp.MustCompile(`(?i)\b(?:digest|hmac|crypt|gen_salt|encrypt|decrypt)\s*\(`)
	sourceRoots := []string{
		filepath.Join(root, "backend"),
		filepath.Join(root, "frontend", "src"),
		filepath.Join(root, "scripts"),
	}
	allowedExtensions := map[string]bool{
		".go": true, ".sql": true, ".sh": true, ".ts": true, ".tsx": true, ".js": true,
	}

	for _, sourceRoot := range sourceRoots {
		err := filepath.WalkDir(sourceRoot, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() {
				if path == migrationsRoot(t) || entry.Name() == "node_modules" || entry.Name() == "dist" {
					return filepath.SkipDir
				}
				return nil
			}
			if strings.HasSuffix(path, "_test.go") || !allowedExtensions[filepath.Ext(path)] {
				return nil
			}
			if pgcryptoFunction.MatchString(readFile(t, path)) {
				return fmt.Errorf("application source depends on a pgcrypto-specific function: %s", path)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}

func TestLatestSchemaVersionIs14(t *testing.T) {
	buildScript := readFile(t, filepath.Join(repositoryRoot(t), "scripts", "build-release.sh"))
	if !strings.Contains(buildScript, `latest_migration="$(find "${repo_root}/backend/db/migrations"`) ||
		!strings.Contains(buildScript, `schema_version="$((10#${BASH_REMATCH[1]}))"`) {
		t.Fatal("build-release.sh must derive schema_version from the latest migration filename")
	}
	if strings.Contains(buildScript, "schema_version=12") {
		t.Fatal("build-release.sh must not hard-code schema_version")
	}

	matches, err := filepath.Glob(filepath.Join(migrationsRoot(t), "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(matches)
	if len(matches) == 0 {
		t.Fatal("no migrations found")
	}

	latest := filepath.Base(matches[len(matches)-1])
	parts := migrationNamePattern.FindStringSubmatch(latest)
	if parts == nil {
		t.Fatalf("latest migration has an invalid name: %s", latest)
	}
	version, err := strconv.Atoi(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	if version != 14 || latest != "00014_remove_import_export.sql" {
		t.Fatalf("latest schema = %d (%s), want 14 (00014_remove_import_export.sql)", version, latest)
	}
}
