package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/api"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/config"
)

func TestPhase1APIIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to the isolated jl_business_test database")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	if strings.TrimPrefix(parsedURL.Path, "/") != "jl_business_test" {
		t.Fatalf("refusing to run integration test against %q; TEST_DATABASE_URL must target jl_business_test", parsedURL.Path)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create test database pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}
	var accountsTable bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.accounts') IS NOT NULL`).Scan(&accountsTable); err != nil {
		t.Fatalf("check migrated test database: %v", err)
	}
	if !accountsTable {
		t.Fatal("test database is not migrated; run make migrate-up with TEST_DATABASE_URL first")
	}
	if _, err := pool.Exec(ctx, `TRUNCATE security_audit_logs, invitation_uses, browser_session_accounts, browser_sessions, invitation_codes, accounts CASCADE`); err != nil {
		t.Fatalf("reset isolated test database: %v", err)
	}

	fileRoot := t.TempDir()
	applicationConfig := config.Config{
		AppEnv:             "test",
		DatabaseURL:        databaseURL,
		PublicBaseURL:      "http://127.0.0.1:5173",
		CookieSecure:       false,
		SuperadminUsername: "phase1-superadmin",
		SuperadminPassword: "phase1-superadmin-password",
		MailMode:           "file",
		FileRoot:           fileRoot,
		MailOutboxRoot:     fileRoot,
	}
	authService := auth.NewService(pool, applicationConfig)
	if err := authService.BootstrapSuperAdmin(ctx); err != nil {
		t.Fatalf("bootstrap test super administrator: %v", err)
	}

	server := httptest.NewServer(newServer(pool, applicationConfig, authService))
	defer server.Close()

	superAdminClient := newTestClient(t)
	superAdminLogin := postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": applicationConfig.SuperadminUsername,
		"password": applicationConfig.SuperadminPassword,
	}, "", http.StatusOK)
	var superAdminAuth api.AuthResponse
	decodeTestJSON(t, superAdminLogin, &superAdminAuth)

	invitationResponse := postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/invitation-codes", map[string]interface{}{
		"max_uses": 3,
	}, superAdminAuth.Data.CsrfToken, http.StatusCreated)
	var invitation api.InvitationResponse
	decodeTestJSON(t, invitationResponse, &invitation)
	if invitation.Data.Code == "" {
		t.Fatal("created invitation did not return a code")
	}

	adminResponse := postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/admins", map[string]string{
		"username": "phase1-admin",
		"password": "phase1-admin-password",
	}, superAdminAuth.Data.CsrfToken, http.StatusCreated)
	var ordinaryAdmin api.AccountResponse
	decodeTestJSON(t, adminResponse, &ordinaryAdmin)

	userOneClient := newTestClient(t)
	userOneResponse := postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{
		"username":        "phase1-user-one",
		"password":        "phase1-user-password",
		"invitation_code": invitation.Data.Code,
	}, "", http.StatusCreated)
	var userOneAuth api.AuthResponse
	decodeTestJSON(t, userOneResponse, &userOneAuth)

	userTwoClient := newTestClient(t)
	userTwoResponse := postTestJSON(t, userTwoClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{
		"username":        "phase1-user-two",
		"password":        "phase1-second-password",
		"invitation_code": invitation.Data.Code,
	}, "", http.StatusCreated)
	var userTwoAuth api.AuthResponse
	decodeTestJSON(t, userTwoResponse, &userTwoAuth)

	userThreeClient := newTestClient(t)
	userThreeResponse := postTestJSON(t, userThreeClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{
		"username":        "phase1-user-three",
		"password":        "phase1-third-password",
		"invitation_code": invitation.Data.Code,
	}, "", http.StatusCreated)
	var userThreeAuth api.AuthResponse
	decodeTestJSON(t, userThreeResponse, &userThreeAuth)
	postTestJSON(t, newTestClient(t), server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{
		"username":        "phase1-user-four",
		"password":        "phase1-fourth-password",
		"invitation_code": invitation.Data.Code,
	}, "", http.StatusConflict)

	getTestJSON(t, userOneClient, server.URL, "/api/admin/users", http.StatusForbidden)
	postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/accounts/add", map[string]string{
		"username": "phase1-user-two",
		"password": "phase1-second-password",
	}, userOneAuth.Data.CsrfToken, http.StatusOK)

	accountsResponse := getTestJSON(t, userOneClient, server.URL, "/api/auth/accounts", http.StatusOK)
	var linkedAccounts api.AccountsResponse
	decodeTestJSON(t, accountsResponse, &linkedAccounts)
	if linkedAccounts.Data.Account.Username != "phase1-user-two" || len(linkedAccounts.Data.Accounts) != 2 {
		t.Fatalf("linked account response = %+v, want user two active with two accounts", linkedAccounts.Data)
	}
	postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/accounts/"+userOneAuth.Data.Account.Id.String()+"/switch", nil, linkedAccounts.Data.CsrfToken, http.StatusOK)
	deleteTestJSON(t, userOneClient, server.URL, "/api/auth/accounts/"+userTwoAuth.Data.Account.Id.String(), linkedAccounts.Data.CsrfToken, http.StatusNoContent)

	getTestJSON(t, superAdminClient, server.URL, "/api/admin/admins", http.StatusOK)
	ordinaryAdminClient := newTestClient(t)
	ordinaryAdminLogin := postTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-admin",
		"password": "phase1-admin-password",
	}, "", http.StatusOK)
	var ordinaryAdminAuth api.AuthResponse
	decodeTestJSON(t, ordinaryAdminLogin, &ordinaryAdminAuth)
	getTestJSON(t, ordinaryAdminClient, server.URL, "/api/admin/users", http.StatusOK)
	getTestJSON(t, ordinaryAdminClient, server.URL, "/api/admin/admins", http.StatusForbidden)
	deleteTestJSON(t, ordinaryAdminClient, server.URL, "/api/admin/admins/"+ordinaryAdmin.Data.Id.String(), ordinaryAdminAuth.Data.CsrfToken, http.StatusForbidden)
	postTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/invitation-codes", map[string]string{}, ordinaryAdminAuth.Data.CsrfToken, http.StatusCreated)
	expiredInvitationResponse := postTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/invitation-codes", map[string]interface{}{
		"code":       "PHASE1EXPIRED",
		"expires_at": time.Now().Add(-time.Minute).UTC(),
	}, ordinaryAdminAuth.Data.CsrfToken, http.StatusCreated)
	var expiredInvitation api.InvitationResponse
	decodeTestJSON(t, expiredInvitationResponse, &expiredInvitation)
	postTestJSON(t, newTestClient(t), server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{
		"username":        "phase1-expired-invite",
		"password":        "phase1-expired-password",
		"invitation_code": expiredInvitation.Data.Code,
	}, "", http.StatusBadRequest)
	disabledInvitationResponse := postTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/invitation-codes", map[string]string{"code": "PHASE1DISABLED"}, ordinaryAdminAuth.Data.CsrfToken, http.StatusCreated)
	var disabledInvitation api.InvitationResponse
	decodeTestJSON(t, disabledInvitationResponse, &disabledInvitation)
	deleteTestJSON(t, ordinaryAdminClient, server.URL, "/api/admin/invitation-codes/"+disabledInvitation.Data.Id.String(), ordinaryAdminAuth.Data.CsrfToken, http.StatusNoContent)
	postTestJSON(t, newTestClient(t), server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{
		"username":        "phase1-disabled-invite",
		"password":        "phase1-disabled-password",
		"invitation_code": disabledInvitation.Data.Code,
	}, "", http.StatusBadRequest)
	postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/admins/"+ordinaryAdmin.Data.Id.String()+"/reset-password", map[string]string{"temporary_password": "phase1-admin-reset-password"}, "", http.StatusForbidden)
	postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/admins/"+ordinaryAdmin.Data.Id.String()+"/reset-password", map[string]string{"temporary_password": "phase1-admin-reset-password"}, superAdminAuth.Data.CsrfToken, http.StatusOK)
	getTestJSON(t, ordinaryAdminClient, server.URL, "/api/admin/users", http.StatusUnauthorized)
	adminResetLogin := postTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-admin",
		"password": "phase1-admin-reset-password",
	}, "", http.StatusOK)
	var adminResetAuth api.AuthResponse
	decodeTestJSON(t, adminResetLogin, &adminResetAuth)
	patchTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/admins/"+ordinaryAdmin.Data.Id.String(), map[string]string{"status": "DISABLED"}, superAdminAuth.Data.CsrfToken, http.StatusOK)
	getTestJSON(t, ordinaryAdminClient, server.URL, "/api/admin/users", http.StatusUnauthorized)
	patchTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/admins/"+ordinaryAdmin.Data.Id.String(), map[string]string{"status": "ACTIVE"}, superAdminAuth.Data.CsrfToken, http.StatusOK)
	ordinaryAdminRestoredLogin := postTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-admin",
		"password": "phase1-admin-reset-password",
	}, "", http.StatusOK)
	var ordinaryAdminRestoredAuth api.AuthResponse
	decodeTestJSON(t, ordinaryAdminRestoredLogin, &ordinaryAdminRestoredAuth)

	adminUserResetResponse := postTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/users/"+userThreeAuth.Data.Account.Id.String()+"/reset-password", map[string]string{"temporary_password": "phase1-admin-user-reset-password"}, ordinaryAdminRestoredAuth.Data.CsrfToken, http.StatusOK)
	var adminUserReset api.ResetPasswordResponse
	decodeTestJSON(t, adminUserResetResponse, &adminUserReset)
	if adminUserReset.Data.TemporaryPassword != "phase1-admin-user-reset-password" {
		t.Fatalf("ordinary admin reset password response = %q", adminUserReset.Data.TemporaryPassword)
	}
	getTestJSON(t, userThreeClient, server.URL, "/api/auth/me", http.StatusUnauthorized)
	postTestJSON(t, userThreeClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-user-three",
		"password": "phase1-admin-user-reset-password",
	}, "", http.StatusOK)
	patchTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/users/"+userThreeAuth.Data.Account.Id.String()+"/status", map[string]string{"status": "DISABLED"}, ordinaryAdminRestoredAuth.Data.CsrfToken, http.StatusOK)
	getTestJSON(t, userThreeClient, server.URL, "/api/auth/me", http.StatusUnauthorized)
	patchTestJSON(t, ordinaryAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/users/"+userThreeAuth.Data.Account.Id.String()+"/status", map[string]string{"status": "ACTIVE"}, ordinaryAdminRestoredAuth.Data.CsrfToken, http.StatusOK)

	patchTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/admins/"+superAdminAuth.Data.Account.Id.String(), map[string]string{"status": "DISABLED"}, superAdminAuth.Data.CsrfToken, http.StatusForbidden)
	deleteTestJSON(t, superAdminClient, server.URL, "/api/admin/admins/"+superAdminAuth.Data.Account.Id.String(), superAdminAuth.Data.CsrfToken, http.StatusForbidden)

	patchTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/users/"+userOneAuth.Data.Account.Id.String()+"/status", map[string]string{"status": "DISABLED"}, "", http.StatusForbidden)

	patchTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/users/"+userOneAuth.Data.Account.Id.String()+"/status", map[string]string{"status": "DISABLED"}, superAdminAuth.Data.CsrfToken, http.StatusOK)
	getTestJSON(t, userOneClient, server.URL, "/api/auth/me", http.StatusUnauthorized)
	postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-user-one",
		"password": "phase1-user-password",
	}, "", http.StatusForbidden)
	patchTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/users/"+userOneAuth.Data.Account.Id.String()+"/status", map[string]string{"status": "ACTIVE"}, superAdminAuth.Data.CsrfToken, http.StatusOK)

	resetResponse := postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/users/"+userOneAuth.Data.Account.Id.String()+"/reset-password", map[string]string{"temporary_password": "phase1-reset-password"}, superAdminAuth.Data.CsrfToken, http.StatusOK)
	var reset api.ResetPasswordResponse
	decodeTestJSON(t, resetResponse, &reset)
	if reset.Data.TemporaryPassword != "phase1-reset-password" {
		t.Fatalf("reset password response = %q", reset.Data.TemporaryPassword)
	}
	updatedUserLogin := postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-user-one",
		"password": "phase1-reset-password",
	}, "", http.StatusOK)
	var updatedUserAuth api.AuthResponse
	decodeTestJSON(t, updatedUserLogin, &updatedUserAuth)
	patchTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/me/timezone", map[string]string{"timezone": "Asia/Tokyo"}, updatedUserAuth.Data.CsrfToken, http.StatusOK)
	postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/change-password", map[string]string{"current_password": "phase1-reset-password", "new_password": "phase1-user-final-password"}, updatedUserAuth.Data.CsrfToken, http.StatusNoContent)
	getTestJSON(t, userOneClient, server.URL, "/api/auth/me", http.StatusUnauthorized)
	finalUserLogin := postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-user-one",
		"password": "phase1-user-final-password",
	}, "", http.StatusOK)
	var finalUserAuth api.AuthResponse
	decodeTestJSON(t, finalUserLogin, &finalUserAuth)
	postTestJSON(t, userOneClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/logout", nil, finalUserAuth.Data.CsrfToken, http.StatusNoContent)
	getTestJSON(t, userOneClient, server.URL, "/api/auth/me", http.StatusUnauthorized)

	deleteTestJSON(t, superAdminClient, server.URL, "/api/admin/users/"+userTwoAuth.Data.Account.Id.String(), superAdminAuth.Data.CsrfToken, http.StatusNoContent)
	postTestJSON(t, userTwoClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "phase1-user-two",
		"password": "phase1-second-password",
	}, "", http.StatusUnauthorized)
	deleteTestJSON(t, superAdminClient, server.URL, "/api/admin/users/"+userThreeAuth.Data.Account.Id.String(), superAdminAuth.Data.CsrfToken, http.StatusNoContent)

	deleteTestJSON(t, superAdminClient, server.URL, "/api/admin/admins/"+ordinaryAdmin.Data.Id.String(), superAdminAuth.Data.CsrfToken, http.StatusNoContent)
	getTestJSON(t, ordinaryAdminClient, server.URL, "/api/admin/users", http.StatusUnauthorized)
}

