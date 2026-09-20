package release

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"jl-business-growth/backend/internal/buildinfo"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/problem"
)

func TestLatestIgnoresDraftPrereleaseAndComparesNumericSemver(t *testing.T) {
	server := releaseServer(t, `[
      {"tag_name":"v9.0.0","name":"draft","html_url":"https://example.invalid/draft","published_at":"2026-09-01T00:00:00Z","draft":true,"prerelease":false},
      {"tag_name":"v2.0.0","name":"preview","html_url":"https://example.invalid/preview","published_at":"2026-09-02T00:00:00Z","draft":false,"prerelease":true},
      {"tag_name":"v1.0.9","name":"old","html_url":"https://example.invalid/old","published_at":"2026-09-03T00:00:00Z","draft":false,"prerelease":false},
      {"tag_name":"v1.0.10","name":"latest","html_url":"https://example.invalid/latest","published_at":"2026-09-04T00:00:00Z","draft":false,"prerelease":false},
      {"tag_name":"not-semver","name":"invalid","html_url":"https://example.invalid/invalid","published_at":"2026-09-05T00:00:00Z","draft":false,"prerelease":false}
    ]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.9")
	service := testService(t, server.URL, false)

	state := service.State(context.Background(), true)
	if state.Latest == nil || state.Latest.Version != "v1.0.10" {
		t.Fatalf("latest = %+v, want v1.0.10", state.Latest)
	}
	if !state.UpdateAvailable {
		t.Fatal("UpdateAvailable = false, want true")
	}
	if CompareVersions("v1.0.10", "v1.0.9") <= 0 {
		t.Fatal("numeric semantic version comparison regressed")
	}
}

func TestGitHubTimeoutKeepsCurrentBuildVisible(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		<-request.Context().Done()
	}))
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, false)
	service.httpClient.Timeout = 10 * time.Millisecond

	state := service.State(context.Background(), true)
	if state.Build.Version != "v1.0.0" || state.CheckError == "" {
		t.Fatalf("state = %+v, want current build plus safe check error", state)
	}
}

func TestQueueRejectsInvalidAndUnavailableTargets(t *testing.T) {
	server := releaseServer(t, `[]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, true)

	for _, target := range []string{"1.0.1", "v1.0.0;rm -rf /", "https://example.invalid/v1.0.1"} {
		_, _, err := service.Queue(context.Background(), "update", target)
		assertProblemCode(t, err, "VALIDATION_ERROR")
	}
	_, _, err := service.Queue(context.Background(), "update", "v1.0.1")
	assertProblemCode(t, err, "RELEASE_NOT_FOUND")
}

func TestQueueRejectsWhenUpdaterDisabled(t *testing.T) {
	service := testService(t, "http://127.0.0.1", false)
	_, _, err := service.Queue(context.Background(), "update", "v1.0.1")
	assertProblemCode(t, err, "RELEASE_UPDATE_DISABLED")
}

