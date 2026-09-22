package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/api"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/calendar"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/mail"
)

// comprehensiveTestHarness keeps comprehensive tests isolated from development data and
// makes server restart and file-storage fault tests deterministic.
type comprehensiveTestHarness struct {
	ctx    context.Context
	pool   *pgxpool.Pool
	config config.Config
	server *httptest.Server
}

func newComprehensiveTestHarness(t *testing.T) *comprehensiveTestHarness {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to the isolated jl_business_test database")
	}
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	if strings.TrimPrefix(parsed.Path, "/") != "jl_business_test" {
		t.Fatalf("refusing to run comprehensive test tests against %q; TEST_DATABASE_URL must target jl_business_test", parsed.Path)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		cancel()
		t.Fatalf("create comprehensive test test database pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		cancel()
		t.Fatalf("ping comprehensive test test database: %v", err)
	}
	var migrated bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.accounts') IS NOT NULL AND to_regclass('public.file_assets') IS NOT NULL AND to_regclass('public.file_cleanup_failures') IS NOT NULL AND to_regclass('public.import_jobs') IS NULL`).Scan(&migrated); err != nil {
		pool.Close()
		cancel()
		t.Fatalf("check comprehensive test migrations: %v", err)
	}
	if !migrated {
		pool.Close()
		cancel()
		t.Fatal("Required and V1 closure migrations are not applied; run make migrate-test-up first")
	}
	if _, err := pool.Exec(ctx, `TRUNCATE security_audit_logs, invitation_uses, browser_session_accounts, browser_sessions, invitation_codes, accounts CASCADE`); err != nil {
		pool.Close()
		cancel()
		t.Fatalf("reset isolated comprehensive test test database: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO finance_categories (user_id, type, name) VALUES (NULL, 'INCOME', '其他收入'), (NULL, 'EXPENSE', '其他支出'), (NULL, 'EXPENSE', '生活'), (NULL, 'EXPENSE', '交通'), (NULL, 'EXPENSE', '学习')`); err != nil {
		pool.Close()
		cancel()
		t.Fatalf("restore comprehensive test finance system categories: %v", err)
	}

	fileRoot := t.TempDir()
	superadminUsername := os.Getenv("E2E_SUPERADMIN_USERNAME")
	if superadminUsername == "" {
		superadminUsername = "test-superadmin"
	}
	superadminPassword := os.Getenv("E2E_SUPERADMIN_PASSWORD")
	if superadminPassword == "" {
		superadminPassword = "test-superadmin-password"
	}
	cfg := config.Config{
		AppEnv:              "test",
		DatabaseURL:         databaseURL,
		PublicBaseURL:       "http://127.0.0.1:5173",
		CookieSecure:        false,
		SuperadminUsername:  superadminUsername,
		SuperadminPassword:  superadminPassword,
		MailMode:            "file",
		FileRoot:            fileRoot,
		MailOutboxRoot:      fileRoot,
		MaxDocumentUploadMB: 1,
		MaxImageUploadMB:    1,
	}
	authService := auth.NewService(pool, cfg)
	if err := authService.BootstrapSuperAdmin(ctx); err != nil {
		pool.Close()
		cancel()
		t.Fatalf("bootstrap comprehensive test super administrator: %v", err)
	}
	harness := &comprehensiveTestHarness{ctx: ctx, pool: pool, config: cfg, server: httptest.NewServer(newServer(pool, cfg, authService))}
	t.Cleanup(func() {
		harness.server.Close()
		pool.Close()
		cancel()
	})
	return harness
}

func (h *comprehensiveTestHarness) restart() {
	h.server.Close()
	h.server = httptest.NewServer(newServer(h.pool, h.config, auth.NewService(h.pool, h.config)))
}

func comprehensiveSuperAdmin(t *testing.T, h *comprehensiveTestHarness) (*http.Client, api.AuthResponse) {
	t.Helper()
	client := newTestClient(t)
	body := postTestJSON(t, client, h.server.URL, h.config.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": h.config.SuperadminUsername,
		"password": h.config.SuperadminPassword,
	}, "", http.StatusOK)
	var response api.AuthResponse
	decodeTestJSON(t, body, &response)
	return client, response
}

