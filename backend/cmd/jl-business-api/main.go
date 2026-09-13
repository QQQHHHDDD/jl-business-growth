package main

import (
	"context"
	"log"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"jl-business-growth/backend/internal/api"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/database"
	"jl-business-growth/backend/internal/health"
)

func main() {
	applicationConfig, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	if err := applicationConfig.EnsureDirectories(); err != nil {
		log.Fatalf("prepare runtime directories: %v", err)
	}

	databasePool, err := database.NewPool(context.Background(), applicationConfig.DatabaseURL)
	if err != nil {
		log.Fatalf("initialize database pool: %v", err)
	}
	defer databasePool.Close()

	server := echo.New()
	server.HideBanner = true
	server.Use(middleware.Recover())
	server.Use(middleware.RequestID())
	api.RegisterHandlers(server, health.New(databasePool, applicationConfig))

	if err := server.Start(applicationConfig.ListenAddr); err != nil {
		log.Fatal(err)
	}
}
