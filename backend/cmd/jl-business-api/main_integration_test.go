package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

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
	if worklog.Data.TurnoverPv == nil || *worklog.Data.TurnoverPv != 2 || worklog.Data.TurnoverNetAmount == nil || *worklog.Data.TurnoverNetAmount != 25 || worklog.Data.ReadingMinutes != 30 || worklog.Data.AudioMinutes != 15 {
		t.Fatalf("worklog response = %+v, want turnover 2 PV/25 amount and learning minutes", worklog.Data)
	}
	worklogList := getTestJSON(t, userClient, server.URL, "/api/worklogs?from="+dailyDate+"&to="+dailyDate, http.StatusOK)
	var listedWorklogs api.WorklogListResponse
	decodeTestJSON(t, worklogList, &listedWorklogs)
	if len(listedWorklogs.Data.Items) != 1 {
		t.Fatalf("worklog list length = %d, want 1", len(listedWorklogs.Data.Items))
	}

	turnoverResponse := postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/turnover", map[string]interface{}{"turnover_date": dailyDate, "net_amount": 37.5, "note": "direct turnover update"}, userAuth.Data.CsrfToken, http.StatusCreated)
	var turnover api.TurnoverResponse
	decodeTestJSON(t, turnoverResponse, &turnover)
	if turnover.Data.Pv != 3 || turnover.Data.NetAmount != 37.5 {
		t.Fatalf("turnover response = %+v, want 3 PV and 37.5 amount", turnover.Data)
	}
	postTestJSON(t, userClient, server.URL, applicationConfig.PublicBaseURL, "/api/turnover", map[string]interface{}{"turnover_date": dailyDate, "pv": 2, "net_amount": 30}, userAuth.Data.CsrfToken, http.StatusBadRequest)

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
	if dashboard.Data.Today.Worklogs.MeetingCount != 2 || dashboard.Data.Today.Turnover.Pv != 3 || dashboard.Data.Today.Turnover.NetAmount != 37.5 || dashboard.Data.DreamsCount != 1 || len(dashboard.Data.ActiveGoals) != 1 || dashboard.Data.ActiveGoals[0].Progress != 1 {
		t.Fatalf("dashboard response = %+v, want daily totals, one dream, and completed goal progress", dashboard.Data)
	}
	getTestJSON(t, superAdminClient, server.URL, "/api/worklogs", http.StatusForbidden)
	getTestJSON(t, superAdminClient, server.URL, "/api/turnover", http.StatusForbidden)
	getTestJSON(t, superAdminClient, server.URL, "/api/goals", http.StatusForbidden)
	getTestJSON(t, superAdminClient, server.URL, "/api/dreams", http.StatusForbidden)
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

func postTestJSON(t *testing.T, client *http.Client, serverURL, origin, path string, body interface{}, csrfToken string, expectedStatus int) []byte {
	return mutateTestJSON(t, client, http.MethodPost, serverURL, origin, path, body, csrfToken, expectedStatus)
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