func createTestInvitation(t *testing.T, h *comprehensiveTestHarness, client *http.Client, csrfToken string, uses int) api.Invitation {
	t.Helper()
	body := postTestJSON(t, client, h.server.URL, h.config.PublicBaseURL, "/api/admin/invitation-codes", map[string]int{"max_uses": uses}, csrfToken, http.StatusCreated)
	var response api.InvitationResponse
	decodeTestJSON(t, body, &response)
	return response.Data
}

func registerTestUser(t *testing.T, h *comprehensiveTestHarness, username, password, invitationCode string) (*http.Client, api.AuthResponse) {
	t.Helper()
	client := newTestClient(t)
	body := postTestJSON(t, client, h.server.URL, h.config.PublicBaseURL, "/api/auth/register", map[string]string{
		"username":        username,
		"password":        password,
		"invitation_code": invitationCode,
	}, "", http.StatusCreated)
	var response api.AuthResponse
	decodeTestJSON(t, body, &response)
	return client, response
}

func TestSecurityIsolationIntegration(t *testing.T) {
	h := newComprehensiveTestHarness(t)
	superClient, superAuth := comprehensiveSuperAdmin(t, h)

	adminBody := postTestJSON(t, superClient, h.server.URL, h.config.PublicBaseURL, "/api/admin/admins", map[string]string{
		"username": "security-admin",
		"password": "security-admin-password",
	}, superAuth.Data.CsrfToken, http.StatusCreated)
	var ordinaryAdmin api.AccountResponse
	decodeTestJSON(t, adminBody, &ordinaryAdmin)
	invitation := createTestInvitation(t, h, superClient, superAuth.Data.CsrfToken, 2)

	userAClient, userAAuth := registerTestUser(t, h, "security-user-a", "security-user-a-password", invitation.Code)
	userBClient, userBAuth := registerTestUser(t, h, "security-user-b", "security-user-b-password", invitation.Code)
	workDate := "2026-09-15"
	postTestJSON(t, userAClient, h.server.URL, h.config.PublicBaseURL, "/api/worklogs", map[string]interface{}{
		"work_date": workDate, "open_conversation_count": 1, "deep_conversation_count": 1, "buffer_count": 0, "story_share_count": 0,
		"screening_count": 0, "opportunity_count": 0, "meeting_count": 1, "customer_followup_count": 0, "reading_minutes": 0, "audio_minutes": 0,
	}, userAAuth.Data.CsrfToken, http.StatusCreated)
	fileID := uploadTestFile(t, userAClient, h.server.URL, h.config.PublicBaseURL, userAAuth.Data.CsrfToken, "owner-file.txt", "owned by user A")
	getTestJSON(t, userAClient, h.server.URL, "/api/analytics/worklogs?from=2026-09-01&to=2026-10-01&granularity=day", http.StatusOK)

	getTestJSON(t, userBClient, h.server.URL, "/api/worklogs/"+workDate, http.StatusNotFound)
	getTestJSON(t, userBClient, h.server.URL, "/api/files/"+fileID.String()+"/content?disposition=inline", http.StatusNotFound)
	fileList := getTestJSON(t, userBClient, h.server.URL, "/api/files", http.StatusOK)
	var listedFiles api.FileListResponse
	decodeTestJSON(t, fileList, &listedFiles)
	for _, item := range listedFiles.Data.Items {
		if item.Id == fileID {
			t.Fatal("User B file listing exposed User A file")
		}
	}

	getTestJSON(t, userAClient, h.server.URL, "/api/admin/users", http.StatusForbidden)
	adminClient := newTestClient(t)
	adminLogin := postTestJSON(t, adminClient, h.server.URL, h.config.PublicBaseURL, "/api/auth/login", map[string]string{
		"username": "security-admin",
		"password": "security-admin-password",
	}, "", http.StatusOK)
	var ordinaryAdminAuth api.AuthResponse
	decodeTestJSON(t, adminLogin, &ordinaryAdminAuth)
	for _, path := range []string{
		"/api/dashboard?date=" + workDate,
		"/api/worklogs?from=" + workDate + "&to=" + workDate,
		"/api/files",
		"/api/admin/admins",
	} {
		getTestJSON(t, adminClient, h.server.URL, path, http.StatusForbidden)
	}
	deleteTestJSON(t, adminClient, h.server.URL, "/api/admin/admins/"+superAuth.Data.Account.Id.String(), ordinaryAdminAuth.Data.CsrfToken, http.StatusForbidden)

	if _, err := h.pool.Exec(h.ctx, `UPDATE accounts SET status='DELETING' WHERE id=$1`, auth.ToPGUUID(uuid.UUID(userBAuth.Data.Account.Id))); err != nil {
		t.Fatalf("set account to DELETING: %v", err)
	}
	getTestJSON(t, userBClient, h.server.URL, "/api/auth/me", http.StatusForbidden)
	postTestJSON(t, userBClient, h.server.URL, h.config.PublicBaseURL, "/api/worklogs", map[string]interface{}{
		"work_date": "2026-09-16", "open_conversation_count": 1, "deep_conversation_count": 0, "buffer_count": 0, "story_share_count": 0,
		"screening_count": 0, "opportunity_count": 0, "meeting_count": 0, "customer_followup_count": 0, "reading_minutes": 0, "audio_minutes": 0,
	}, userBAuth.Data.CsrfToken, http.StatusForbidden)
}