func TestPhase2APIIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to the isolated jl_business_test database")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	if strings.TrimPrefix(parsedURL.Path, "/") != "jl_business_test" {
		t.Fatalf("refusing to run integration test against %q; TEST_DATABASE_URL must target jl_business_test", parsedURL.Path)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create test database pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}
	var dailyTables bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.daily_worklogs') IS NOT NULL AND to_regclass('public.daily_turnovers') IS NOT NULL AND to_regclass('public.goals') IS NOT NULL`).Scan(&dailyTables); err != nil {
		t.Fatalf("check Phase 2 migration: %v", err)
	}
	if !dailyTables {
		t.Fatal("Phase 2 migration is not applied; run make migrate-test-up first")
	}
	if _, err := pool.Exec(ctx, `TRUNCATE security_audit_logs, invitation_uses, browser_session_accounts, browser_sessions, invitation_codes, accounts CASCADE`); err != nil {
		t.Fatalf("reset isolated test database: %v", err)
	}

	fileRoot := t.TempDir()
	applicationConfig := config.Config{AppEnv: "test", DatabaseURL: databaseURL, PublicBaseURL: "http://127.0.0.1:5173", CookieSecure: false, SuperadminUsername: "phase1-superadmin", SuperadminPassword: "phase1-superadmin-password", MailMode: "file", FileRoot: fileRoot, MailOutboxRoot: fileRoot}
	authService := auth.NewService(pool, applicationConfig)
	if err := authService.BootstrapSuperAdmin(ctx); err != nil {
		t.Fatalf("bootstrap test super administrator: %v", err)
	}
	server := httptest.NewServer(newServer(pool, applicationConfig, authService))
	defer server.Close()

	superAdminClient := newTestClient(t)
	superAdminLogin := postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{"username": applicationConfig.SuperadminUsername, "password": applicationConfig.SuperadminPassword}, "", http.StatusOK)
	var superAdminAuth api.AuthResponse
	decodeTestJSON(t, superAdminLogin, &superAdminAuth)
	invitationBody := map[string]interface{}{"max_uses": 1}
	invitationResponse := postTestJSON(t, superAdminClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/invitation-codes", invitationBody, superAdminAuth.Data.CsrfToken, http.StatusCreated)
	var invitation api.InvitationResponse
	decodeTestJSON(t, invitationResponse, &invitation)

	userClient := newTestClient(t)
	userResponse := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{"username": "phase2-user", "password": "phase2-user-password", "invitation_code": invitation.Data.Code}, "", http.StatusCreated)
	var userAuth api.AuthResponse
	decodeTestJSON(t, userResponse, &userAuth)
	dailyDate := time.Now().UTC().Format("2006-01-02")
	worklogResponse := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/worklogs", map[string]interface{}{
		"work_date": dailyDate, "open_conversation_count": 1, "deep_conversation_count": 1, "buffer_count": 0, "story_share_count": 0,
		"screening_count": 0, "opportunity_count": 0, "meeting_count": 2, "customer_followup_count": 0, "reading_minutes": 30, "audio_minutes": 15,
		"turnover_pv": 2, "turnover_net_amount": nil, "note": "phase 2 integration",
	}, userAuth.Data.CsrfToken, http.StatusCreated)
	var worklog api.WorklogResponse
	decodeTestJSON(t, worklogResponse, &worklog)
	if worklog.Data.TurnoverPv == nil || *worklog.Data.TurnoverPv != 2 || worklog.Data.TurnoverNetAmount == nil || *worklog.Data.TurnoverNetAmount != "25.00" || worklog.Data.ReadingMinutes != 30 || worklog.Data.AudioMinutes != 15 {
		t.Fatalf("worklog response = %+v, want turnover 2 PV/25 amount and learning minutes", worklog.Data)
	}
	worklogList := getTestJSON(t, userClient, server.URL, "/api/worklogs?from="+dailyDate+"&to="+dailyDate, http.StatusOK)
	var listedWorklogs api.WorklogListResponse
	decodeTestJSON(t, worklogList, &listedWorklogs)
	if len(listedWorklogs.Data.Items) != 1 {
		t.Fatalf("worklog list length = %d, want 1", len(listedWorklogs.Data.Items))
	}

	turnoverResponse := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/turnover", map[string]interface{}{"turnover_date": dailyDate, "net_amount": "37.50", "note": "direct turnover update"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var turnover api.TurnoverResponse
	decodeTestJSON(t, turnoverResponse, &turnover)
	if turnover.Data.Pv != 3 || turnover.Data.NetAmount != "37.50" {
		t.Fatalf("turnover response = %+v, want 3 PV and 37.5 amount", turnover.Data)
	}
	postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/turnover", map[string]interface{}{"turnover_date": dailyDate, "pv": 2, "net_amount": "30.00"}, userAuth.Data.CsrfToken, http.StatusBadRequest)

	goalResponse := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/goals", map[string]interface{}{
		"type": "YEAR", "title": "Phase 2 meeting goal", "start_date": dailyDate, "due_date": dailyDate, "status": "IN_PROGRESS",
		"metrics": []map[string]interface{}{{"metric_code": "meeting_count", "target_value": 2, "unit": "次"}},
	}, userAuth.Data.CsrfToken, http.StatusCreated)
	var goal api.GoalResponse
	decodeTestJSON(t, goalResponse, &goal)
	if goal.Data.Progress != 1 || len(goal.Data.Metrics) != 1 || goal.Data.Metrics[0].ActualValue != 2 {
		t.Fatalf("goal response = %+v, want meeting progress 1 with actual 2", goal.Data)
	}
	dreamResponse := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/dreams", map[string]interface{}{"title": "Phase 2 dream", "description": "A verified direction", "goal_ids": []string{goal.Data.Id.String()}}, userAuth.Data.CsrfToken, http.StatusCreated)
	var dream api.DreamResponse
	decodeTestJSON(t, dreamResponse, &dream)
	if len(dream.Data.GoalIds) != 1 || dream.Data.GoalIds[0] != goal.Data.Id {
		t.Fatalf("dream response = %+v, want linked goal", dream.Data)
	}

	dashboardResponse := getTestJSON(t, userClient, server.URL, "/api/dashboard?date="+dailyDate, http.StatusOK)
	var dashboard api.DashboardResponse
	decodeTestJSON(t, dashboardResponse, &dashboard)
	if dashboard.Data.Today.Worklogs.MeetingCount != 2 || dashboard.Data.Today.Turnover.Pv != 3 || dashboard.Data.Today.Turnover.NetAmount != "37.50" || dashboard.Data.DreamsCount != 1 || len(dashboard.Data.ActiveGoals) != 1 || dashboard.Data.ActiveGoals[0].Progress != 1 {
		t.Fatalf("dashboard response = %+v, want daily totals, one dream, and completed goal progress", dashboard.Data)
	}
	getTestJSON(t, superAdminClient, server.URL, "/api/worklogs", http.StatusForbidden)
	getTestJSON(t, superAdminClient, server.URL, "/api/turnover", http.StatusForbidden)
	getTestJSON(t, superAdminClient, server.URL, "/api/goals", http.StatusForbidden)
	getTestJSON(t, superAdminClient, server.URL, "/api/dreams", http.StatusForbidden)
}

