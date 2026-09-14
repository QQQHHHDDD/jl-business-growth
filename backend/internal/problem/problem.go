package problem

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
)

type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func New(code string, status int, message string) *Error {
	return &Error{Code: code, Status: status, Message: message}
}

func As(err error) (*Error, bool) {
	var target *Error
	if errors.As(err, &target) {
		return target, true
	}
	return nil, false
}

func Internal() *Error {
	return New("INTERNAL_ERROR", http.StatusInternalServerError, "an internal error occurred")
}

type ErrorBody struct {
	Code    string                 `json:"code"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

type ErrorResponse struct {
	Error     ErrorBody `json:"error"`
	RequestID string    `json:"request_id"`
}

func HTTPErrorHandler(err error, ctx echo.Context) {
	if ctx.Response().Committed {
		return
	}
	status := http.StatusInternalServerError
	response := ErrorResponse{Error: ErrorBody{Code: "INTERNAL_ERROR", Message: "an internal error occurred"}, RequestID: ctx.Response().Header().Get(echo.HeaderXRequestID)}
	if known, ok := As(err); ok {
		status = known.Status
		response.Error.Code = known.Code
		response.Error.Message = known.Message
		if status >= 500 {
			status = http.StatusInternalServerError
			response.Error.Code = "INTERNAL_ERROR"
			response.Error.Message = "an internal error occurred"
		}
	} else {
		var httpError *echo.HTTPError
		if errors.As(err, &httpError) && httpError.Code >= 400 && httpError.Code < 500 {
			status = httpError.Code
			response.Error.Code = "VALIDATION_ERROR"
			response.Error.Message = "request is invalid"
		}
	}
	_ = ctx.JSON(status, response)
}
