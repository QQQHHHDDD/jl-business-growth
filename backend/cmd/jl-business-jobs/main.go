package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/buildinfo"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/database"
	"jl-business-growth/backend/internal/importexport"
	"jl-business-growth/backend/internal/team"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		if err := json.NewEncoder(os.Stdout).Encode(buildinfo.Current()); err != nil {
			log.Fatal(err)
		}
		return
	}
	job := "cleanup"
	if len(os.Args) > 1 {
		job = os.Args[1]
	}
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	if err := cfg.EnsureDirectories(); err != nil {
		log.Fatalf("prepare runtime directories: %v", err)
	}
	pool, err := database.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("initialize database pool: %v", err)
	}
	defer pool.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := run(ctx, pool, cfg, job); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context, pool *pgxpool.Pool, cfg config.Config, job string) error {
	imports := importexport.NewService(pool, cfg)
	switch job {
	case "cleanup", "cleanup-imports":
		if err := imports.CleanupExpired(ctx); err != nil {
			return fmt.Errorf("cleanup expired imports: %w", err)
		}
		if job == "cleanup-imports" {
			return nil
		}
		fallthrough
	case "cleanup-files":
		if err := imports.CleanupOrphanFiles(ctx); err != nil {
			return fmt.Errorf("cleanup orphan files: %w", err)
		}
		if err := imports.RetryFileCleanup(ctx); err != nil {
			return fmt.Errorf("retry deferred file cleanup: %w", err)
		}
		if job == "cleanup-files" {
			return nil
		}
		fallthrough
	case "cleanup-sessions":
		if err := generated.New(pool).DeleteExpiredSessions(ctx); err != nil {
			return fmt.Errorf("cleanup expired sessions: %w", err)
		}
		return nil
	case "team-snapshots":
		return team.NewService(pool).CaptureMonthlySnapshots(ctx, time.Now())
	default:
		return errors.New("job must be cleanup, cleanup-imports, cleanup-files, cleanup-sessions, or team-snapshots")
	}
}