func TestPhase3APIIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to the isolated jl_business_test database")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	if strings.TrimPrefix(parsedURL.Path, "/") != "jl_business_test" {
		t.Fatalf("refusing to run integration test against %q; TEST_DATABASE_URL must target jl_business_test", parsedURL.Path)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create test database pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}
	var phase3Tables bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.calendar_events') IS NOT NULL AND to_regclass('public.calendar_event_exceptions') IS NOT NULL AND to_regclass('public.reviews') IS NOT NULL`).Scan(&phase3Tables); err != nil {
		t.Fatalf("check Phase 3 migration: %v", err)
	}
	if !phase3Tables {
		t.Fatal("Phase 3 migration is not applied; run make migrate-test-up first")
	}
	if _, err := pool.Exec(ctx, `TRUNCATE security_audit_logs, invitation_uses, browser_session_accounts, browser_sessions, invitation_codes, accounts CASCADE`); err != nil {
		t.Fatalf("reset isolated test database: %v", err)
	}
	fileRoot := t.TempDir()
	applicationConfig := config.Config{AppEnv: "test", DatabaseURL: databaseURL, PublicBaseURL: "http://127.0.0.1:5173", CookieSecure: false, SuperadminUsername: "phase1-superadmin", SuperadminPassword: "phase1-superadmin-password", MailMode: "file", FileRoot: fileRoot, MailOutboxRoot: fileRoot}
	authService := auth.NewService(pool, applicationConfig)
	if err := authService.BootstrapSuperAdmin(ctx); err != nil {
		t.Fatalf("bootstrap test super administrator: %v", err)
	}
	server := httptest.NewServer(newServer(pool, applicationConfig, authService))
	defer server.Close()
	superClient := newTestClient(t)
	login := postTestJSON(t, superClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/login", map[string]string{"username": applicationConfig.SuperadminUsername, "password": applicationConfig.SuperadminPassword}, "", http.StatusOK)
	var adminAuth api.AuthResponse
	decodeTestJSON(t, login, &adminAuth)
	inviteBody := map[string]interface{}{"max_uses": 1}
	invite := postTestJSON(t, superClient, server.URL, applicationConfig.PublicBaseURL, "/api/admin/invitation-codes", inviteBody, adminAuth.Data.CsrfToken, http.StatusCreated)
	var invitation api.InvitationResponse
	decodeTestJSON(t, invite, &invitation)
	userClient := newTestClient(t)
	registered := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/auth/register", map[string]string{"username": "phase3-user", "password": "phase3-user-password", "invitation_code": invitation.Data.Code}, "", http.StatusCreated)
	var userAuth api.AuthResponse
	decodeTestJSON(t, registered, &userAuth)
	start := time.Now().UTC().Truncate(time.Hour).Add(24 * time.Hour)
	end := start.Add(time.Hour)
	eventBody := map[string]interface{}{"title": "Phase 3 meeting", "timezone": "Asia/Shanghai", "start_at": start, "end_at": end, "recurrence_freq": "NONE", "attendees": []map[string]string{{"email": "phase3@example.com"}}}
	eventResponse := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/calendar/events", eventBody, userAuth.Data.CsrfToken, http.StatusCreated)
	var created api.CalendarEventResponse
	decodeTestJSON(t, eventResponse, &created)
	if created.Data.Title != "Phase 3 meeting" || created.Data.Uid == "" {
		t.Fatalf("calendar event = %+v", created.Data)
	}
	from, to := start.Add(-time.Hour).Format(time.RFC3339), end.Add(time.Hour).Format(time.RFC3339)
	listed := getTestJSON(t, userClient, server.URL, "/api/calendar/events?from="+url.QueryEscape(from)+"&to="+url.QueryEscape(to), http.StatusOK)
	var eventList api.CalendarEventListResponse
	decodeTestJSON(t, listed, &eventList)
	if len(eventList.Data.Items) != 1 {
		t.Fatalf("calendar list length = %d, want 1", len(eventList.Data.Items))
	}
	if files, err := os.ReadDir(fileRoot); err != nil || len(files) == 0 {
		t.Fatalf("mail outbox files = %d, error = %v", len(files), err)
	} else {
		content, readErr := os.ReadFile(fileRoot + "/" + files[0].Name())
		if readErr != nil || !strings.Contains(string(content), "BEGIN:VCALENDAR") || !strings.Contains(string(content), "METHOD:REQUEST") {
			t.Fatalf("mail outbox content missing ICS request: error = %v, content = %q", readErr, content)
		}
	}
	recurring := map[string]interface{}{"title": "Phase 3 daily series", "timezone": "Asia/Shanghai", "start_at": start, "end_at": end, "recurrence_freq": "DAILY", "recurrence_interval": 1, "recurrence_end_type": "COUNT", "recurrence_count": 3}
	postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/calendar/events", recurring, userAuth.Data.CsrfToken, http.StatusCreated)
	seriesListed := getTestJSON(t, userClient, server.URL, "/api/calendar/events?from="+url.QueryEscape(start.Add(-time.Hour).Format(time.RFC3339))+"&to="+url.QueryEscape(start.Add(4*24*time.Hour).Format(time.RFC3339)), http.StatusOK)
	decodeTestJSON(t, seriesListed, &eventList)
	if len(eventList.Data.Items) != 4 {
		t.Fatalf("recurring calendar list length = %d, want one event plus three daily occurrences", len(eventList.Data.Items))
	}
	period := start.Format("2006-01-02")
	review := putTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/reviews/DAILY/"+period, map[string]string{"good": "完成首次日历闭环", "next_focus": "保持节奏"}, userAuth.Data.CsrfToken, http.StatusOK)
	var reviewResponse api.ReviewResponse
	decodeTestJSON(t, review, &reviewResponse)
	if reviewResponse.Data.Good != "完成首次日历闭环" {
		t.Fatalf("review = %+v", reviewResponse.Data)
	}
	analyticsResponse := getTestJSON(t, userClient, server.URL, "/api/analytics/turnover?from="+period+"&to="+period+"&granularity=day", http.StatusOK)
	var analyticsResult api.AnalyticsResponse
	decodeTestJSON(t, analyticsResponse, &analyticsResult)
	if analyticsResult.Data.Metric != "turnover" {
		t.Fatalf("analytics metric = %q", analyticsResult.Data.Metric)
	}
	getTestJSON(t, superClient, server.URL, "/api/calendar/events?from="+url.QueryEscape(from)+"&to="+url.QueryEscape(to), http.StatusForbidden)
	getTestJSON(t, superClient, server.URL, "/api/reviews", http.StatusForbidden)
	getTestJSON(t, superClient, server.URL, "/api/analytics/worklogs?granularity=day", http.StatusForbidden)
}

