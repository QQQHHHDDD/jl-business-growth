package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/database"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("super administrator password reset; restart or refresh the login page before signing in")
}

func run() error {
	applicationConfig, err := config.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	if err := validateEnvironment(applicationConfig.AppEnv); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := database.NewPool(ctx, applicationConfig.DatabaseURL)
	if err != nil {
		return fmt.Errorf("initialize database pool: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	if err := auth.NewService(pool, applicationConfig).ResetConfiguredSuperAdminPassword(ctx); err != nil {
		return fmt.Errorf("reset super administrator password: %w", err)
	}
	return nil
}

func validateEnvironment(appEnv string) error {
	if appEnv == "production" {
		return fmt.Errorf("refusing to reset the super administrator password in production")
	}
	return nil
}