func TestQueueUsesPersistentLockToRejectSecondTask(t *testing.T) {
	server := releaseServer(t, `[{
      "tag_name":"v1.0.1","name":"release","html_url":"https://example.invalid/v1.0.1",
      "published_at":"2026-09-04T00:00:00Z","draft":false,"prerelease":false
    }]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, true)

	state, requestID, err := service.Queue(context.Background(), "update", "v1.0.1")
	if err != nil {
		t.Fatalf("first Queue() error = %v", err)
	}
	if requestID == "" || state.UpdateStatus == nil || state.UpdateStatus.State != "queued" {
		t.Fatalf("queued state = %+v, requestID = %q", state.UpdateStatus, requestID)
	}
	_, _, err = service.Queue(context.Background(), "update", "v1.0.1")
	assertProblemCode(t, err, "UPDATE_ALREADY_RUNNING")
}

func TestQueueUsesRequestBoundaryAndQueuedFallback(t *testing.T) {
	server := releaseServer(t, `[{"tag_name":"v1.0.1","name":"release","html_url":"https://example.invalid/v1.0.1","published_at":"2026-09-04T00:00:00Z","draft":false,"prerelease":false}]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, true)

	_, requestID, err := service.Queue(context.Background(), "update", "v1.0.1")
	if err != nil {
		t.Fatalf("Queue() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(service.cfg.ReleaseRuntimeRoot, "status.json")); !os.IsNotExist(err) {
		t.Fatalf("legacy runtime status exists or returned unexpected error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(service.cfg.ReleaseRuntimeRoot, "requests", "request.json")); err != nil {
		t.Fatalf("request.json was not written under requests: %v", err)
	}
	state := service.State(context.Background(), false)
	if state.UpdateStatus == nil || state.UpdateStatus.RequestID != requestID || state.UpdateStatus.State != "queued" {
		t.Fatalf("queued fallback state = %+v", state.UpdateStatus)
	}
}

func TestStatePrefersRootAuthoritativeStatus(t *testing.T) {
	server := releaseServer(t, `[]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, true)
	stateRoot := filepath.Join(service.cfg.ReleaseRuntimeRoot, "state")
	requestRoot := filepath.Join(service.cfg.ReleaseRuntimeRoot, "requests")
	if err := os.MkdirAll(stateRoot, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(requestRoot, 0o770); err != nil {
		t.Fatal(err)
	}
	queued := UpdateStatus{RequestID: "11111111-1111-4111-8111-111111111111", Action: "update", FromVersion: "v1.0.0", TargetVersion: "v1.0.1", State: "queued", StartedAt: time.Now().UTC(), SafeMessage: "queued"}
	succeeded := queued
	succeeded.State = "succeeded"
	succeeded.SafeMessage = "authoritative"
	if err := writeJSONAtomic(filepath.Join(requestRoot, "queued-status.json"), queued); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(requestRoot, "update.lock"), []byte(queued.RequestID+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeJSONAtomic(filepath.Join(stateRoot, "status.json"), succeeded); err != nil {
		t.Fatal(err)
	}
	state := service.State(context.Background(), false)
	if state.UpdateStatus == nil || state.UpdateStatus.State != "succeeded" || state.UpdateStatus.SafeMessage != "authoritative" {
		t.Fatalf("authoritative state = %+v", state.UpdateStatus)
	}
}

func TestStateShowsNewQueuedRequestOverStaleAuthoritativeStatus(t *testing.T) {
	server := releaseServer(t, `[]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, true)
	stateRoot := filepath.Join(service.cfg.ReleaseRuntimeRoot, "state")
	requestRoot := filepath.Join(service.cfg.ReleaseRuntimeRoot, "requests")
	if err := os.MkdirAll(stateRoot, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(requestRoot, 0o770); err != nil {
		t.Fatal(err)
	}
	authoritative := UpdateStatus{RequestID: "11111111-1111-4111-8111-111111111111", Action: "update", FromVersion: "v1.0.0", TargetVersion: "v1.0.1", State: "succeeded", StartedAt: time.Now().UTC(), SafeMessage: "old"}
	queued := UpdateStatus{RequestID: "22222222-2222-4222-8222-222222222222", Action: "update", FromVersion: "v1.0.0", TargetVersion: "v1.0.2", State: "queued", StartedAt: time.Now().UTC(), SafeMessage: "new"}
	if err := writeJSONAtomic(filepath.Join(stateRoot, "status.json"), authoritative); err != nil {
		t.Fatal(err)
	}
	if err := writeJSONAtomic(filepath.Join(requestRoot, "queued-status.json"), queued); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(requestRoot, "update.lock"), []byte(queued.RequestID+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	state := service.State(context.Background(), false)
	if state.UpdateStatus == nil || state.UpdateStatus.RequestID != queued.RequestID || state.UpdateStatus.State != "queued" {
		t.Fatalf("queued state = %+v", state.UpdateStatus)
	}
}

func TestStatePrefersAuthoritativeStatusForSameQueuedRequest(t *testing.T) {
	server := releaseServer(t, `[]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, true)
	stateRoot := filepath.Join(service.cfg.ReleaseRuntimeRoot, "state")
	requestRoot := filepath.Join(service.cfg.ReleaseRuntimeRoot, "requests")
	if err := os.MkdirAll(stateRoot, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(requestRoot, 0o770); err != nil {
		t.Fatal(err)
	}
	queued := UpdateStatus{RequestID: "33333333-3333-4333-8333-333333333333", Action: "update", FromVersion: "v1.0.0", TargetVersion: "v1.0.1", State: "queued", StartedAt: time.Now().UTC(), SafeMessage: "queued"}
	authoritative := queued
	authoritative.State = "downloading"
	authoritative.SafeMessage = "authoritative"
	if err := writeJSONAtomic(filepath.Join(requestRoot, "queued-status.json"), queued); err != nil {
		t.Fatal(err)
	}
	if err := writeJSONAtomic(filepath.Join(stateRoot, "status.json"), authoritative); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(requestRoot, "update.lock"), []byte(queued.RequestID+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	state := service.State(context.Background(), false)
	if state.UpdateStatus == nil || state.UpdateStatus.RequestID != queued.RequestID || state.UpdateStatus.State != "downloading" || state.UpdateStatus.SafeMessage != "authoritative" {
		t.Fatalf("authoritative state = %+v", state.UpdateStatus)
	}
}

func TestStateRejectsQueuedMetadataWithoutMatchingLock(t *testing.T) {
	server := releaseServer(t, `[]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.0")
	service := testService(t, server.URL, true)
	requestRoot := filepath.Join(service.cfg.ReleaseRuntimeRoot, "requests")
	if err := os.MkdirAll(requestRoot, 0o770); err != nil {
		t.Fatal(err)
	}
	queued := UpdateStatus{RequestID: "44444444-4444-4444-8444-444444444444", Action: "update", FromVersion: "v1.0.0", TargetVersion: "v1.0.1", State: "queued", StartedAt: time.Now().UTC(), SafeMessage: "forged"}
	if err := writeJSONAtomic(filepath.Join(requestRoot, "queued-status.json"), queued); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(requestRoot, "update.lock"), []byte("different-request\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	state := service.State(context.Background(), false)
	if state.UpdateStatus != nil {
		t.Fatalf("untrusted queued state = %+v, want nil", state.UpdateStatus)
	}
}

func TestRollbackRejectsIncompatibleSchema(t *testing.T) {
	server := releaseServer(t, `[{
      "tag_name":"v1.0.0","name":"release","html_url":"https://example.invalid/v1.0.0",
      "published_at":"2026-09-04T00:00:00Z","draft":false,"prerelease":false
    }]`)
	defer server.Close()
	setBuildVersion(t, "v1.0.1")
	service := testService(t, server.URL, true)
	targetDir := filepath.Join(service.cfg.ReleaseBackendRoot, "v1.0.0")
	if err := os.MkdirAll(targetDir, 0o700); err != nil {
		t.Fatal(err)
	}
	manifestBody := `{"version":"v1.0.0","git_sha":"abc","built_at":"2026-09-01T00:00:00Z","platform":"linux-amd64","schema_version":10,"compatible_schema_min":10,"compatible_schema_max":10}`
	if err := os.WriteFile(filepath.Join(targetDir, "release.json"), []byte(manifestBody), 0o600); err != nil {
		t.Fatal(err)
	}

	_, _, err := service.Queue(context.Background(), "rollback", "v1.0.0")
	assertProblemCode(t, err, "ROLLBACK_NOT_ALLOWED")
}

func testService(t *testing.T, githubBase string, enabled bool) *Service {
	t.Helper()
	root := t.TempDir()
	service := NewService(config.Config{
		ReleaseRepository:    "QQQHHHDDD/jl-business-growth",
		ReleaseUpdateEnabled: enabled,
		ReleaseRuntimeRoot:   filepath.Join(root, "runtime"),
		ReleaseBackendRoot:   filepath.Join(root, "releases"),
		ReleaseWebRoot:       filepath.Join(root, "web"),
	}, func(context.Context) (int64, error) { return 11, nil })
	service.githubAPIBase = githubBase
	return service
}

func releaseServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("User-Agent") == "" {
			t.Error("GitHub request is missing User-Agent")
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(body))
	}))
}

func setBuildVersion(t *testing.T, version string) {
	t.Helper()
	previous := buildinfo.Current()
	buildinfo.Version = version
	buildinfo.Commit = "test-commit"
	buildinfo.BuildTime = "2026-09-19T00:00:00Z"
	t.Cleanup(func() {
		buildinfo.Version = previous.Version
		buildinfo.Commit = previous.Commit
		buildinfo.BuildTime = previous.BuildTime
	})
}

func assertProblemCode(t *testing.T, err error, code string) {
	t.Helper()
	value, ok := problem.As(err)
	if !ok || value.Code != code {
		t.Fatalf("error = %v, want problem code %s", err, code)
	}
}
