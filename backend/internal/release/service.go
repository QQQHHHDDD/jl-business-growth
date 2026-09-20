package release

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"jl-business-growth/backend/internal/buildinfo"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/problem"
)

const (
	githubAPIBase = "https://api.github.com"
	cacheTTL      = 5 * time.Minute
)

var stableVersionPattern = regexp.MustCompile(`^v([0-9]+)\.([0-9]+)\.([0-9]+)$`)

type LatestRelease struct {
	Version     string
	Name        string
	PublishedAt time.Time
	HTMLURL     string
}

type InstalledRelease struct {
	Version               string
	Current               bool
	RollbackAllowed       bool
	InstalledAt           *time.Time
	RollbackBlockedReason string
}

type UpdateStatus struct {
	RequestID     string     `json:"request_id"`
	Action        string     `json:"action"`
	FromVersion   string     `json:"from_version"`
	TargetVersion string     `json:"target_version"`
	State         string     `json:"state"`
	StartedAt     time.Time  `json:"started_at"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
	SafeMessage   string     `json:"safe_message"`
}

type State struct {
	Build             buildinfo.Info
	Latest            *LatestRelease
	UpdateAvailable   bool
	UpdateEnabled     bool
	InstalledVersions []InstalledRelease
	UpdateStatus      *UpdateStatus
	CheckError        string
}

type manifest struct {
	Version             string    `json:"version"`
	GitSHA              string    `json:"git_sha"`
	BuiltAt             time.Time `json:"built_at"`
	Platform            string    `json:"platform"`
	SchemaVersion       int64     `json:"schema_version"`
	CompatibleSchemaMin int64     `json:"compatible_schema_min"`
	CompatibleSchemaMax int64     `json:"compatible_schema_max"`
}

type updateRequest struct {
	RequestID     string    `json:"request_id"`
	Action        string    `json:"action"`
	FromVersion   string    `json:"from_version"`
	TargetVersion string    `json:"target_version"`
	Repository    string    `json:"repository"`
	RequestedAt   time.Time `json:"requested_at"`
}

type githubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt time.Time `json:"published_at"`
	Draft       bool      `json:"draft"`
	Prerelease  bool      `json:"prerelease"`
}

type Service struct {
	cfg           config.Config
	httpClient    *http.Client
	githubAPIBase string
	schemaVersion func(context.Context) (int64, error)
	now           func() time.Time

	cacheMu  sync.Mutex
	cached   *LatestRelease
	cachedAt time.Time
}

func requestRoot(cfg config.Config) string {
	if cfg.ReleaseRequestRoot != "" {
		return cfg.ReleaseRequestRoot
	}
	return filepath.Join(cfg.ReleaseRuntimeRoot, "requests")
}

func stateRoot(cfg config.Config) string {
	if cfg.ReleaseStateRoot != "" {
		return cfg.ReleaseStateRoot
	}
	return filepath.Join(cfg.ReleaseRuntimeRoot, "state")
}

func NewService(cfg config.Config, schemaVersion func(context.Context) (int64, error)) *Service {
	return NewServiceWithClient(cfg, schemaVersion, &http.Client{Timeout: 5 * time.Second}, githubAPIBase)
}

// NewServiceWithClient exists for deterministic tests. Application wiring uses
// NewService so the API base remains fixed and cannot be supplied by clients.
func NewServiceWithClient(cfg config.Config, schemaVersion func(context.Context) (int64, error), client *http.Client, apiBase string) *Service {
	return &Service{cfg: cfg, httpClient: client, githubAPIBase: apiBase, schemaVersion: schemaVersion, now: time.Now}
}

func (s *Service) State(ctx context.Context, refresh bool) State {
	state := State{Build: buildinfo.Current(), UpdateEnabled: s.cfg.ReleaseUpdateEnabled}
	currentSchema, schemaErr := s.currentSchema(ctx)
	state.InstalledVersions = s.installedVersions(currentSchema)
	state.UpdateStatus = s.readStatus()

	latest, err := s.latest(ctx, refresh)
	if err != nil {
		state.CheckError = "无法检查最新版本，请稍后重试"
	} else {
		state.Latest = latest
		state.UpdateAvailable = latest != nil && IsStableVersion(state.Build.Version) && CompareVersions(latest.Version, state.Build.Version) > 0
	}
	if schemaErr != nil && len(state.InstalledVersions) == 0 {
		state.InstalledVersions = []InstalledRelease{{Version: state.Build.Version, Current: true, RollbackAllowed: false, RollbackBlockedReason: "无法确认当前数据库版本"}}
	}
	return state
}

func (s *Service) Queue(ctx context.Context, action, target string) (State, string, error) {
	if !s.cfg.ReleaseUpdateEnabled {
		return State{}, "", problem.New("RELEASE_UPDATE_DISABLED", http.StatusConflict, "当前服务器未启用在线更新")
	}
	if action != "update" && action != "rollback" {
		return State{}, "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "版本操作无效")
	}
	if !IsStableVersion(target) {
		return State{}, "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "版本号格式无效")
	}

	latest, err := s.findRelease(ctx, target)
	if err != nil {
		return State{}, "", err
	}
	if latest == nil {
		return State{}, "", problem.New("RELEASE_NOT_FOUND", http.StatusBadRequest, "目标版本不是该仓库的正式 GitHub Release")
	}

	current := buildinfo.Current().Version
	currentSchema, err := s.currentSchema(ctx)
	if err != nil {
		return State{}, "", problem.New("SCHEMA_VERSION_UNAVAILABLE", http.StatusConflict, "无法确认当前数据库版本")
	}
	installed := s.installedVersions(currentSchema)
	if action == "update" {
		if !IsStableVersion(current) || CompareVersions(target, current) <= 0 {
			return State{}, "", problem.New("INVALID_UPDATE_TARGET", http.StatusConflict, "目标版本必须高于当前正式版本")
		}
	} else {
		candidate := findInstalled(installed, target)
		if candidate == nil {
			return State{}, "", problem.New("ROLLBACK_NOT_INSTALLED", http.StatusConflict, "目标版本尚未安装")
		}
		if !candidate.RollbackAllowed {
			message := candidate.RollbackBlockedReason
			if message == "" {
				message = "当前数据库版本与目标版本兼容性未确认，禁止自动回退"
			}
			return State{}, "", problem.New("ROLLBACK_NOT_ALLOWED", http.StatusConflict, message)
		}
	}

	requestsRoot := requestRoot(s.cfg)
	if err := os.MkdirAll(requestsRoot, 0o770); err != nil {
		return State{}, "", problem.New("UPDATER_UNAVAILABLE", http.StatusServiceUnavailable, "版本更新服务暂不可用")
	}
	requestID := uuid.NewString()
	lockPath := filepath.Join(requestsRoot, "update.lock")
	queuedStatusPath := filepath.Join(requestsRoot, "queued-status.json")
	lock, err := os.OpenFile(lockPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		return State{}, "", problem.New("UPDATE_ALREADY_RUNNING", http.StatusConflict, "已有版本任务正在执行")
	}
	if err != nil {
		return State{}, "", problem.New("UPDATER_UNAVAILABLE", http.StatusServiceUnavailable, "版本更新服务暂不可用")
	}
	if _, err := lock.WriteString(requestID + "\n"); err != nil {
		_ = lock.Close()
		_ = os.Remove(lockPath)
		return State{}, "", problem.New("UPDATER_UNAVAILABLE", http.StatusServiceUnavailable, "无法创建版本任务")
	}
	if err := lock.Close(); err != nil {
		_ = os.Remove(lockPath)
		return State{}, "", problem.New("UPDATER_UNAVAILABLE", http.StatusServiceUnavailable, "无法创建版本任务")
	}

	now := s.now().UTC()
	request := updateRequest{RequestID: requestID, Action: action, FromVersion: current, TargetVersion: target, Repository: s.cfg.ReleaseRepository, RequestedAt: now}
	status := UpdateStatus{RequestID: requestID, Action: action, FromVersion: current, TargetVersion: target, State: "queued", StartedAt: now, SafeMessage: "版本任务已进入队列"}
	if err := writeJSONAtomic(queuedStatusPath, status); err != nil {
		_ = os.Remove(lockPath)
		return State{}, "", problem.New("UPDATER_UNAVAILABLE", http.StatusServiceUnavailable, "无法保存版本任务状态")
	}
	// request.json is the sole systemd PathExists trigger. Keep it as the final
	// commit point: after this rename the API performs no network or blocking
	// work that could race the updater.
	if err := writeJSONAtomic(filepath.Join(requestsRoot, "request.json"), request); err != nil {
		_ = os.Remove(lockPath)
		_ = os.Remove(queuedStatusPath)
		return State{}, "", problem.New("UPDATER_UNAVAILABLE", http.StatusServiceUnavailable, "无法保存版本任务")
	}

	state := State{Build: buildinfo.Current(), UpdateEnabled: s.cfg.ReleaseUpdateEnabled,
		InstalledVersions: s.installedVersions(currentSchema), UpdateStatus: &status}
	return state, requestID, nil
}

func (s *Service) latest(ctx context.Context, refresh bool) (*LatestRelease, error) {
	s.cacheMu.Lock()
	if !refresh && s.cached != nil && s.now().Sub(s.cachedAt) < cacheTTL {
		cached := *s.cached
		s.cacheMu.Unlock()
		return &cached, nil
	}
	s.cacheMu.Unlock()

	releases, err := s.fetchReleases(ctx)
	if err != nil {
		return nil, err
	}
	var latest *LatestRelease
	for _, item := range releases {
		if item.Draft || item.Prerelease || !IsStableVersion(item.TagName) {
			continue
		}
		candidate := LatestRelease{Version: item.TagName, Name: item.Name, PublishedAt: item.PublishedAt, HTMLURL: item.HTMLURL}
		if latest == nil || CompareVersions(candidate.Version, latest.Version) > 0 {
			latest = &candidate
		}
	}
	if latest != nil {
		s.cacheMu.Lock()
		copyValue := *latest
		s.cached = &copyValue
		s.cachedAt = s.now()
		s.cacheMu.Unlock()
	}
	return latest, nil
}

func (s *Service) findRelease(ctx context.Context, version string) (*LatestRelease, error) {
	releases, err := s.fetchReleases(ctx)
	if err != nil {
		return nil, problem.New("RELEASE_CHECK_FAILED", http.StatusServiceUnavailable, "暂时无法验证目标 GitHub Release")
	}
	for _, item := range releases {
		if item.TagName == version && !item.Draft && !item.Prerelease && IsStableVersion(item.TagName) {
			return &LatestRelease{Version: item.TagName, Name: item.Name, PublishedAt: item.PublishedAt, HTMLURL: item.HTMLURL}, nil
		}
	}
	return nil, nil
}

func (s *Service) fetchReleases(ctx context.Context) ([]githubRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/releases?per_page=100", s.githubAPIBase, s.cfg.ReleaseRepository)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "jl-business-growth-release-center")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if s.cfg.GitHubToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.cfg.GitHubToken)
	}
	response, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("github releases returned status %d", response.StatusCode)
	}
	var releases []githubRelease
	decoder := json.NewDecoder(io.LimitReader(response.Body, 2<<20))
	if err := decoder.Decode(&releases); err != nil {
		return nil, err
	}
	return releases, nil
}

func (s *Service) currentSchema(ctx context.Context) (int64, error) {
	if s.schemaVersion == nil {
		return 0, errors.New("schema version reader is unavailable")
	}
	return s.schemaVersion(ctx)
}

func (s *Service) installedVersions(currentSchema int64) []InstalledRelease {
	entries, err := os.ReadDir(s.cfg.ReleaseBackendRoot)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return []InstalledRelease{{Version: buildinfo.Version, Current: true, RollbackAllowed: false, RollbackBlockedReason: "无法读取已安装版本"}}
	}
	versions := make([]InstalledRelease, 0, len(entries)+1)
	seenCurrent := false
	for _, entry := range entries {
		if !entry.IsDir() || !IsStableVersion(entry.Name()) {
			continue
		}
		body, err := os.ReadFile(filepath.Join(s.cfg.ReleaseBackendRoot, entry.Name(), "release.json"))
		if err != nil {
			continue
		}
		var item manifest
		if json.Unmarshal(body, &item) != nil || item.Version != entry.Name() {
			continue
		}
		current := item.Version == buildinfo.Version
		seenCurrent = seenCurrent || current
		allowed := !current && currentSchema > 0 && item.CompatibleSchemaMin > 0 && currentSchema >= item.CompatibleSchemaMin && currentSchema <= item.CompatibleSchemaMax
		reason := ""
		if current {
			reason = "当前版本不能回退到自身"
		} else if !allowed {
			reason = "当前数据库版本与该版本兼容性未确认，禁止自动回退"
		} else if !s.cfg.ReleaseUpdateEnabled {
			reason = "当前服务器未启用在线更新"
		}
		builtAt := item.BuiltAt
		versions = append(versions, InstalledRelease{Version: item.Version, Current: current, RollbackAllowed: allowed && s.cfg.ReleaseUpdateEnabled, InstalledAt: &builtAt, RollbackBlockedReason: reason})
	}
	if !seenCurrent {
		versions = append(versions, InstalledRelease{Version: buildinfo.Version, Current: true, RollbackAllowed: false, RollbackBlockedReason: "当前版本不能回退到自身"})
	}
	sort.Slice(versions, func(i, j int) bool {
		if versions[i].Current != versions[j].Current {
			return versions[i].Current
		}
		return CompareVersions(versions[i].Version, versions[j].Version) > 0
	})
	return versions
}

func (s *Service) readStatus() *UpdateStatus {
	statusPath := filepath.Join(stateRoot(s.cfg), "status.json")
	body, err := os.ReadFile(statusPath)
	if err == nil {
		return parseStatus(body)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil
	}
	queuedBody, queuedErr := os.ReadFile(filepath.Join(requestRoot(s.cfg), "queued-status.json"))
	if queuedErr != nil {
		return nil
	}
	status := parseStatus(queuedBody)
	if status == nil || status.State != "queued" {
		return nil
	}
	return status
}

func parseStatus(body []byte) *UpdateStatus {
	var status UpdateStatus
	if json.Unmarshal(body, &status) != nil || status.RequestID == "" || !IsStableVersion(status.TargetVersion) {
		return nil
	}
	return &status
}

func IsStableVersion(value string) bool {
	return stableVersionPattern.MatchString(value)
}

func CompareVersions(left, right string) int {
	leftParts, leftOK := versionParts(left)
	rightParts, rightOK := versionParts(right)
	if !leftOK || !rightOK {
		return strings.Compare(left, right)
	}
	for index := range leftParts {
		if leftParts[index] < rightParts[index] {
			return -1
		}
		if leftParts[index] > rightParts[index] {
			return 1
		}
	}
	return 0
}

func versionParts(value string) ([3]uint64, bool) {
	match := stableVersionPattern.FindStringSubmatch(value)
	if match == nil {
		return [3]uint64{}, false
	}
	var result [3]uint64
	for index := 0; index < 3; index++ {
		part, err := strconv.ParseUint(match[index+1], 10, 64)
		if err != nil {
			return [3]uint64{}, false
		}
		result[index] = part
	}
	return result, true
}

func findInstalled(items []InstalledRelease, version string) *InstalledRelease {
	for index := range items {
		if items[index].Version == version {
			return &items[index]
		}
	}
	return nil
}

func writeJSONAtomic(path string, value any) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, append(body, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}
