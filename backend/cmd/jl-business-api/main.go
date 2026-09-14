package main

import (
	"context"
	"log"
	"net"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"jl-business-growth/backend/internal/admin"
	"jl-business-growth/backend/internal/api"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/database"
	"jl-business-growth/backend/internal/health"
	"jl-business-growth/backend/internal/invitation"
	"jl-business-growth/backend/internal/problem"
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

	if err := databasePool.Ping(context.Background()); err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	authService := auth.NewService(databasePool, applicationConfig)
	if err := authService.BootstrapSuperAdmin(context.Background()); err != nil {
		log.Fatalf("bootstrap super administrator: %v", err)
	}

	server := newServer(databasePool, applicationConfig, authService)

	if err := server.Start(applicationConfig.ListenAddr); err != nil {
		log.Fatal(err)
	}
}

func newServer(databasePool *pgxpool.Pool, applicationConfig config.Config, authService *auth.Service) *echo.Echo {
	adminService := admin.NewService(databasePool)
	invitations := invitation.NewService(databasePool)

	server := echo.New()
	server.HideBanner = true
	// Nginx is the only expected proxy. Trust only loopback proxy hops so a
	// direct request cannot make arbitrary private-network addresses appear in
	// rate-limit keys or audit records.
	server.IPExtractor = trustedProxyIPExtractor()
	server.HTTPErrorHandler = problem.HTTPErrorHandler
	server.Use(middleware.Recover())
	server.Use(middleware.RequestID())
	server.Use(auth.SecurityHeadersMiddleware(applicationConfig))
	server.Use(auth.SecurityMiddleware(applicationConfig))
	server.Use(auth.AuthenticationRateLimitMiddleware())
	server.Use(auth.SessionMiddleware(databasePool, applicationConfig))
	api.RegisterHandlers(server, &serverHandler{
		Handler: api.NewHandler(authService, adminService, invitations, applicationConfig),
		health:  health.New(databasePool, applicationConfig),
	})
	return server
}

func trustedProxyIPExtractor() echo.IPExtractor {
	_, ipv4Loopback, err := net.ParseCIDR("127.0.0.0/8")
	if err != nil {
		panic("invalid IPv4 loopback range")
	}
	_, ipv6Loopback, err := net.ParseCIDR("::1/128")
	if err != nil {
		panic("invalid IPv6 loopback range")
	}
	return echo.ExtractIPFromXFFHeader(
		echo.TrustLoopback(false),
		echo.TrustLinkLocal(false),
		echo.TrustPrivateNet(false),
		echo.TrustIPRange(ipv4Loopback),
		echo.TrustIPRange(ipv6Loopback),
	)
}

type serverHandler struct {
	*api.Handler
	health *health.Handler
}

func (h *serverHandler) GetHealthLive(ctx echo.Context) error {
	return h.health.GetHealthLive(ctx)
}

func (h *serverHandler) GetHealthReady(ctx echo.Context) error {
	return h.health.GetHealthReady(ctx)
}