func TestPhase4APIIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to the isolated jl_business_test database")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	if strings.TrimPrefix(parsedURL.Path, "/") != "jl_business_test" {
		t.Fatalf("refusing to run integration test against %q; TEST_DATABASE_URL must target jl_business_test", parsedURL.Path)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create test database pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}
	var tables bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.team_members') IS NOT NULL AND to_regclass('public.knowledge_items') IS NOT NULL AND to_regclass('public.file_assets') IS NOT NULL`).Scan(&tables); err != nil {
		t.Fatalf("check Phase 4 migration: %v", err)
	}
	if !tables {
		t.Fatal("Phase 4 migration is not applied; run make migrate-test-up first")
	}
	if _, err := pool.Exec(ctx, `TRUNCATE security_audit_logs, invitation_uses, browser_session_accounts, browser_sessions, invitation_codes, accounts CASCADE`); err != nil {
		t.Fatalf("reset isolated test database: %v", err)
	}
	fileRoot := t.TempDir()
	cfg := config.Config{AppEnv: "test", DatabaseURL: databaseURL, PublicBaseURL: "http://127.0.0.1:5173", CookieSecure: false, SuperadminUsername: "phase1-superadmin", SuperadminPassword: "phase1-superadmin-password", MailMode: "file", FileRoot: fileRoot, MailOutboxRoot: fileRoot}
	authService := auth.NewService(pool, cfg)
	if err := authService.BootstrapSuperAdmin(ctx); err != nil {
		t.Fatalf("bootstrap test super administrator: %v", err)
	}
	server := httptest.NewServer(newServer(pool, cfg, authService))
	defer server.Close()
	adminClient := newTestClient(t)
	login := postTestJSON(t, adminClient, server.URL, cfg.PublicBaseURL, "/api/auth/login", map[string]string{"username": cfg.SuperadminUsername, "password": cfg.SuperadminPassword}, "", http.StatusOK)
	var adminAuth api.AuthResponse
	decodeTestJSON(t, login, &adminAuth)
	invite := postTestJSON(t, adminClient, server.URL, cfg.PublicBaseURL, "/api/admin/invitation-codes", map[string]interface{}{"max_uses": 2}, adminAuth.Data.CsrfToken, http.StatusCreated)
	var invitation api.InvitationResponse
	decodeTestJSON(t, invite, &invitation)
	userClient := newTestClient(t)
	registered := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/auth/register", map[string]string{"username": "phase4-user", "password": "phase4-user-password", "invitation_code": invitation.Data.Code}, "", http.StatusCreated)
	var userAuth api.AuthResponse
	decodeTestJSON(t, registered, &userAuth)
	parentBody := map[string]interface{}{"name": "Phase 4 root", "rank": "主任", "city": "上海"}
	parentResponse := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/members", parentBody, userAuth.Data.CsrfToken, http.StatusCreated)
	var parent api.TeamMemberResponse
	decodeTestJSON(t, parentResponse, &parent)
	postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/members", map[string]interface{}{"name": "1"}, userAuth.Data.CsrfToken, http.StatusBadRequest)
	childResponse := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/members", map[string]interface{}{"name": "Phase 4 child", "parent_id": parent.Data.Id.String()}, userAuth.Data.CsrfToken, http.StatusCreated)
	var child api.TeamMemberResponse
	decodeTestJSON(t, childResponse, &child)
	putTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/members/"+parent.Data.Id.String(), map[string]interface{}{"name": "Phase 4 root", "parent_id": child.Data.Id.String()}, userAuth.Data.CsrfToken, http.StatusBadRequest)
	snapshot := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/snapshots", map[string]interface{}{"snapshot_month": "2026-09-01", "snapshot_type": "MANUAL"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var snapshotResponse api.TeamSnapshotResponse
	decodeTestJSON(t, snapshot, &snapshotResponse)
	if len(snapshotResponse.Data.Members) != 2 {
		t.Fatalf("snapshot members = %d, want 2", len(snapshotResponse.Data.Members))
	}
	teamAnalyticsBody := getTestJSON(t, userClient, server.URL, "/api/analytics/team?from=2026-09-01&to=2026-10-01&granularity=month", http.StatusOK)
	var teamAnalytics api.AnalyticsResponse
	decodeTestJSON(t, teamAnalyticsBody, &teamAnalytics)
	if teamAnalytics.Data.Metric != "team" || len(teamAnalytics.Data.Buckets) != 1 || teamAnalytics.Data.Buckets[0].MemberCount == nil || *teamAnalytics.Data.Buckets[0].MemberCount != 2 {
		t.Fatalf("team analytics = %+v", teamAnalytics.Data)
	}
	knowledgeResponse := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/knowledge", map[string]interface{}{"title": "Phase 4 book", "type": "BOOK", "tags": []string{"经营", "经营"}, "status": "IN_PROGRESS"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var item api.KnowledgeItemResponse
	decodeTestJSON(t, knowledgeResponse, &item)
	if len(item.Data.Tags) != 1 {
		t.Fatalf("knowledge tags = %v, want one normalized tag", item.Data.Tags)
	}
	sessionResponse := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/learning-sessions", map[string]interface{}{"knowledge_item_id": item.Data.Id.String(), "activity_type": "READING", "activity_date": "2026-09-14", "minutes": 30, "source": "ITEM"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var session api.LearningSessionResponse
	decodeTestJSON(t, sessionResponse, &session)
	if session.Data.Minutes != 30 {
		t.Fatalf("learning session = %+v", session.Data)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("category", "KNOWLEDGE_DOCUMENT")
	part, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": {`form-data; name="file"; filename="phase4.txt"`},
		"Content-Type":        {"text/plain"},
	})
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	_, _ = part.Write([]byte("phase 4 attachment"))
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	uploadRequest, err := http.NewRequest(http.MethodPost, endpointURL(server.URL, "/api/files"), &body)
	if err != nil {
		t.Fatalf("create upload request: %v", err)
	}
	uploadRequest.Header.Set("Content-Type", writer.FormDataContentType())
	uploadRequest.Header.Set("Origin", cfg.PublicBaseURL)
	uploadRequest.Header.Set("X-CSRF-Token", userAuth.Data.CsrfToken)
	uploadRequest.Header.Set("X-Forwarded-For", testClientIP(userClient))
	uploadResponse := doTestRequest(t, userClient, uploadRequest, http.StatusCreated)
	var fileResponse api.FileResponse
	decodeTestJSON(t, uploadResponse, &fileResponse)
	knowledgeUpdate := putTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/knowledge/"+item.Data.Id.String(), map[string]interface{}{"title": "Phase 4 book", "type": "BOOK", "status": "IN_PROGRESS", "file_ids": []string{fileResponse.Data.Id.String()}}, userAuth.Data.CsrfToken, http.StatusOK)
	decodeTestJSON(t, knowledgeUpdate, &item)
	if len(item.Data.FileIds) != 1 || item.Data.FileIds[0] != fileResponse.Data.Id {
		t.Fatalf("knowledge attachments = %v, want uploaded file", item.Data.FileIds)
	}

	var imageBody bytes.Buffer
	imageWriter := multipart.NewWriter(&imageBody)
	_ = imageWriter.WriteField("category", "DREAM_IMAGE")
	imagePart, err := imageWriter.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="dream.png"`}, "Content-Type": {"image/png"}})
	if err != nil {
		t.Fatalf("create dream image: %v", err)
	}
	_, _ = imagePart.Write([]byte("test image"))
	_ = imageWriter.Close()
	imageRequest, err := http.NewRequest(http.MethodPost, endpointURL(server.URL, "/api/files"), &imageBody)
	if err != nil {
		t.Fatalf("create dream image request: %v", err)
	}
	imageRequest.Header.Set("Content-Type", imageWriter.FormDataContentType())
	imageRequest.Header.Set("Origin", cfg.PublicBaseURL)
	imageRequest.Header.Set("X-CSRF-Token", userAuth.Data.CsrfToken)
	imageRequest.Header.Set("X-Forwarded-For", testClientIP(userClient))
	imageUpload := doTestRequest(t, userClient, imageRequest, http.StatusCreated)
	var imageResponse api.FileResponse
	decodeTestJSON(t, imageUpload, &imageResponse)
	dreamBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/dreams", map[string]interface{}{"title": "Phase 4 dream", "file_ids": []string{imageResponse.Data.Id.String()}}, userAuth.Data.CsrfToken, http.StatusCreated)
	var dreamResponse api.DreamResponse
	decodeTestJSON(t, dreamBody, &dreamResponse)
	if len(dreamResponse.Data.FileIds) != 1 || dreamResponse.Data.FileIds[0] != imageResponse.Data.Id {
		t.Fatalf("dream attachments = %v, want uploaded image", dreamResponse.Data.FileIds)
	}
	exportRequest, err := http.NewRequest(http.MethodGet, endpointURL(server.URL, "/api/exports/TEAM?format=csv"), nil)
	if err != nil {
		t.Fatalf("create team export request: %v", err)
	}
	exportRequest.Header.Set("X-Forwarded-For", testClientIP(userClient))
	exportData := doTestRequest(t, userClient, exportRequest, http.StatusOK)
	if !strings.Contains(string(exportData), "member_code,name,parent_member_code") || !strings.Contains(string(exportData), "Phase 4 root") {
		t.Fatalf("team export does not contain stable hierarchy columns: %q", exportData)
	}
	searchResponse := getTestJSON(t, userClient, server.URL, "/api/search?q=Phase%204%20book", http.StatusOK)
	var searchResult api.SearchResponse
	decodeTestJSON(t, searchResponse, &searchResult)
	if len(searchResult.Data.Items) == 0 {
		t.Fatal("search did not find the user's knowledge item")
	}
	filteredSearchResponse := getTestJSON(t, userClient, server.URL, "/api/search?q=Phase%204%20book&modules=knowledge", http.StatusOK)
	var filteredSearchResult api.SearchResponse
	decodeTestJSON(t, filteredSearchResponse, &filteredSearchResult)
	if len(filteredSearchResult.Data.Items) == 0 {
		t.Fatal("filtered search did not find the user's knowledge item")
	}
	for _, item := range filteredSearchResult.Data.Items {
		if item.Module != "knowledge" {
			t.Fatalf("filtered search returned module %q, want knowledge", item.Module)
		}
	}
	getTestJSON(t, userClient, server.URL, "/api/files/"+fileResponse.Data.Id.String()+"/content?disposition=inline", http.StatusOK)
	getTestJSON(t, adminClient, server.URL, "/api/team/members", http.StatusForbidden)
	getTestJSON(t, adminClient, server.URL, "/api/knowledge", http.StatusForbidden)
	getTestJSON(t, adminClient, server.URL, "/api/search?q=Phase", http.StatusForbidden)
}

func TestPhase5APIIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to the isolated jl_business_test database")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	if strings.TrimPrefix(parsedURL.Path, "/") != "jl_business_test" {
		t.Fatalf("refusing to run integration test against %q; TEST_DATABASE_URL must target jl_business_test", parsedURL.Path)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create test database pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}
	var tables bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.finance_categories') IS NOT NULL AND to_regclass('public.income_simulations') IS NOT NULL`).Scan(&tables); err != nil {
		t.Fatalf("check Phase 5 migration: %v", err)
	}
	if !tables {
		t.Fatal("Phase 5 migration is not applied; run make migrate-test-up first")
	}
	if _, err := pool.Exec(ctx, `TRUNCATE security_audit_logs, invitation_uses, browser_session_accounts, browser_sessions, invitation_codes, accounts CASCADE`); err != nil {
		t.Fatalf("reset isolated test database: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO finance_categories (user_id, type, name) VALUES (NULL, 'INCOME', '其他收入'), (NULL, 'EXPENSE', '其他支出'), (NULL, 'EXPENSE', '生活'), (NULL, 'EXPENSE', '交通'), (NULL, 'EXPENSE', '学习')`); err != nil {
		t.Fatalf("restore Phase 5 system categories after reset: %v", err)
	}
	cfg := config.Config{AppEnv: "test", DatabaseURL: databaseURL, PublicBaseURL: "http://127.0.0.1:5173", CookieSecure: false, SuperadminUsername: "phase1-superadmin", SuperadminPassword: "phase1-superadmin-password", MailMode: "file", FileRoot: t.TempDir(), MailOutboxRoot: t.TempDir()}
	authService := auth.NewService(pool, cfg)
	if err := authService.BootstrapSuperAdmin(ctx); err != nil {
		t.Fatalf("bootstrap test super administrator: %v", err)
	}
	server := httptest.NewServer(newServer(pool, cfg, authService))
	defer server.Close()
	adminClient := newTestClient(t)
	login := postTestJSON(t, adminClient, server.URL, cfg.PublicBaseURL, "/api/auth/login", map[string]string{"username": cfg.SuperadminUsername, "password": cfg.SuperadminPassword}, "", http.StatusOK)
	var adminAuth api.AuthResponse
	decodeTestJSON(t, login, &adminAuth)
	inviteBody := postTestJSON(t, adminClient, server.URL, cfg.PublicBaseURL, "/api/admin/invitation-codes", map[string]interface{}{"max_uses": 1}, adminAuth.Data.CsrfToken, http.StatusCreated)
	var invite api.InvitationResponse
	decodeTestJSON(t, inviteBody, &invite)
	userClient := newTestClient(t)
	registered := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/auth/register", map[string]string{"username": "phase5-user", "password": "phase5-user-password", "invitation_code": invite.Data.Code}, "", http.StatusCreated)
	var userAuth api.AuthResponse
	decodeTestJSON(t, registered, &userAuth)

	categoriesBody := getTestJSON(t, userClient, server.URL, "/api/finance/categories", http.StatusOK)
	var categories api.FinanceCategoryListResponse
	decodeTestJSON(t, categoriesBody, &categories)
	if len(categories.Data.Items) != 5 {
		t.Fatalf("finance categories = %d, want 5 system defaults", len(categories.Data.Items))
	}
	categoryBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/finance/categories", map[string]string{"type": "EXPENSE", "name": "Phase 5 testing"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var category api.FinanceCategoryResponse
	decodeTestJSON(t, categoryBody, &category)
	today := time.Now().UTC().Format("2006-01-02")
	transactionBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/finance/transactions", map[string]interface{}{"occurred_on": today, "type": "EXPENSE", "category_id": category.Data.Id.String(), "amount": "123.45", "description": "Phase 5 transaction"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var transaction api.FinanceTransactionResponse
	decodeTestJSON(t, transactionBody, &transaction)
	transactionsBody := getTestJSON(t, userClient, server.URL, "/api/finance/transactions?from="+today+"&to="+today, http.StatusOK)
	var transactions api.FinanceTransactionListResponse
	decodeTestJSON(t, transactionsBody, &transactions)
	if len(transactions.Data.Items) != 1 || transactions.Data.Items[0].Amount != "123.45" {
		t.Fatalf("finance transactions = %+v", transactions.Data.Items)
	}
	budgetInput := map[string]interface{}{"month": "2026-09-01", "amount": "1000.00"}
	postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/finance/budgets", budgetInput, userAuth.Data.CsrfToken, http.StatusOK)
	budgetInput["amount"] = "1500.00"
	postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/finance/budgets", budgetInput, userAuth.Data.CsrfToken, http.StatusOK)
	budgetsBody := getTestJSON(t, userClient, server.URL, "/api/finance/budgets", http.StatusOK)
	var budgets api.FinanceBudgetListResponse
	decodeTestJSON(t, budgetsBody, &budgets)
	if len(budgets.Data.Items) != 1 || budgets.Data.Items[0].Amount != "1500.00" {
		t.Fatalf("finance budgets = %+v", budgets.Data.Items)
	}
	postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/finance/snapshots", map[string]interface{}{"snapshot_date": today, "kind": "SAVINGS", "amount": "8000.00", "note": "Phase 5"}, userAuth.Data.CsrfToken, http.StatusOK)
	incomeInput := map[string]interface{}{"personal_use_pv": 1000, "customer_pv": 0, "markets": []float64{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, "annual_growth_status": "NOT_QUALIFIED", "annual_growth_qualified_months": 0, "bfi_period_eligible": false, "bbi_period_eligible": false, "double_year_mode": "NONE"}
	calculationBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/income-simulator/calculate", incomeInput, "", http.StatusOK)
	var calculation api.IncomeCalculationResponse
	decodeTestJSON(t, calculationBody, &calculation)
	if calculation.Data.Result.PersonalSalesBonus != "1125.00" || calculation.Data.RuleVersion == "" {
		t.Fatalf("income calculation = %+v", calculation.Data)
	}
	financeAnalyticsBody := getTestJSON(t, userClient, server.URL, "/api/analytics/finance?from="+today+"&to="+today+"&granularity=day", http.StatusOK)
	var financeAnalytics api.AnalyticsResponse
	decodeTestJSON(t, financeAnalyticsBody, &financeAnalytics)
	if financeAnalytics.Data.Metric != "finance" || len(financeAnalytics.Data.Buckets) != 1 || financeAnalytics.Data.Buckets[0].ExpenseAmount == nil || *financeAnalytics.Data.Buckets[0].ExpenseAmount != "123.45" {
		t.Fatalf("finance analytics = %+v", financeAnalytics.Data)
	}
	simulationBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/income-simulations", map[string]interface{}{"name": "Phase 5 plan", "input": incomeInput}, userAuth.Data.CsrfToken, http.StatusCreated)
	var simulation api.IncomeSimulationResponse
	decodeTestJSON(t, simulationBody, &simulation)
	duplicateBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/income-simulations/"+simulation.Data.Id.String()+"/duplicate", nil, userAuth.Data.CsrfToken, http.StatusCreated)
	var duplicate api.IncomeSimulationResponse
	decodeTestJSON(t, duplicateBody, &duplicate)
	compareBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/income-simulations/compare", map[string]interface{}{"ids": []string{simulation.Data.Id.String(), duplicate.Data.Id.String()}}, "", http.StatusOK)
	var comparison api.IncomeSimulationListResponse
	decodeTestJSON(t, compareBody, &comparison)
	if len(comparison.Data.Items) != 2 {
		t.Fatalf("income comparison items = %d, want 2", len(comparison.Data.Items))
	}
	getTestJSON(t, adminClient, server.URL, "/api/finance/categories", http.StatusForbidden)
	deleteTestJSON(t, userClient, server.URL, "/api/finance/transactions/"+transaction.Data.Id.String(), userAuth.Data.CsrfToken, http.StatusNoContent)
	deleteTestJSON(t, userClient, server.URL, "/api/finance/categories/"+category.Data.Id.String(), userAuth.Data.CsrfToken, http.StatusNoContent)
	deleteTestJSON(t, userClient, server.URL, "/api/income-simulations/"+simulation.Data.Id.String(), userAuth.Data.CsrfToken, http.StatusNoContent)
	deleteTestJSON(t, userClient, server.URL, "/api/income-simulations/"+duplicate.Data.Id.String(), userAuth.Data.CsrfToken, http.StatusNoContent)
}

func TestPhase6APIIntegration(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to the isolated jl_business_test database")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	if strings.TrimPrefix(parsedURL.Path, "/") != "jl_business_test" {
		t.Fatalf("refusing to run integration test against %q; TEST_DATABASE_URL must target jl_business_test", parsedURL.Path)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create test database pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}
	var tableExists bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.import_jobs') IS NOT NULL`).Scan(&tableExists); err != nil {
		t.Fatalf("check Phase 6 migration: %v", err)
	}
	if !tableExists {
		t.Fatal("Phase 6 migration is not applied; run make migrate-test-up first")
	}
	if _, err := pool.Exec(ctx, `TRUNCATE security_audit_logs, invitation_uses, browser_session_accounts, browser_sessions, invitation_codes, accounts CASCADE`); err != nil {
		t.Fatalf("reset isolated test database: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO finance_categories (user_id, type, name) VALUES (NULL, 'INCOME', '其他收入'), (NULL, 'EXPENSE', '其他支出'), (NULL, 'EXPENSE', '生活'), (NULL, 'EXPENSE', '交通'), (NULL, 'EXPENSE', '学习')`); err != nil {
		t.Fatalf("restore finance system categories after reset: %v", err)
	}
	fileRoot := t.TempDir()
	cfg := config.Config{AppEnv: "test", DatabaseURL: databaseURL, PublicBaseURL: "http://127.0.0.1:5173", CookieSecure: false, SuperadminUsername: "phase1-superadmin", SuperadminPassword: "phase1-superadmin-password", MailMode: "file", FileRoot: fileRoot, MailOutboxRoot: fileRoot}
	authService := auth.NewService(pool, cfg)
	if err := authService.BootstrapSuperAdmin(ctx); err != nil {
		t.Fatalf("bootstrap test super administrator: %v", err)
	}
	server := httptest.NewServer(newServer(pool, cfg, authService))
	defer server.Close()
	adminClient := newTestClient(t)
	login := postTestJSON(t, adminClient, server.URL, cfg.PublicBaseURL, "/api/auth/login", map[string]string{"username": cfg.SuperadminUsername, "password": cfg.SuperadminPassword}, "", http.StatusOK)
	var adminAuth api.AuthResponse
	decodeTestJSON(t, login, &adminAuth)
	inviteBody := postTestJSON(t, adminClient, server.URL, cfg.PublicBaseURL, "/api/admin/invitation-codes", map[string]interface{}{"max_uses": 3}, adminAuth.Data.CsrfToken, http.StatusCreated)
	var invite api.InvitationResponse
	decodeTestJSON(t, inviteBody, &invite)
	userClient := newTestClient(t)
	registered := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/auth/register", map[string]string{"username": "phase6-user", "password": "phase6-user-password", "invitation_code": invite.Data.Code}, "", http.StatusCreated)
	var userAuth api.AuthResponse
	decodeTestJSON(t, registered, &userAuth)
	deleteClient := newTestClient(t)
	deleteRegistered := postTestJSON(t, deleteClient, server.URL, cfg.PublicBaseURL, "/api/auth/register", map[string]string{"username": "phase6-admin-delete-user", "password": "phase6-admin-delete-password", "invitation_code": invite.Data.Code}, "", http.StatusCreated)
	var deleteAuth api.AuthResponse
	decodeTestJSON(t, deleteRegistered, &deleteAuth)
	teamTargetClient := newTestClient(t)
	teamTargetRegistered := postTestJSON(t, teamTargetClient, server.URL, cfg.PublicBaseURL, "/api/auth/register", map[string]string{"username": "phase6-team-target", "password": "phase6-team-target-password", "invitation_code": invite.Data.Code}, "", http.StatusCreated)
	var teamTargetAuth api.AuthResponse
	decodeTestJSON(t, teamTargetRegistered, &teamTargetAuth)

	templateRequest, err := http.NewRequest(http.MethodGet, endpointURL(server.URL, "/api/imports/templates/WORKLOG"), nil)
	if err != nil {
		t.Fatalf("create template request: %v", err)
	}
	templateRequest.Header.Set("X-Forwarded-For", testClientIP(userClient))
	templateData := doTestRequest(t, userClient, templateRequest, http.StatusOK)
	var uploadBody bytes.Buffer
	writer := multipart.NewWriter(&uploadBody)
	if err := writer.WriteField("type", "WORKLOG"); err != nil {
		t.Fatalf("write import type: %v", err)
	}
	part, err := writer.CreateFormFile("file", "phase6-worklog.xlsx")
	if err != nil {
		t.Fatalf("create import file: %v", err)
	}
	if _, err := part.Write(templateData); err != nil {
		t.Fatalf("write import workbook: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close import form: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, endpointURL(server.URL, "/api/imports"), &uploadBody)
	if err != nil {
		t.Fatalf("create import request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Origin", cfg.PublicBaseURL)
	request.Header.Set("X-CSRF-Token", userAuth.Data.CsrfToken)
	request.Header.Set("X-Forwarded-For", testClientIP(userClient))
	importResponse := doTestRequest(t, userClient, request, http.StatusCreated)
	var job api.ImportJobResponse
	decodeTestJSON(t, importResponse, &job)
	if job.Data.Status != api.ImportJobStatus("VALIDATED") || job.Data.InvalidCount != 0 {
		t.Fatalf("import job = %+v", job.Data)
	}
	var worklogCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM daily_worklogs WHERE user_id=(SELECT id FROM accounts WHERE username='phase6-user')`).Scan(&worklogCount); err != nil {
		t.Fatalf("count pre-commit worklogs: %v", err)
	}
	if worklogCount != 0 {
		t.Fatalf("worklogs written before confirmation: %d", worklogCount)
	}
	committed := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/imports/"+job.Data.Id.String()+"/commit", nil, userAuth.Data.CsrfToken, http.StatusOK)
	decodeTestJSON(t, committed, &job)
	if job.Data.Status != api.ImportJobStatus("COMMITTED") {
		t.Fatalf("committed import job = %+v", job.Data)
	}
	reimport := uploadTestImport(t, userClient, server.URL, cfg.PublicBaseURL, userAuth.Data.CsrfToken, "WORKLOG", "phase6-worklog-again.xlsx", templateData)
	if reimport.Warnings == nil || !containsTestString(*reimport.Warnings, "same file was successfully imported before") {
		t.Fatalf("reimport warnings = %v, want prior-import warning", reimport.Warnings)
	}
	postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/imports/"+reimport.Id.String()+"/commit", nil, userAuth.Data.CsrfToken, http.StatusConflict)
	postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/imports/"+reimport.Id.String()+"/commit", nil, userAuth.Data.CsrfToken, http.StatusConflict)

	rootBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/members", map[string]interface{}{"member_code": "roundtrip-root", "name": "Roundtrip root"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var root api.TeamMemberResponse
	decodeTestJSON(t, rootBody, &root)
	childBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/members", map[string]interface{}{"member_code": "roundtrip-child", "name": "Roundtrip child", "parent_id": root.Data.Id.String()}, userAuth.Data.CsrfToken, http.StatusCreated)
	var child api.TeamMemberResponse
	decodeTestJSON(t, childBody, &child)
	leafBody := postTestJSON(t, userClient, server.URL, cfg.PublicBaseURL, "/api/team/members", map[string]interface{}{"member_code": "roundtrip-leaf", "name": "Roundtrip leaf", "parent_id": child.Data.Id.String()}, userAuth.Data.CsrfToken, http.StatusCreated)
	var leaf api.TeamMemberResponse
	decodeTestJSON(t, leafBody, &leaf)
	teamExportRequest, err := http.NewRequest(http.MethodGet, endpointURL(server.URL, "/api/exports/TEAM?format=xlsx"), nil)
	if err != nil {
		t.Fatalf("create team export request: %v", err)
	}
	teamExportRequest.Header.Set("X-Forwarded-For", testClientIP(userClient))
	teamWorkbook := doTestRequest(t, userClient, teamExportRequest, http.StatusOK)
	teamJob := uploadTestImport(t, teamTargetClient, server.URL, cfg.PublicBaseURL, teamTargetAuth.Data.CsrfToken, "TEAM", "team-roundtrip.xlsx", teamWorkbook)
	if teamJob.Status != api.ImportJobStatus("VALIDATED") || teamJob.InvalidCount != 0 {
		t.Fatalf("team import job = %+v", teamJob)
	}
	postTestJSON(t, teamTargetClient, server.URL, cfg.PublicBaseURL, "/api/imports/"+teamJob.Id.String()+"/commit", nil, teamTargetAuth.Data.CsrfToken, http.StatusOK)
	teamMembersBody := getTestJSON(t, teamTargetClient, server.URL, "/api/team/members", http.StatusOK)
	var teamMembers api.TeamMemberListResponse
	decodeTestJSON(t, teamMembersBody, &teamMembers)
	byCode := make(map[string]api.TeamMember, len(teamMembers.Data.Items))
	for _, member := range teamMembers.Data.Items {
		byCode[member.MemberCode] = member
	}
	importedRoot, rootFound := byCode["roundtrip-root"]
	importedChild, childFound := byCode["roundtrip-child"]
	importedLeaf, leafFound := byCode["roundtrip-leaf"]
	if !rootFound || !childFound || !leafFound || importedChild.ParentId == nil || importedLeaf.ParentId == nil || *importedChild.ParentId != importedRoot.Id || *importedLeaf.ParentId != importedChild.Id {
		t.Fatalf("team round trip did not restore three-level hierarchy: %+v", teamMembers.Data.Items)
	}

	fileID := uploadTestFile(t, userClient, server.URL, cfg.PublicBaseURL, userAuth.Data.CsrfToken, "phase6.txt", "phase 6 account deletion file")
	var storageName string
	if err := pool.QueryRow(ctx, `SELECT storage_name FROM file_assets WHERE id=$1`, fileID).Scan(&storageName); err != nil {
		t.Fatalf("find self-deletion file: %v", err)
	}
	deleteTestJSON(t, userClient, server.URL, "/api/auth/account", userAuth.Data.CsrfToken, http.StatusNoContent)
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE username='phase6-user'`).Scan(&worklogCount); err != nil {
		t.Fatalf("check deleted account: %v", err)
	}
	if worklogCount != 0 {
		t.Fatal("account still exists after deletion")
	}
	if _, err := os.Stat(filepath.Join(fileRoot, storageName)); !os.IsNotExist(err) {
		t.Fatalf("self-deleted account file still exists or cannot be checked: %v", err)
	}
	adminFileID := uploadTestFile(t, deleteClient, server.URL, cfg.PublicBaseURL, deleteAuth.Data.CsrfToken, "phase6-admin-delete.txt", "phase 6 administrator deletion file")
	var adminFile string
	if err := pool.QueryRow(ctx, `SELECT storage_name FROM file_assets WHERE id=$1`, adminFileID).Scan(&adminFile); err != nil {
		t.Fatalf("find administrator-deletion file: %v", err)
	}
	var deleteUserID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM accounts WHERE username='phase6-admin-delete-user'`).Scan(&deleteUserID); err != nil {
		t.Fatalf("find administrator deletion target: %v", err)
	}
	deleteTestJSON(t, adminClient, server.URL, "/api/admin/users/"+deleteUserID.String(), adminAuth.Data.CsrfToken, http.StatusNoContent)
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE id=$1`, deleteUserID).Scan(&worklogCount); err != nil {
		t.Fatalf("check administrator-deleted account: %v", err)
	}
	if worklogCount != 0 {
		t.Fatal("administrator-deleted account still exists")
	}
	if _, err := os.Stat(filepath.Join(fileRoot, adminFile)); !os.IsNotExist(err) {
		t.Fatalf("administrator-deleted account file still exists or cannot be checked: %v", err)
	}
}

var (
	testClientIPs      sync.Map
	testClientSequence uint32
)

func newTestClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("create cookie jar: %v", err)
	}
	client := &http.Client{Jar: jar}
	ip := fmt.Sprintf("198.51.100.%d", atomic.AddUint32(&testClientSequence, 1)%254+1)
	testClientIPs.Store(client, ip)
	return client
}

