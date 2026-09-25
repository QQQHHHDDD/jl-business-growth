package api

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/communication"
	"jl-business-growth/backend/internal/problem"
)

func (h *Handler) ListCommunicationFriendRecords(ctx echo.Context, params ListCommunicationFriendRecordsParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	page, pageSize := 1, 20
	if params.Page != nil {
		page = int(*params.Page)
	}
	if params.PageSize != nil {
		pageSize = int(*params.PageSize)
	}
	q, platform, account := stringValue(params.Q), stringValue(params.Platform), stringValue(params.Account)
	archived := params.Archived != nil && *params.Archived
	items, total, err := h.communication.ListFriends(ctx.Request().Context(), userID, page, pageSize, q, platform, account, archived)
	if err != nil {
		return err
	}
	out := make([]CommunicationFriendRecord, 0, len(items))
	for _, item := range items {
		out = append(out, communicationFriendDTO(item))
	}
	return ctx.JSON(http.StatusOK, CommunicationFriendRecordListResponse{Data: CommunicationFriendRecordListData{Items: out}, Meta: PaginationMeta{Page: page, PageSize: pageSize, Total: total}, RequestId: requestID(ctx)})
}

func (h *Handler) CreateCommunicationFriendRecord(ctx echo.Context) error {
	return h.saveCommunicationFriendRecord(ctx, uuid.Nil, http.StatusCreated)
}
func (h *Handler) UpdateCommunicationFriendRecord(ctx echo.Context, id CommunicationFriendRecordId) error {
	return h.saveCommunicationFriendRecord(ctx, uuid.UUID(id), http.StatusOK)
}

