package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/database"
	"jl-business-growth/backend/internal/importexport"
)

func main() {
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
		return createTeamSnapshots(ctx, pool)
	default:
		return errors.New("job must be cleanup, cleanup-imports, cleanup-files, cleanup-sessions, or team-snapshots")
	}
}

func createTeamSnapshots(ctx context.Context, pool *pgxpool.Pool) error {
	month := time.Now().UTC().AddDate(0, -1, 0).Format("2006-01-01")
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id FROM accounts WHERE role='USER' AND status='ACTIVE'`)
	if err != nil {
		return err
	}
	var users []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		users = append(users, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, userID := range users {
		var snapshotID string
		if err := tx.QueryRow(ctx, `INSERT INTO team_snapshots (user_id,snapshot_month,snapshot_type,captured_late) VALUES ($1,$2,'AUTO',false) ON CONFLICT (user_id,snapshot_month,snapshot_type) DO UPDATE SET captured_late=team_snapshots.captured_late RETURNING id`, userID, month).Scan(&snapshotID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO team_snapshot_members (snapshot_id,original_member_id,name,joined_on,rank,city,status,note,sort_order) SELECT $1,id,name,joined_on,rank,city,status,note,sort_order FROM team_members WHERE user_id=$2 AND NOT EXISTS (SELECT 1 FROM team_snapshot_members WHERE snapshot_id=$1 AND original_member_id=team_members.id)`, snapshotID, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE team_snapshot_members child SET parent_snapshot_member_id=parent.id FROM team_snapshot_members parent JOIN team_members original_parent ON original_parent.id=parent.original_member_id JOIN team_members original_child ON original_child.parent_member_id=original_parent.id WHERE child.snapshot_id=$1 AND parent.snapshot_id=$1 AND child.original_member_id=original_child.id`, snapshotID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