func testClientIP(client *http.Client) string {
	if value, ok := testClientIPs.Load(client); ok {
		return value.(string)
	}
	return "198.51.100.254"
}

func uploadTestFile(t *testing.T, client *http.Client, serverURL, origin, csrfToken, filename, content string) uuid.UUID {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("category", "KNOWLEDGE_DOCUMENT"); err != nil {
		t.Fatalf("write file category: %v", err)
	}
	part, err := writer.CreatePart(textproto.MIMEHeader{"Content-Disposition": {fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename)}, "Content-Type": {"text/plain"}})
	if err != nil {
		t.Fatalf("create test file: %v", err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatalf("write test file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close test file form: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, endpointURL(serverURL, "/api/files"), &body)
	if err != nil {
		t.Fatalf("create test file request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Origin", origin)
	request.Header.Set("X-CSRF-Token", csrfToken)
	request.Header.Set("X-Forwarded-For", testClientIP(client))
	response := doTestRequest(t, client, request, http.StatusCreated)
	var file api.FileResponse
	decodeTestJSON(t, response, &file)
	return file.Data.Id
}

func uploadTestImport(t *testing.T, client *http.Client, serverURL, origin, csrfToken, kind, filename string, workbook []byte) api.ImportJob {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("type", kind); err != nil {
		t.Fatalf("write import type: %v", err)
	}
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create import workbook: %v", err)
	}
	if _, err := part.Write(workbook); err != nil {
		t.Fatalf("write import workbook: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close import workbook form: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, endpointURL(serverURL, "/api/imports"), &body)
	if err != nil {
		t.Fatalf("create import workbook request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Origin", origin)
	request.Header.Set("X-CSRF-Token", csrfToken)
	request.Header.Set("X-Forwarded-For", testClientIP(client))
	response := doTestRequest(t, client, request, http.StatusCreated)
	var job api.ImportJobResponse
	decodeTestJSON(t, response, &job)
	return job.Data
}

func containsTestString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func postTestJSON(t *testing.T, client *http.Client, serverURL, origin, path string, body interface{}, csrfToken string, expectedStatus int) []byte {
	return mutateTestJSON(t, client, http.MethodPost, serverURL, origin, path, body, csrfToken, expectedStatus)
}

func putTestJSON(t *testing.T, client *http.Client, serverURL, origin, path string, body interface{}, csrfToken string, expectedStatus int) []byte {
	return mutateTestJSON(t, client, http.MethodPut, serverURL, origin, path, body, csrfToken, expectedStatus)
}

func patchTestJSON(t *testing.T, client *http.Client, serverURL, origin, path string, body interface{}, csrfToken string, expectedStatus int) []byte {
	return mutateTestJSON(t, client, http.MethodPatch, serverURL, origin, path, body, csrfToken, expectedStatus)
}

func mutateTestJSON(t *testing.T, client *http.Client, method, serverURL, origin, path string, body interface{}, csrfToken string, expectedStatus int) []byte {
	t.Helper()
	var payload io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode %s %s body: %v", method, path, err)
		}
		payload = strings.NewReader(string(encoded))
	}
	request, err := http.NewRequest(method, endpointURL(serverURL, path), payload)
	if err != nil {
		t.Fatalf("create %s %s request: %v", method, path, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", origin)
	request.Header.Set("X-Forwarded-For", testClientIP(client))
	if csrfToken != "" {
		request.Header.Set("X-CSRF-Token", csrfToken)
	}
	return doTestRequest(t, client, request, expectedStatus)
}

func deleteTestJSON(t *testing.T, client *http.Client, serverURL, path, csrfToken string, expectedStatus int) []byte {
	t.Helper()
	request, err := http.NewRequest(http.MethodDelete, endpointURL(serverURL, path), nil)
	if err != nil {
		t.Fatalf("create DELETE %s request: %v", path, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://127.0.0.1:5173")
	request.Header.Set("X-Forwarded-For", testClientIP(client))
	request.Header.Set("X-CSRF-Token", csrfToken)
	return doTestRequest(t, client, request, expectedStatus)
}

func getTestJSON(t *testing.T, client *http.Client, serverURL, path string, expectedStatus int) []byte {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, endpointURL(serverURL, path), nil)
	if err != nil {
		t.Fatalf("create GET %s request: %v", path, err)
	}
	request.Header.Set("X-Forwarded-For", testClientIP(client))
	return doTestRequest(t, client, request, expectedStatus)
}

func doTestRequest(t *testing.T, client *http.Client, request *http.Request, expectedStatus int) []byte {
	t.Helper()
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("send %s %s request: %v", request.Method, request.URL.Path, err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s %s response: %v", request.Method, request.URL.Path, err)
	}
	if response.StatusCode != expectedStatus {
		t.Fatalf("%s %s status = %d, want %d; body=%s", request.Method, request.URL.Path, response.StatusCode, expectedStatus, body)
	}
	return body
}

func decodeTestJSON(t *testing.T, body []byte, target interface{}) {
	t.Helper()
	if err := json.Unmarshal(body, target); err != nil {
		t.Fatalf("decode JSON response: %v; body=%s", err, body)
	}
}

func endpointURL(serverURL, path string) string {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	return fmt.Sprintf("%s%s", strings.TrimRight(serverURL, "/"), path)
}
