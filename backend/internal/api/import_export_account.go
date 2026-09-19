package api

import (
	"mime"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/importexport"
	"jl-business-growth/backend/internal/problem"
)

func (h *Handler) GetImportTemplate(ctx echo.Context, importType GetImportTemplateParamsImportType) error {
	if _, _, err := h.dailyUser(ctx); err != nil {
		return err
	}
	data, filename, err := h.imports.Template(ctx.Request().Context(), string(importType))
	if err != nil {
		return err
	}
	return download(ctx, http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename, data)
}

func (h *Handler) CreateImport(ctx echo.Context) error {
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
	job, err := h.imports.Create(ctx.Request().Context(), account.ID, ctx.FormValue("type"), header)
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusCreated, ImportJobResponse{Data: importJobDTO(job), RequestId: requestID(ctx)})
}

func (h *Handler) GetImport(ctx echo.Context, importID ImportId) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	job, err := h.imports.Get(ctx.Request().Context(), userID, uuid.UUID(importID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, ImportJobResponse{Data: importJobDTO(job), RequestId: requestID(ctx)})
}

func (h *Handler) ValidateImport(ctx echo.Context, importID ImportId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	job, err := h.imports.Validate(ctx.Request().Context(), account.ID, uuid.UUID(importID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, ImportJobResponse{Data: importJobDTO(job), RequestId: requestID(ctx)})
}

func (h *Handler) CommitImport(ctx echo.Context, importID ImportId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	job, err := h.imports.Commit(ctx.Request().Context(), account.ID, uuid.UUID(importID))
	if err != nil {
		return err
	}
	return ctx.JSON(http.StatusOK, ImportJobResponse{Data: importJobDTO(job), RequestId: requestID(ctx)})
}

func (h *Handler) DeleteImport(ctx echo.Context, importID ImportId) error {
	session, account, err := authSessionUser(ctx)
	if err != nil {
		return err
	}
	if err := authVerify(ctx, session); err != nil {
		return err
	}
	if err := h.imports.Delete(ctx.Request().Context(), account.ID, uuid.UUID(importID)); err != nil {
		return err
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *Handler) ExportData(ctx echo.Context, exportType ExportDataParamsExportType, params ExportDataParams) error {
	userID, _, err := h.dailyUser(ctx)
	if err != nil {
		return err
	}
	data, filename, contentType, err := h.imports.Export(ctx.Request().Context(), userID, string(exportType), string(params.Format))
	if err != nil {
		return err
	}
	return download(ctx, http.StatusOK, contentType, filename, data)
}

func (h *Handler) DeleteCurrentAccount(ctx echo.Context) error {
	session, account, err := auth.SessionFromContext(ctx)
	if err != nil {
		return err
	}
	if err := auth.VerifyCSRF(ctx, session); err != nil {
		return err
	}
	if account.Role == auth.RoleSuperAdmin {
		return problem.New("FORBIDDEN", http.StatusForbidden, "the fixed super administrator cannot be deleted")
	}
	if err := h.imports.DeleteAccount(ctx.Request().Context(), account.ID); err != nil {
		return err
	}
	auth.DestroySession(ctx, h.auth.Pool(), h.config)
	return ctx.NoContent(http.StatusNoContent)
}

func importJobDTO(job importexport.Job) ImportJob {
	rows := make([]ImportPreviewRow, 0, len(job.Rows))
	for _, row := range job.Rows {
		rows = append(rows, ImportPreviewRow{RowNumber: row.RowNumber, Values: row.Values, Errors: row.Errors, Warnings: row.Warnings})
	}
	return ImportJob{Id: uuid.UUID(job.ID), Type: ImportJobType(job.Type), Status: ImportJobStatus(job.Status), RowCount: job.RowCount, ValidCount: job.ValidCount, InvalidCount: job.InvalidCount, ValidationSummary: job.ValidationSummary, Warnings: &job.Warnings, ExpiresAt: job.ExpiresAt, CreatedAt: job.CreatedAt, Rows: rows}
}

func download(ctx echo.Context, status int, contentType, filename string, data []byte) error {
	ctx.Response().Header().Set(echo.HeaderContentType, contentType)
	ctx.Response().Header().Set(echo.HeaderContentDisposition, mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(filename)}))
	ctx.Response().Header().Set(echo.HeaderContentLength, formatContentLength(len(data)))
	return ctx.Blob(status, contentType, data)
}

func formatContentLength(size int) string {
	if size < 0 {
		return "0"
	}
	return strconv.Itoa(size)
}