type failingSender struct{}

func (failingSender) Send(context.Context, mail.Message) (string, error) {
	return "", errors.New("controlled mail transport failure")
}

func TestFaultHandlingIntegration(t *testing.T) {
	h := newComprehensiveTestHarness(t)
	superClient, superAuth := comprehensiveSuperAdmin(t, h)
	invitation := createTestInvitation(t, h, superClient, superAuth.Data.CsrfToken, 1)
	userClient, userAuth := registerTestUser(t, h, "fault-user", "fault-user-password", invitation.Code)

	uploadTestFileWithLimits(t, userClient, h, userAuth.Data.CsrfToken, "unsupported.exe", "application/octet-stream", "KNOWLEDGE_DOCUMENT", []byte("not an allowed file"), http.StatusBadRequest)
	uploadTestFileWithLimits(t, userClient, h, userAuth.Data.CsrfToken, "oversized.txt", "text/plain", "KNOWLEDGE_DOCUMENT", bytes.Repeat([]byte("x"), 1024*1024+1), http.StatusRequestEntityTooLarge)
	postTestJSON(t, userClient, h.server.URL, h.config.PublicBaseURL, "/api/turnover", map[string]interface{}{
		"turnover_date": "2026-09-15", "pv": 2, "net_amount": "30.00",
	}, userAuth.Data.CsrfToken, http.StatusBadRequest)

	eventStart := time.Date(2026, time.September, 16, 9, 0, 0, 0, time.UTC)
	_, err := calendar.NewService(h.pool, failingSender{}).Save(h.ctx, uuid.UUID(userAuth.Data.Account.Id), uuid.Nil, calendar.Input{
		Title:              "comprehensive test mail failure",
		Timezone:           "Asia/Shanghai",
		StartAt:            eventStart,
		EndAt:              eventStart.Add(time.Hour),
		RecurrenceFreq:     "NONE",
		RecurrenceInterval: 1,
		RecurrenceEndType:  "NEVER",
		Attendees:          []calendar.Attendee{{Email: "fault@example.com"}},
	})
	if err != nil {
		t.Fatalf("save calendar event with a failing mail sender: %v", err)
	}
	var deliveryStatus, deliveryError string
	if err := h.pool.QueryRow(h.ctx, `SELECT status::text,COALESCE(error_message,'') FROM mail_deliveries ORDER BY created_at DESC LIMIT 1`).Scan(&deliveryStatus, &deliveryError); err != nil {
		t.Fatalf("read controlled failed mail delivery: %v", err)
	}
	if deliveryStatus != "FAILED" || !strings.Contains(deliveryError, "controlled mail transport failure") {
		t.Fatalf("mail failure delivery = status %q, error %q", deliveryStatus, deliveryError)
	}

	h.restart()
	getTestJSON(t, userClient, h.server.URL, "/api/auth/me", http.StatusOK)
}