func (h *Handler) saveCommunicationFriendRecord(ctx echo.Context, id uuid.UUID, status int) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request CommunicationFriendRecordRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.communication.SaveFriend(ctx.Request().Context(), account.ID, id, communication.FriendInput{
		Platform: request.Platform, AccountLabel: request.AccountLabel, GroupName: request.GroupName,
		AddDirection: string(request.AddDirection), LastAppliedPerson: stringPointerValue(request.LastAppliedPerson),
		ApplicationScript: stringPointerValue(request.ApplicationScript), FirstMessage: stringPointerValue(request.FirstMessage),
		Note: stringPointerValue(request.Note), Archived: request.Archived,
	})
	if err != nil {
		return err
	}
	return ctx.JSON(status, CommunicationFriendRecordResponse{Data: communicationFriendDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) GetCommunicationFriendRecord(ctx echo.Context, id CommunicationFriendRecordId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.communication.GetFriend(ctx.Request().Context(), userID, uuid.UUID(id))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, CommunicationFriendRecordResponse{Data: communicationFriendDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) UpdateCommunicationFriendProgress(ctx echo.Context, id CommunicationFriendRecordId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request CommunicationFriendProgressRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.communication.UpdateProgress(ctx.Request().Context(), account.ID, uuid.UUID(id), communication.ProgressInput{AddDirection: enumValue(request.AddDirection), LastAppliedPerson: stringPointerValue(request.LastAppliedPerson), Note: stringPointerValue(request.Note)})
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, CommunicationFriendRecordResponse{Data: communicationFriendDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteCommunicationFriendRecord(ctx echo.Context, id CommunicationFriendRecordId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.communication.DeleteFriend(ctx.Request().Context(), account.ID, uuid.UUID(id)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListCommunicationScriptTypes(ctx echo.Context) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	items, err := h.communication.ListScriptTypes(ctx.Request().Context(), userID)
	if err != nil {
		return err
	}
	out := make([]CommunicationScriptType, 0, len(items))
	for _, item := range items {
		out = append(out, communicationScriptTypeDTO(item))
	}
	return ctx.JSON(http.StatusOK, CommunicationScriptTypeListResponse{Data: CommunicationScriptTypeListData{Items: out}, RequestId: requestID(ctx)})
}

func (h *Handler) CreateCommunicationScriptType(ctx echo.Context) error {
	return h.saveCommunicationScriptType(ctx, uuid.Nil, http.StatusCreated)
}

func (h *Handler) UpdateCommunicationScriptType(ctx echo.Context, id CommunicationScriptTypeId) error {
	return h.saveCommunicationScriptType(ctx, uuid.UUID(id), http.StatusOK)
}

func (h *Handler) saveCommunicationScriptType(ctx echo.Context, id uuid.UUID, status int) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request CommunicationScriptTypeRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	item, err := h.communication.SaveScriptType(ctx.Request().Context(), account.ID, id, request.Name)
	if err != nil {
		return err
	}
	return ctx.JSON(status, CommunicationScriptTypeResponse{Data: communicationScriptTypeDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteCommunicationScriptType(ctx echo.Context, id CommunicationScriptTypeId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.communication.DeleteScriptType(ctx.Request().Context(), account.ID, uuid.UUID(id)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ListCommunicationScripts(ctx echo.Context, params ListCommunicationScriptsParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	page, pageSize := 1, 20
	if params.Page != nil {
		page = int(*params.Page)
	}
	if params.PageSize != nil {
		pageSize = int(*params.PageSize)
	}
	typ := ""
	if params.ScriptType != nil {
		typ = string(*params.ScriptType)
	}
	favorite := params.Favorite != nil && *params.Favorite
	items, total, err := h.communication.ListScripts(ctx.Request().Context(), userID, page, pageSize, stringValue(params.Q), typ, favorite)
	if err != nil {
		return err
	}
	out := make([]CommunicationScript, 0, len(items))
	for _, item := range items {
		out = append(out, communicationScriptDTO(item))
	}
	return ctx.JSON(http.StatusOK, CommunicationScriptListResponse{Data: CommunicationScriptListData{Items: out}, Meta: PaginationMeta{Page: page, PageSize: pageSize, Total: total}, RequestId: requestID(ctx)})
}

func (h *Handler) CreateCommunicationScript(ctx echo.Context) error {
	return h.saveCommunicationScript(ctx, uuid.Nil, http.StatusCreated)
}
func (h *Handler) UpdateCommunicationScript(ctx echo.Context, id CommunicationScriptId) error {
	return h.saveCommunicationScript(ctx, uuid.UUID(id), http.StatusOK)
}
func (h *Handler) saveCommunicationScript(ctx echo.Context, id uuid.UUID, status int) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	var request CommunicationScriptRequest
	if err := ctx.Bind(&request); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "request body is invalid")
	}
	var tags []string
	if request.Tags != nil {
		tags = *request.Tags
	}
	item, err := h.communication.SaveScript(ctx.Request().Context(), account.ID, id, communication.ScriptInput{Title: request.Title, ScriptType: request.ScriptType, Tags: tags, Paragraphs: request.Paragraphs, Note: stringPointerValue(request.Note), Favorite: request.Favorite})
	if err != nil {
		return err
	}
	return ctx.JSON(status, CommunicationScriptResponse{Data: communicationScriptDTO(item), RequestId: requestID(ctx)})
}

func (h *Handler) GetCommunicationScript(ctx echo.Context, id CommunicationScriptId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	item, err := h.communication.GetScript(ctx.Request().Context(), userID, uuid.UUID(id))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, CommunicationScriptResponse{Data: communicationScriptDTO(item), RequestId: requestID(ctx)})
}
func (h *Handler) DeleteCommunicationScript(ctx echo.Context, id CommunicationScriptId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.communication.DeleteScript(ctx.Request().Context(), account.ID, uuid.UUID(id)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}
func (h *Handler) ToggleCommunicationScriptFavorite(ctx echo.Context, id CommunicationScriptId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	item, err := h.communication.ToggleFavorite(ctx.Request().Context(), account.ID, uuid.UUID(id))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, CommunicationScriptResponse{Data: communicationScriptDTO(item), RequestId: requestID(ctx)})
}

func communicationFriendDTO(value communication.FriendRecord) CommunicationFriendRecord {
	return CommunicationFriendRecord{Id: value.ID, Platform: value.Platform, AccountLabel: value.AccountLabel, GroupName: value.GroupName, AddDirection: CommunicationFriendRecordAddDirection(value.AddDirection), LastAppliedPerson: value.LastAppliedPerson, ApplicationScript: value.ApplicationScript, FirstMessage: value.FirstMessage, Note: value.Note, Archived: value.Archived, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func communicationScriptDTO(value communication.Script) CommunicationScript {
	return CommunicationScript{Id: value.ID, Title: value.Title, ScriptType: value.ScriptType, Tags: value.Tags, Paragraphs: value.Paragraphs, Note: value.Note, Favorite: value.Favorite, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}
func communicationScriptTypeDTO(value communication.ScriptType) CommunicationScriptType {
	return CommunicationScriptType{Id: value.ID, Name: value.Name, SortOrder: value.SortOrder, CreatedAt: value.CreatedAt, UpdatedAt: value.UpdatedAt}
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
