package api

import (
	"errors"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"jl-business-growth/backend/internal/auth"
	fileassets "jl-business-growth/backend/internal/files"
	"jl-business-growth/backend/internal/knowledge"
	"jl-business-growth/backend/internal/problem"
	"jl-business-growth/backend/internal/search"
	"jl-business-growth/backend/internal/team"
)

func (h *Handler) ListTeamMembers(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.team.ListMembers(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	result := make([]TeamMember, 0, len(items))
	for _, item := range items {
		result = append(result, teamMemberDTO(item))
	}
	return ctx.JSON(http.StatusOK, TeamMemberListResponse{Data: struct {
		Items []TeamMember `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) GetTeamMember(ctx echo.Context, memberID MemberId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.team.GetMember(ctx.Request().Context(), userID, uuid.UUID(memberID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, TeamMemberResponse{Data: teamMemberDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CreateTeamMember(ctx echo.Context) error {
	return h.saveTeamMember(ctx, uuid.Nil, http.StatusCreated)
}
func (h *Handler) UpdateTeamMember(ctx echo.Context, memberID MemberId) error {
	return h.saveTeamMember(ctx, uuid.UUID(memberID), http.StatusOK)
}

func (h *Handler) saveTeamMember(ctx echo.Context, id uuid.UUID, status int) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request TeamMemberRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.team.SaveMember(ctx.Request().Context(), account.ID, id, teamMemberInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(status, TeamMemberResponse{Data: teamMemberDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteTeamMember(ctx echo.Context, memberID MemberId, params DeleteTeamMemberParams) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	promote := params.PromoteChildren != nil && bool(*params.PromoteChildren)
	if err := h.team.DeleteMember(ctx.Request().Context(), account.ID, uuid.UUID(memberID), promote); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListTeamSnapshots(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.team.ListSnapshots(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	result := make([]TeamSnapshot, 0, len(items))
	for _, item := range items {
		full, getErr := h.team.GetSnapshot(ctx.Request().Context(), userID, item.ID)
		if getErr != nil {
			return getErr
		}
		result = append(result, teamSnapshotDTO(full))
	}
	return ctx.JSON(http.StatusOK, TeamSnapshotListResponse{Data: struct {
		Items []TeamSnapshot `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}

func (h *Handler) GetTeamSnapshot(ctx echo.Context, snapshotID SnapshotId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.team.GetSnapshot(ctx.Request().Context(), userID, uuid.UUID(snapshotID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, TeamSnapshotResponse{Data: teamSnapshotDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) CreateTeamSnapshot(ctx echo.Context) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request TeamSnapshotRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	month := time.Now().UTC()
	if request.SnapshotMonth != nil {
		month = request.SnapshotMonth.Time
	}
	typ := "MANUAL"
	if request.SnapshotType != nil {
		typ = string(*request.SnapshotType)
	}
	late := request.CapturedLate != nil && *request.CapturedLate
	item, err := h.team.CreateSnapshot(ctx.Request().Context(), account.ID, month, typ, late)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusCreated, TeamSnapshotResponse{Data: teamSnapshotDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) ListKnowledgeItems(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.knowledge.ListItems(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	result := make([]KnowledgeItem, 0, len(items))
	for _, item := range items {
		result = append(result, knowledgeItemDTO(item))
	}
	return ctx.JSON(http.StatusOK, KnowledgeItemListResponse{Data: struct {
		Items []KnowledgeItem `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}
func (h *Handler) GetKnowledgeItem(ctx echo.Context, knowledgeID KnowledgeId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.knowledge.GetItem(ctx.Request().Context(), userID, uuid.UUID(knowledgeID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, KnowledgeItemResponse{Data: knowledgeItemDTO(item), RequestId: requestID(ctx)})
}
func (h *Handler) CreateKnowledgeItem(ctx echo.Context) error {
	return h.saveKnowledgeItem(ctx, uuid.Nil, http.StatusCreated)
}
func (h *Handler) UpdateKnowledgeItem(ctx echo.Context, knowledgeID KnowledgeId) error {
	return h.saveKnowledgeItem(ctx, uuid.UUID(knowledgeID), http.StatusOK)
}
func (h *Handler) saveKnowledgeItem(ctx echo.Context, id uuid.UUID, status int) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request KnowledgeItemRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.knowledge.SaveItem(ctx.Request().Context(), account.ID, id, knowledgeItemInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(status, KnowledgeItemResponse{Data: knowledgeItemDTO(item), RequestId: requestID(ctx)})
}
func (h *Handler) DeleteKnowledgeItem(ctx echo.Context, knowledgeID KnowledgeId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.knowledge.DeleteItem(ctx.Request().Context(), account.ID, uuid.UUID(knowledgeID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListLearningSessions(ctx echo.Context, params ListLearningSessionsParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	from, to := dateRange(params.From, params.To)
	items, err := h.knowledge.ListSessions(ctx.Request().Context(), userID, from, to)
	if err != nil {
		return err
	}
	result := make([]LearningSession, 0, len(items))
	for _, item := range items {
		result = append(result, learningSessionDTO(item))
	}
	return ctx.JSON(http.StatusOK, LearningSessionListResponse{Data: struct {
		Items []LearningSession `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}
func (h *Handler) CreateLearningSession(ctx echo.Context) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request LearningSessionRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.knowledge.SaveSession(ctx.Request().Context(), account.ID, uuid.Nil, learningSessionInput(request))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusCreated, LearningSessionResponse{Data: learningSessionDTO(item), RequestId: requestID(ctx)})
}
func (h *Handler) DeleteLearningSession(ctx echo.Context, sessionID SessionId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.knowledge.DeleteSession(ctx.Request().Context(), account.ID, uuid.UUID(sessionID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListFiles(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.files.List(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	result := make([]FileAsset, 0, len(items))
	for _, item := range items {
		result = append(result, fileDTO(item))
	}
	return ctx.JSON(http.StatusOK, FileListResponse{Data: struct {
		Items []FileAsset `json:"items"`
	}{Items: result}, RequestId: requestID(ctx)})
}
func (h *Handler) UploadFile(ctx echo.Context) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	header, err := ctx.FormFile("file")
	if err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "file is required")
	}
	asset, err := h.files.Upload(ctx.Request().Context(), account.ID, ctx.FormValue("category"), header)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusCreated, FileResponse{Data: fileDTO(asset), RequestId: requestID(ctx)})
}
func (h *Handler) DeleteFile(ctx echo.Context, fileID FileId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.files.Delete(ctx.Request().Context(), account.ID, uuid.UUID(fileID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}
func (h *Handler) GetFileContent(ctx echo.Context, fileID FileId, params GetFileContentParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	asset, path, err := h.files.Get(ctx.Request().Context(), userID, uuid.UUID(fileID))
	if err != nil {
		return err
	}
	handle, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return problem.New("NOT_FOUND", http.StatusNotFound, "file content not found")
		}
		return err
	}
	defer handle.Close()
	disposition := "inline"
	if params.Disposition != nil {
		disposition = string(*params.Disposition)
	}
	filename := mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(asset.OriginalName)})
	if disposition == "inline" {
		filename = mime.FormatMediaType("inline", map[string]string{"filename": filepath.Base(asset.OriginalName)})
	}
	ctx.Response().Header().Set(echo.HeaderContentType, asset.MIMEType)
	ctx.Response().Header().Set(echo.HeaderContentDisposition, filename)
	http.ServeContent(ctx.Response().Writer, ctx.Request(), asset.OriginalName, asset.CreatedAt, handle)
	return nil
}

func (h *Handler) Search(ctx echo.Context, params SearchParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	page, pageSize := 1, 20
	if params.Page != nil {
		page = *params.Page
	}
	if params.PageSize != nil {
		pageSize = *params.PageSize
	}
	modules := []string(nil)
	if params.Modules != nil {
		for _, value := range strings.Split(*params.Modules, ",") {
			value = strings.TrimSpace(value)
			if value == "" {
				continue
			}
			switch value {
			case "goals", "calendar", "team", "knowledge", "tags":
				modules = append(modules, value)
			default:
				return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "search module is not supported")
			}
		}
	}
	items, total, err := h.search.Search(ctx.Request().Context(), userID, params.Q, modules, page, pageSize)
	if err != nil {
		return err
	}
	result := make([]SearchResult, 0, len(items))
	for _, item := range items {
		result = append(result, searchDTO(item))
	}
	return ctx.JSON(http.StatusOK, SearchResponse{Data: struct {
		Items []SearchResult `json:"items"`
	}{Items: result}, Meta: PaginationMeta{Page: page, PageSize: pageSize, Total: total}, RequestId: requestID(ctx)})
}

func authSessionUser(ctx echo.Context) (*auth.Session, *auth.Account, error) {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return nil, nil, err
	}
	if err := requireUser(*account); err != nil {
		return nil, nil, err
	}
	return session, account, nil
}
func authVerify(ctx echo.Context, session *auth.Session) error { return auth.VerifyCSRF(ctx, session) }

func teamMemberInput(value TeamMemberRequest) team.MemberInput {
	var parent *uuid.UUID
	if value.ParentId != nil {
		v := uuid.UUID(*value.ParentId)
		parent = &v
	}
	return team.MemberInput{MemberCode: stringPointerValue(value.MemberCode), ParentID: parent, Name: value.Name, JoinedOn: dateValue(value.JoinedOn), Rank: value.Rank, City: value.City, Status: optionalEnum(value.Status, "ACTIVE"), Note: value.Note, NodeColor: stringPointerValue(value.NodeColor), SortOrder: optionalInt(value.SortOrder)}
}
func teamMemberDTO(value team.Member) TeamMember {
	return TeamMember{Id: value.ID, MemberCode: value.MemberCode, ParentId: uuidPtr(value.ParentID), Name: value.Name, JoinedOn: datePointer(value.JoinedOn), Rank: value.Rank, City: value.City, Status: TeamMemberStatus(value.Status), Note: value.Note, NodeColor: value.NodeColor, SortOrder: value.SortOrder, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func teamSnapshotDTO(value team.Snapshot) TeamSnapshot {
	members := make([]TeamSnapshotMember, 0, len(value.Members))
	for _, item := range value.Members {
		members = append(members, TeamSnapshotMember{Id: item.ID, OriginalMemberId: item.OriginalMemberID, ParentId: uuidPtr(item.ParentID), Name: item.Name, JoinedOn: datePointer(item.JoinedOn), Rank: item.Rank, City: item.City, Status: TeamSnapshotMemberStatus(item.Status), Note: item.Note, SortOrder: item.SortOrder})
	}
	return TeamSnapshot{Id: value.ID, SnapshotMonth: apiDate(value.SnapshotMonth), SnapshotType: TeamSnapshotSnapshotType(value.SnapshotType), CapturedAt: value.CapturedAt, CapturedLate: value.CapturedLate, Members: members}
}
func knowledgeItemInput(value KnowledgeItemRequest) knowledge.ItemInput {
	var learned *time.Time
	if value.LearnedOn != nil {
		learned = &value.LearnedOn.Time
	}
	var current, total *float64
	if value.ProgressCurrent != nil {
		v := float64(*value.ProgressCurrent)
		current = &v
	}
	if value.ProgressTotal != nil {
		v := float64(*value.ProgressTotal)
		total = &v
	}
	var tags []string
	if value.Tags != nil {
		tags = *value.Tags
	}
	var files []uuid.UUID
	if value.FileIds != nil {
		for _, id := range *value.FileIds {
			files = append(files, uuid.UUID(id))
		}
	}
	return knowledge.ItemInput{Title: value.Title, Type: optionalEnum(value.Type, "OTHER"), RawText: value.RawText, Summary: value.Summary, Understanding: value.Understanding, ActionItems: value.ActionItems, SourceURL: value.SourceUrl, LearnedOn: learned, Status: optionalEnum(value.Status, "NOT_STARTED"), ProgressCurrent: current, ProgressTotal: total, ProgressUnit: value.ProgressUnit, Tags: tags, FileIDs: files}
}
func knowledgeItemDTO(value knowledge.Item) KnowledgeItem {
	return KnowledgeItem{Id: value.ID, Title: value.Title, Type: KnowledgeItemType(value.Type), RawText: value.RawText, Summary: value.Summary, Understanding: value.Understanding, ActionItems: value.ActionItems, SourceUrl: value.SourceURL, LearnedOn: datePointer(value.LearnedOn), Status: KnowledgeItemStatus(value.Status), ProgressCurrent: float32Ptr(value.ProgressCurrent), ProgressTotal: float32Ptr(value.ProgressTotal), ProgressUnit: value.ProgressUnit, Tags: value.Tags, FileIds: value.FileIDs, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func learningSessionInput(value LearningSessionRequest) knowledge.SessionInput {
	var item *uuid.UUID
	if value.KnowledgeItemId != nil {
		v := uuid.UUID(*value.KnowledgeItemId)
		item = &v
	}
	return knowledge.SessionInput{KnowledgeItemID: item, ActivityType: string(value.ActivityType), ActivityDate: value.ActivityDate.Time, Minutes: value.Minutes, Source: optionalEnum(value.Source, "ITEM"), Note: value.Note}
}
func learningSessionDTO(value knowledge.Session) LearningSession {
	return LearningSession{Id: value.ID, KnowledgeItemId: uuidPtr(value.KnowledgeItemID), ActivityType: LearningSessionActivityType(value.ActivityType), ActivityDate: apiDate(value.ActivityDate), Minutes: value.Minutes, Source: LearningSessionSource(value.Source), Note: value.Note, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func fileDTO(value fileassets.Asset) FileAsset {
	return FileAsset{Id: value.ID, Category: FileAssetCategory(value.Category), OriginalName: value.OriginalName, MimeType: value.MIMEType, SizeBytes: value.SizeBytes, Sha256: value.SHA256, CreatedAt: value.CreatedAt}
}
func searchDTO(value search.Result) SearchResult {
	return SearchResult{Module: value.Module, Id: value.ID, Title: value.Title, Snippet: value.Snippet, UpdatedAt: value.UpdatedAt, Score: value.Score}
}
func dateValue(value *openapi_types.Date) *time.Time {
	if value == nil {
		return nil
	}
	v := value.Time
	return &v
}
func uuidPtr(value *uuid.UUID) *openapi_types.UUID {
	if value == nil {
		return nil
	}
	v := openapi_types.UUID(*value)
	return &v
}
func float32Ptr(value *float64) *float32 {
	if value == nil {
		return nil
	}
	v := float32(*value)
	return &v
}
func optionalInt(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}
func optionalEnum[T ~string](value *T, fallback string) string {
	if value == nil {
		return fallback
	}
	return string(*value)
}