func uploadTestFileWithLimits(t *testing.T, client *http.Client, h *comprehensiveTestHarness, csrfToken, filename, contentType, category string, content []byte, expectedStatus int) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("category", category); err != nil {
		t.Fatalf("write comprehensive test file category: %v", err)
	}
	part, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": {fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename)},
		"Content-Type":        {contentType},
	})
	if err != nil {
		t.Fatalf("create comprehensive test file part: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write comprehensive test file content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close comprehensive test file form: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, endpointURL(h.server.URL, "/api/files"), &body)
	if err != nil {
		t.Fatalf("create comprehensive test file upload request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Origin", h.config.PublicBaseURL)
	request.Header.Set("X-CSRF-Token", csrfToken)
	request.Header.Set("X-Forwarded-For", testClientIP(client))
	doTestRequest(t, client, request, expectedStatus)
}

type performanceUser struct {
	client      *http.Client
	loginClient *http.Client
	username    string
	password    string
	csrf        string
}

type performanceRequestResult struct {
	path     string
	duration time.Duration
	status   int
	body     []byte
	err      error
}

func TestPerformanceIntegration(t *testing.T) {
	if os.Getenv("RUN_PERFORMANCE_TESTS") != "1" {
		t.Skip("set RUN_PERFORMANCE_TESTS=1 to run the 50-user comprehensive performance test")
	}
	h := newComprehensiveTestHarness(t)
	superClient, superAuth := comprehensiveSuperAdmin(t, h)
	invitation := createTestInvitation(t, h, superClient, superAuth.Data.CsrfToken, 50)
	users := make([]performanceUser, 0, 50)
	for index := 0; index < 50; index++ {
		username := fmt.Sprintf("performance-user-%02d", index+1)
		password := fmt.Sprintf("performance-password-%02d", index+1)
		client, registered := registerTestUser(t, h, username, password, invitation.Code)
		users = append(users, performanceUser{client: client, loginClient: newTestClient(t), username: username, password: password, csrf: registered.Data.CsrfToken})
	}

	var (
		results []performanceRequestResult
		mu      sync.Mutex
		group   sync.WaitGroup
	)
	for _, user := range users {
		user := user
		group.Add(1)
		go func() {
			defer group.Done()
			requests := []performanceRequestResult{
				performanceRequest(user.loginClient, h.server.URL, h.config.PublicBaseURL, http.MethodPost, "/api/auth/login", map[string]string{"username": user.username, "password": user.password}, ""),
				performanceRequest(user.client, h.server.URL, h.config.PublicBaseURL, http.MethodGet, "/api/dashboard?date=2026-09-15", nil, ""),
				performanceRequest(user.client, h.server.URL, h.config.PublicBaseURL, http.MethodGet, "/api/worklogs?from=2026-09-01&to=2026-09-30", nil, ""),
				performanceRequest(user.client, h.server.URL, h.config.PublicBaseURL, http.MethodPost, "/api/worklogs", map[string]interface{}{
					"work_date": "2026-09-15", "open_conversation_count": 1, "deep_conversation_count": 1, "buffer_count": 0, "story_share_count": 0,
					"screening_count": 0, "opportunity_count": 0, "meeting_count": 1, "customer_followup_count": 0, "reading_minutes": 5, "audio_minutes": 0,
				}, user.csrf),
				performanceRequest(user.client, h.server.URL, h.config.PublicBaseURL, http.MethodGet, "/api/turnover?from=2026-09-01&to=2026-09-30", nil, ""),
				performanceRequest(user.client, h.server.URL, h.config.PublicBaseURL, http.MethodGet, "/api/analytics/worklogs?from=2026-09-01&to=2026-09-30&granularity=day", nil, ""),
				performanceRequest(user.client, h.server.URL, h.config.PublicBaseURL, http.MethodGet, "/api/search?q=performance", nil, ""),
			}
			mu.Lock()
			results = append(results, requests...)
			mu.Unlock()
		}()
	}
	group.Wait()

	latencies := make([]time.Duration, 0, len(results))
	failed, serverErrors, slow := 0, 0, 0
	statusCounts := make(map[int]int)
	pathStatusCounts := make(map[string]map[int]int)
	requestErrors := make([]string, 0)
	for _, result := range results {
		latencies = append(latencies, result.duration)
		statusCounts[result.status]++
		if pathStatusCounts[result.path] == nil {
			pathStatusCounts[result.path] = make(map[int]int)
		}
		pathStatusCounts[result.path][result.status]++
		if result.err != nil {
			requestErrors = append(requestErrors, result.err.Error())
		}
		if result.status < http.StatusOK || result.status >= http.StatusMultipleChoices {
			requestErrors = append(requestErrors, fmt.Sprintf("%s status=%d body=%s", result.path, result.status, strings.TrimSpace(string(result.body))))
		}
		if result.err != nil || result.status < http.StatusOK || result.status >= http.StatusMultipleChoices {
			failed++
		}
		if result.status >= http.StatusInternalServerError {
			serverErrors++
		}
		if result.duration > 500*time.Millisecond {
			slow++
		}
	}
	sort.Slice(latencies, func(left, right int) bool { return latencies[left] < latencies[right] })
	if len(latencies) == 0 {
		t.Fatal("performance test produced no requests")
	}
	poolStat := h.pool.Stat()
	var dbConnections, waitingLocks int
	if err := h.pool.QueryRow(h.ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()`).Scan(&dbConnections); err != nil {
		t.Fatalf("measure database connections: %v", err)
	}
	if err := h.pool.QueryRow(h.ctx, `SELECT count(*) FROM pg_locks WHERE NOT granted`).Scan(&waitingLocks); err != nil {
		t.Fatalf("measure database lock waits: %v", err)
	}
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	p50 := latencies[(len(latencies)-1)*50/100]
	p95 := latencies[(len(latencies)-1)*95/100]
	t.Logf("comprehensive test performance: requests=%d success=%d failed=%d server_5xx=%d p50=%s p95=%s max=%s slow_over_500ms=%d db_connections=%d pool_total=%d pool_acquired=%d pool_idle=%d waiting_locks=%d heap_alloc_bytes=%d heap_sys_bytes=%d goroutines=%d status_counts=%v path_status_counts=%v request_errors=%v", len(results), len(results)-failed, failed, serverErrors, p50, p95, latencies[len(latencies)-1], slow, dbConnections, poolStat.TotalConns(), poolStat.AcquiredConns(), poolStat.IdleConns(), waitingLocks, memory.HeapAlloc, memory.HeapSys, runtime.NumGoroutine(), statusCounts, pathStatusCounts, requestErrors)
	if failed != 0 || serverErrors != 0 || waitingLocks != 0 {
		t.Fatalf("performance regression: failed=%d server_5xx=%d waiting_locks=%d", failed, serverErrors, waitingLocks)
	}
}

func performanceRequest(client *http.Client, serverURL, origin, method, path string, body interface{}, csrfToken string) performanceRequestResult {
	started := time.Now()
	result := performanceRequestResult{path: path}
	var payload io.Reader
	if body != nil {
		encoded, err := marshalTestJSON(body)
		if err != nil {
			result.duration, result.err = time.Since(started), err
			return result
		}
		payload = bytes.NewReader(encoded)
	}
	request, err := http.NewRequest(method, endpointURL(serverURL, path), payload)
	if err != nil {
		result.duration, result.err = time.Since(started), err
		return result
	}
	request.Header.Set("X-Forwarded-For", testClientIP(client))
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if method != http.MethodGet && method != http.MethodHead {
		request.Header.Set("Origin", origin)
	}
	if csrfToken != "" {
		request.Header.Set("X-CSRF-Token", csrfToken)
	}
	response, err := client.Do(request)
	result.duration = time.Since(started)
	if err != nil {
		result.err = err
		return result
	}
	defer response.Body.Close()
	result.body, result.err = io.ReadAll(response.Body)
	result.status = response.StatusCode
	return result
}

func marshalTestJSON(value interface{}) ([]byte, error) {
	return json.Marshal(value)
}
