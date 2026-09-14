package importexport

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/db/generated"
	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/config"
	"jl-business-growth/backend/internal/problem"
)

const (
	ImportWorklog  = "WORKLOG"
	ImportFinance  = "FINANCE"
	ImportTeam     = "TEAM"
	ImportTurnover = "TURNOVER"
	maxImportBytes = 50 << 20
)

var importColumns = map[string][]string{
	ImportWorklog:  {"date", "open_conversation_count", "deep_conversation_count", "buffer_count", "story_share_count", "screening_count", "opportunity_count", "meeting_count", "customer_followup_count", "reading_minutes", "audio_minutes", "turnover_pv", "turnover_net_amount", "note"},
	ImportFinance:  {"date", "type", "category", "amount", "description", "note"},
	ImportTeam:     {"member_code", "name", "parent_member_code", "joined_on", "rank", "city", "status", "note"},
	ImportTurnover: {"date", "pv", "net_amount", "note"},
}

type Service struct {
	pool    *pgxpool.Pool
	queries *generated.Queries
	root    string
}

func NewService(pool *pgxpool.Pool, cfg config.Config) *Service {
	return &Service{pool: pool, queries: generated.New(pool), root: cfg.FileRoot}
}

type PreviewRow struct {
	RowNumber int               `json:"row_number"`
	Values    map[string]string `json:"values"`
	Errors    []string          `json:"errors"`
}

type Job struct {
	ID                uuid.UUID
	Type              string
	Status            string
	RowCount          int
	ValidCount        int
	InvalidCount      int
	ValidationSummary map[string]interface{}
	ExpiresAt         time.Time
	CreatedAt         time.Time
	Rows              []PreviewRow
}

type validationSummary struct {
	Headers []string     `json:"headers"`
	Rows    []PreviewRow `json:"rows"`
}

type parsedRow struct {
	Preview PreviewRow
	Date    time.Time
	Values  map[string]string
}

func (s *Service) Template(ctx context.Context, kind string) ([]byte, string, error) {
	columns, ok := importColumns[kind]
	if !ok {
		return nil, "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "import type is invalid")
	}
	rows := [][]string{columns}
	rows = append(rows, make([]string, len(columns)))
	data, err := writeXLSX(rows)
	if err != nil {
		return nil, "", err
	}
	return data, fmt.Sprintf("jl-business-%s-template.xlsx", strings.ToLower(kind)), nil
}

func (s *Service) Create(ctx context.Context, userID uuid.UUID, kind string, header *multipart.FileHeader) (Job, error) {
	if _, ok := importColumns[kind]; !ok {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "import type is invalid")
	}
	if header == nil || strings.ToLower(filepath.Ext(header.Filename)) != ".xlsx" {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "an .xlsx template file is required")
	}
	if header.Size <= 0 || header.Size > maxImportBytes {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusRequestEntityTooLarge, "import file exceeds the configured size limit")
	}
	input, err := header.Open()
	if err != nil {
		return Job{}, err
	}
	data, err := io.ReadAll(io.LimitReader(input, maxImportBytes+1))
	_ = input.Close()
	if err != nil {
		return Job{}, err
	}
	if int64(len(data)) > maxImportBytes {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusRequestEntityTooLarge, "import file exceeds the configured size limit")
	}
	return s.createFromBytes(ctx, userID, kind, data)
}

func (s *Service) createFromBytes(ctx context.Context, userID uuid.UUID, kind string, data []byte) (Job, error) {
	rows, err := readXLSX(data)
	if err != nil {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "the uploaded file is not a valid XLSX workbook")
	}
	preview, parsed, validationErr := validateRows(kind, rows)
	if validationErr != nil {
		return Job{}, validationErr
	}
	jobID := uuid.New()
	importsRoot := filepath.Join(s.root, "imports")
	if err := os.MkdirAll(importsRoot, 0o700); err != nil {
		return Job{}, err
	}
	path := filepath.Join(importsRoot, jobID.String()+".xlsx")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return Job{}, err
	}
	summary := validationSummary{Headers: importColumns[kind], Rows: preview}
	encoded, err := json.Marshal(summary)
	if err != nil {
		_ = os.Remove(path)
		return Job{}, err
	}
	row, err := s.queries.CreateImportJob(ctx, generated.CreateImportJobParams{ID: auth.ToPGUUID(jobID), UserID: auth.ToPGUUID(userID), Type: generated.ImportJobType(kind), TempFilePath: path, ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true}})
	if err != nil {
		_ = os.Remove(path)
		return Job{}, err
	}
	status := generated.ImportJobStatusVALIDATED
	if invalidCount(preview) > 0 {
		status = generated.ImportJobStatusFAILED
	}
	row, err = s.queries.UpdateImportValidation(ctx, generated.UpdateImportValidationParams{ID: row.ID, UserID: row.UserID, Status: status, RowCount: int32(len(parsed)), ValidCount: int32(len(parsed) - invalidCount(preview)), InvalidCount: int32(invalidCount(preview)), ValidationSummary: encoded})
	if err != nil {
		_ = os.Remove(path)
		return Job{}, err
	}
	return toJob(row), nil
}

func (s *Service) Get(ctx context.Context, userID, id uuid.UUID) (Job, error) {
	row, err := s.queries.GetImportJob(ctx, generated.GetImportJobParams{ID: auth.ToPGUUID(id), UserID: auth.ToPGUUID(userID)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, problem.New("NOT_FOUND", http.StatusNotFound, "import job not found")
	}
	if err != nil {
		return Job{}, err
	}
	return toJob(row), nil
}

func (s *Service) Validate(ctx context.Context, userID, id uuid.UUID) (Job, error) {
	row, err := s.queries.GetImportJob(ctx, generated.GetImportJobParams{ID: auth.ToPGUUID(id), UserID: auth.ToPGUUID(userID)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, problem.New("NOT_FOUND", http.StatusNotFound, "import job not found")
	}
	if err != nil {
		return Job{}, err
	}
	if row.Status == generated.ImportJobStatusCOMMITTED || row.Status == generated.ImportJobStatusEXPIRED {
		return toJob(row), nil
	}
	data, err := os.ReadFile(row.TempFilePath)
	if err != nil {
		return Job{}, problem.New("NOT_FOUND", http.StatusNotFound, "import temporary file not found")
	}
	rows, err := readXLSX(data)
	if err != nil {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "the import workbook cannot be read")
	}
	preview, parsed, validationErr := validateRows(string(row.Type), rows)
	if validationErr != nil {
		return Job{}, validationErr
	}
	encoded, err := json.Marshal(validationSummary{Headers: importColumns[string(row.Type)], Rows: preview})
	if err != nil {
		return Job{}, err
	}
	status := generated.ImportJobStatusVALIDATED
	if invalidCount(preview) > 0 {
		status = generated.ImportJobStatusFAILED
	}
	updated, err := s.queries.UpdateImportValidation(ctx, generated.UpdateImportValidationParams{ID: row.ID, UserID: row.UserID, Status: status, RowCount: int32(len(parsed)), ValidCount: int32(len(parsed) - invalidCount(preview)), InvalidCount: int32(invalidCount(preview)), ValidationSummary: encoded})
	if err != nil {
		return Job{}, err
	}
	return toJob(updated), nil
}

func (s *Service) Commit(ctx context.Context, userID, id uuid.UUID) (Job, error) {
	row, err := s.queries.GetImportJob(ctx, generated.GetImportJobParams{ID: auth.ToPGUUID(id), UserID: auth.ToPGUUID(userID)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, problem.New("NOT_FOUND", http.StatusNotFound, "import job not found")
	}
	if err != nil {
		return Job{}, err
	}
	if row.Status != generated.ImportJobStatusVALIDATED {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "only a valid import can be confirmed")
	}
	if !row.ExpiresAt.Valid || !row.ExpiresAt.Time.After(time.Now()) {
		return Job{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "import job has expired")
	}
	summary, err := decodeSummary(row.ValidationSummary)
	if err != nil {
		return Job{}, err
	}
	for _, item := range summary.Rows {
		if len(item.Errors) > 0 {
			return Job{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "import contains invalid rows")
		}
	}
	_, parsed, validationErr := validateRows(string(row.Type), summaryToRows(summary))
	if validationErr != nil {
		return Job{}, validationErr
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback(ctx)
	if err := commitRows(ctx, tx, userID, string(row.Type), parsed); err != nil {
		return Job{}, err
	}
	committed, err := s.queries.WithTx(tx).CommitImportJob(ctx, generated.CommitImportJobParams{ID: row.ID, UserID: row.UserID})
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, problem.New("CONFLICT", http.StatusConflict, "import job was already committed")
	}
	if err != nil {
		return Job{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Job{}, err
	}
	_ = os.Remove(row.TempFilePath)
	return toJob(committed), nil
}

func (s *Service) Delete(ctx context.Context, userID, id uuid.UUID) error {
	path, err := s.queries.DeleteImportJob(ctx, generated.DeleteImportJobParams{ID: auth.ToPGUUID(id), UserID: auth.ToPGUUID(userID)})
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New("NOT_FOUND", http.StatusNotFound, "import job cannot be discarded")
	}
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *Service) CleanupExpired(ctx context.Context) error {
	jobs, err := s.queries.ListExpiredImportJobs(ctx)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if err := os.Remove(job.TempFilePath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err := s.queries.MarkImportExpired(ctx, job.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) CleanupOrphanFiles(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT storage_name FROM file_assets`)
	if err != nil {
		return err
	}
	known := make(map[string]struct{})
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		known[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	entries, err := os.ReadDir(s.root)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if _, ok := known[entry.Name()]; ok {
			continue
		}
		if err := os.Remove(filepath.Join(s.root, entry.Name())); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

// DeleteAccount performs the online account deletion transaction before
// removing physical files. A failed physical removal is logged for the
// cleanup job to retry; database rows are never retained after this point.
func (s *Service) DeleteAccount(ctx context.Context, accountID uuid.UUID) error {
	rows, err := s.pool.Query(ctx, `SELECT storage_name FROM file_assets WHERE user_id=$1`, accountID)
	if err != nil {
		return err
	}
	var storageNames []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		storageNames = append(storageNames, name)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := generated.New(s.pool).WithTx(tx).DeleteAccountSessions(ctx, auth.ToPGUUID(accountID)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM accounts WHERE id=$1`, accountID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	for _, name := range storageNames {
		if err := os.Remove(filepath.Join(s.root, name)); err != nil && !errors.Is(err, os.ErrNotExist) {
			// The database deletion is already complete. The scheduled file
			// cleanup scans for files without a matching file_assets row.
			log.Printf("account file cleanup deferred: storage_name=%s error=%v", name, err)
			continue
		}
	}
	return nil
}

func toJob(row generated.ImportJob) Job {
	summary, _ := decodeSummary(row.ValidationSummary)
	result := Job{ID: row.ID.Bytes, Type: string(row.Type), Status: string(row.Status), RowCount: int(row.RowCount), ValidCount: int(row.ValidCount), InvalidCount: int(row.InvalidCount), Rows: summary.Rows}
	if row.ExpiresAt.Valid {
		result.ExpiresAt = row.ExpiresAt.Time
	}
	if row.CreatedAt.Valid {
		result.CreatedAt = row.CreatedAt.Time
	}
	result.ValidationSummary = map[string]interface{}{"headers": summary.Headers, "row_count": result.RowCount, "valid_count": result.ValidCount, "invalid_count": result.InvalidCount}
	return result
}

func decodeSummary(data []byte) (validationSummary, error) {
	var result validationSummary
	if len(data) == 0 {
		return result, nil
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return result, err
	}
	return result, nil
}

func summaryToRows(summary validationSummary) [][]string {
	rows := make([][]string, 0, len(summary.Rows)+1)
	rows = append(rows, summary.Headers)
	for _, item := range summary.Rows {
		row := make([]string, len(summary.Headers))
		for index, header := range summary.Headers {
			row[index] = item.Values[header]
		}
		rows = append(rows, row)
	}
	return rows
}

func validateRows(kind string, rows [][]string) ([]PreviewRow, []parsedRow, error) {
	columns, ok := importColumns[kind]
	if !ok {
		return nil, nil, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "import type is invalid")
	}
	if len(rows) == 0 || !sameStrings(rows[0], columns) {
		return nil, nil, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "the workbook headers do not match the official template")
	}
	if len(rows) > 10001 {
		return nil, nil, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "import files cannot contain more than 10000 rows")
	}
	preview := make([]PreviewRow, 0, len(rows)-1)
	parsed := make([]parsedRow, 0, len(rows)-1)
	for index, values := range rows[1:] {
		if allBlank(values) {
			continue
		}
		mapped := make(map[string]string, len(columns))
		for columnIndex, column := range columns {
			if columnIndex < len(values) {
				mapped[column] = strings.TrimSpace(values[columnIndex])
			} else {
				mapped[column] = ""
			}
		}
		item := parsedRow{Preview: PreviewRow{RowNumber: index + 2, Values: mapped, Errors: []string{}}, Values: mapped}
		validateParsed(kind, &item)
		preview = append(preview, item.Preview)
		parsed = append(parsed, item)
	}
	if kind == ImportTeam {
		codes := make(map[string]struct{}, len(parsed))
		for _, item := range parsed {
			code := item.Values["member_code"]
			if code == "" {
				continue
			}
			if _, exists := codes[code]; exists {
				for index := range preview {
					if preview[index].RowNumber == item.Preview.RowNumber {
						preview[index].Errors = append(preview[index].Errors, "member_code must be unique within this file")
					}
				}
			}
			codes[code] = struct{}{}
		}
		for index := range preview {
			parent := preview[index].Values["parent_member_code"]
			if parent == "" {
				continue
			}
			if parent == preview[index].Values["member_code"] {
				preview[index].Errors = append(preview[index].Errors, "parent_member_code cannot reference the same member")
				continue
			}
			if _, exists := codes[parent]; !exists {
				preview[index].Errors = append(preview[index].Errors, "parent_member_code must reference a member in this file")
			}
		}
	}
	return preview, parsed, nil
}

func validateParsed(kind string, item *parsedRow) {
	value := func(key string) string { return item.Values[key] }
	if value("date") != "" {
		date, err := time.Parse("2006-01-02", value("date"))
		if err != nil {
			item.Preview.Errors = append(item.Preview.Errors, "date must use YYYY-MM-DD")
		} else {
			item.Date = date
		}
	} else {
		item.Preview.Errors = append(item.Preview.Errors, "date is required")
	}
	positiveInt := func(key string) {
		raw := value(key)
		if raw == "" {
			item.Values[key] = "0"
			return
		}
		parsed, err := strconv.ParseInt(raw, 10, 32)
		if err != nil || parsed < 0 {
			item.Preview.Errors = append(item.Preview.Errors, key+" must be a non-negative integer")
		}
	}
	positiveMoney := func(key string, required bool) {
		raw := value(key)
		if raw == "" {
			if required {
				item.Preview.Errors = append(item.Preview.Errors, key+" is required")
			}
			return
		}
		parsed, err := strconv.ParseFloat(raw, 64)
		if err != nil || parsed < 0 || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			item.Preview.Errors = append(item.Preview.Errors, key+" must be a non-negative number")
		}
	}
	switch kind {
	case ImportWorklog:
		for _, key := range importColumns[ImportWorklog][1:11] {
			positiveInt(key)
		}
		pv, net := value("turnover_pv"), value("turnover_net_amount")
		if (pv == "") != (net == "") {
			item.Preview.Errors = append(item.Preview.Errors, "turnover_pv and turnover_net_amount must be provided together")
		}
		positiveMoney("turnover_pv", false)
		positiveMoney("turnover_net_amount", false)
		if pv != "" && net != "" {
			pvValue, _ := strconv.ParseFloat(pv, 64)
			netValue, _ := strconv.ParseFloat(net, 64)
			if math.Abs(netValue-pvValue*12.5) > 0.01 {
				item.Preview.Errors = append(item.Preview.Errors, "turnover_net_amount must equal turnover_pv × 12.5")
			}
		}
	case ImportFinance:
		if value("type") != "INCOME" && value("type") != "EXPENSE" {
			item.Preview.Errors = append(item.Preview.Errors, "type must be INCOME or EXPENSE")
		}
		if value("category") == "" {
			item.Preview.Errors = append(item.Preview.Errors, "category is required")
		}
		positiveMoney("amount", true)
	case ImportTeam:
		if value("member_code") == "" || value("name") == "" {
			item.Preview.Errors = append(item.Preview.Errors, "member_code and name are required")
		}
		if value("status") == "" {
			item.Values["status"] = "ACTIVE"
		} else if value("status") != "ACTIVE" && value("status") != "INACTIVE" {
			item.Preview.Errors = append(item.Preview.Errors, "status must be ACTIVE or INACTIVE")
		}
		if joined := value("joined_on"); joined != "" {
			if _, err := time.Parse("2006-01-02", joined); err != nil {
				item.Preview.Errors = append(item.Preview.Errors, "joined_on must use YYYY-MM-DD")
			}
		}
	case ImportTurnover:
		positiveMoney("pv", true)
		positiveMoney("net_amount", true)
		if value("pv") != "" && value("net_amount") != "" {
			pv, _ := strconv.ParseFloat(value("pv"), 64)
			net, _ := strconv.ParseFloat(value("net_amount"), 64)
			if math.Abs(net-pv*12.5) > 0.01 {
				item.Preview.Errors = append(item.Preview.Errors, "net_amount must equal pv × 12.5")
			}
		}
	}
}

func commitRows(ctx context.Context, tx pgx.Tx, userID uuid.UUID, kind string, rows []parsedRow) error {
	switch kind {
	case ImportWorklog:
		for _, item := range rows {
			v := item.Values
			if _, err := tx.Exec(ctx, `INSERT INTO daily_worklogs (id,user_id,work_date,open_conversation_count,deep_conversation_count,buffer_count,story_share_count,screening_count,opportunity_count,meeting_count,customer_followup_count,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (user_id,work_date) DO UPDATE SET open_conversation_count=EXCLUDED.open_conversation_count,deep_conversation_count=EXCLUDED.deep_conversation_count,buffer_count=EXCLUDED.buffer_count,story_share_count=EXCLUDED.story_share_count,screening_count=EXCLUDED.screening_count,opportunity_count=EXCLUDED.opportunity_count,meeting_count=EXCLUDED.meeting_count,customer_followup_count=EXCLUDED.customer_followup_count,note=EXCLUDED.note,updated_at=now()`, uuid.New(), userID, item.Date, mustInt(v["open_conversation_count"]), mustInt(v["deep_conversation_count"]), mustInt(v["buffer_count"]), mustInt(v["story_share_count"]), mustInt(v["screening_count"]), mustInt(v["opportunity_count"]), mustInt(v["meeting_count"]), mustInt(v["customer_followup_count"]), nullableText(v["note"])); err != nil {
				return err
			}
			for _, activity := range []struct{ name, key string }{{"READING", "reading_minutes"}, {"AUDIO", "audio_minutes"}} {
				minutes := mustInt(v[activity.key])
				if _, err := tx.Exec(ctx, `INSERT INTO learning_sessions (id,user_id,activity_type,activity_date,minutes,source) VALUES ($1,$2,$3,$4,$5,'DAILY_UNALLOCATED') ON CONFLICT (user_id,activity_date,activity_type) WHERE source='DAILY_UNALLOCATED' DO UPDATE SET minutes=EXCLUDED.minutes,updated_at=now()`, uuid.New(), userID, activity.name, item.Date, minutes); err != nil {
					return err
				}
			}
			if v["turnover_pv"] != "" {
				if _, err := tx.Exec(ctx, `INSERT INTO daily_turnovers (id,user_id,turnover_date,pv,net_amount,note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,turnover_date) DO UPDATE SET pv=EXCLUDED.pv,net_amount=EXCLUDED.net_amount,note=EXCLUDED.note,updated_at=now()`, uuid.New(), userID, item.Date, mustFloat(v["turnover_pv"]), mustFloat(v["turnover_net_amount"]), nullableText(v["note"])); err != nil {
					return err
				}
			}
		}
	case ImportTurnover:
		for _, item := range rows {
			v := item.Values
			if _, err := tx.Exec(ctx, `INSERT INTO daily_turnovers (id,user_id,turnover_date,pv,net_amount,note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,turnover_date) DO UPDATE SET pv=EXCLUDED.pv,net_amount=EXCLUDED.net_amount,note=EXCLUDED.note,updated_at=now()`, uuid.New(), userID, item.Date, mustFloat(v["pv"]), mustFloat(v["net_amount"]), nullableText(v["note"])); err != nil {
				return err
			}
		}
	case ImportFinance:
		for _, item := range rows {
			v := item.Values
			var categoryID uuid.UUID
			if err := tx.QueryRow(ctx, `SELECT id FROM finance_categories WHERE (user_id=$1 OR user_id IS NULL) AND type=$2 AND lower(name)=lower($3) AND archived_at IS NULL ORDER BY user_id NULLS LAST LIMIT 1`, userID, v["type"], v["category"]).Scan(&categoryID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "finance category does not exist")
				}
				return err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO financial_transactions (id,user_id,occurred_on,type,category_id,amount,description,note,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IMPORT')`, uuid.New(), userID, item.Date, v["type"], categoryID, mustFloat(v["amount"]), nullableText(v["description"]), nullableText(v["note"])); err != nil {
				return err
			}
		}
	case ImportTeam:
		ids := make(map[string]uuid.UUID, len(rows))
		for _, item := range rows {
			v := item.Values
			id := uuid.New()
			ids[v["member_code"]] = id
			var joined interface{}
			if v["joined_on"] != "" {
				joined = itemDate(v["joined_on"])
			}
			if _, err := tx.Exec(ctx, `INSERT INTO team_members (id,user_id,name,joined_on,rank,city,status,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, id, userID, v["name"], joined, nullableText(v["rank"]), nullableText(v["city"]), v["status"], nullableText(v["note"])); err != nil {
				return err
			}
		}
		for _, item := range rows {
			if parent := item.Values["parent_member_code"]; parent != "" {
				parentID, ok := ids[parent]
				if !ok {
					return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "parent_member_code does not exist in this file")
				}
				if _, err := tx.Exec(ctx, `UPDATE team_members SET parent_member_id=$1 WHERE id=$2 AND user_id=$3`, parentID, ids[item.Values["member_code"]], userID); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func invalidCount(rows []PreviewRow) int {
	count := 0
	for _, row := range rows {
		if len(row.Errors) > 0 {
			count++
		}
	}
	return count
}

func sameStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range right {
		if strings.TrimSpace(left[index]) != right[index] {
			return false
		}
	}
	return true
}
func allBlank(values []string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}
func mustInt(value string) int64     { result, _ := strconv.ParseInt(value, 10, 32); return result }
func mustFloat(value string) float64 { result, _ := strconv.ParseFloat(value, 64); return result }
func nullableText(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}
func itemDate(value string) time.Time { result, _ := time.Parse("2006-01-02", value); return result }

type fileHeader interface {
	Open() (io.ReadCloser, error)
	Size() int64
	Filename() string
}

// Export returns a user-isolated archive or structured module export. Values
// are read directly from business tables; auth/session/audit tables are never
// included in the selectable export set.
func (s *Service) Export(ctx context.Context, userID uuid.UUID, kind, format string) ([]byte, string, string, error) {
	kind = strings.ToUpper(kind)
	format = strings.ToLower(format)
	validKinds := map[string]bool{"WORKLOG": true, "TURNOVER": true, "FINANCE": true, "TEAM": true, "KNOWLEDGE": true, "ACCOUNT": true}
	if !validKinds[kind] {
		return nil, "", "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "export type is invalid")
	}
	if kind == "ACCOUNT" {
		if format != "zip" {
			return nil, "", "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "account export format must be zip")
		}
		data, err := s.accountZIP(ctx, userID)
		return data, "export-account.zip", "application/zip", err
	}
	if kind == "KNOWLEDGE" {
		if format != "json" && format != "markdown" {
			return nil, "", "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "knowledge export format must be json or markdown")
		}
		data, err := s.knowledgeExport(ctx, userID, format)
		return data, "knowledge." + format, contentType(format), err
	}
	if format != "csv" && format != "xlsx" {
		return nil, "", "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "structured export format must be csv or xlsx")
	}
	headers, rows, err := s.structuredRows(ctx, userID, kind)
	if err != nil {
		return nil, "", "", err
	}
	if format == "xlsx" {
		data, err := writeXLSX(append([][]string{headers}, rows...))
		return data, strings.ToLower(kind) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", err
	}
	data, err := writeCSV(append([][]string{headers}, rows...))
	return data, strings.ToLower(kind) + ".csv", "text/csv; charset=utf-8", err
}

func (s *Service) structuredRows(ctx context.Context, userID uuid.UUID, kind string) ([]string, [][]string, error) {
	queries := map[string]struct {
		headers []string
		sql     string
	}{
		"WORKLOG":  {importColumns[ImportWorklog], `SELECT w.work_date,w.open_conversation_count,w.deep_conversation_count,w.buffer_count,w.story_share_count,w.screening_count,w.opportunity_count,w.meeting_count,w.customer_followup_count,COALESCE((SELECT minutes FROM learning_sessions WHERE user_id=w.user_id AND activity_date=w.work_date AND activity_type='READING' AND source='DAILY_UNALLOCATED'),0),COALESCE((SELECT minutes FROM learning_sessions WHERE user_id=w.user_id AND activity_date=w.work_date AND activity_type='AUDIO' AND source='DAILY_UNALLOCATED'),0),t.pv,t.net_amount,w.note FROM daily_worklogs w LEFT JOIN daily_turnovers t ON t.user_id=w.user_id AND t.turnover_date=w.work_date WHERE w.user_id=$1 ORDER BY w.work_date`},
		"TURNOVER": {importColumns[ImportTurnover], `SELECT turnover_date,pv,net_amount,note FROM daily_turnovers WHERE user_id=$1 ORDER BY turnover_date`},
		"FINANCE":  {importColumns[ImportFinance], `SELECT t.occurred_on,t.type,c.name,t.amount,t.description,t.note FROM financial_transactions t JOIN finance_categories c ON c.id=t.category_id WHERE t.user_id=$1 ORDER BY t.occurred_on,t.created_at`},
		"TEAM":     {importColumns[ImportTeam], `SELECT id::text,name,NULL::text,joined_on,rank,city,status,note FROM team_members WHERE user_id=$1 ORDER BY sort_order,created_at`},
	}
	definition := queries[kind]
	rows, err := queryRows(ctx, s.pool, definition.sql, userID, len(definition.headers))
	return definition.headers, rows, err
}

func (s *Service) knowledgeExport(ctx context.Context, userID uuid.UUID, format string) ([]byte, error) {
	items, err := queryJSON(ctx, s.pool, `SELECT id,title,type,raw_text,summary,understanding,action_items,source_url,learned_on,status,progress_current,progress_total,progress_unit,created_at,updated_at FROM knowledge_items WHERE user_id=$1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	if format == "json" {
		return json.MarshalIndent(items, "", "  ")
	}
	var output strings.Builder
	for _, item := range items {
		output.WriteString("# ")
		output.WriteString(fmt.Sprint(item["title"]))
		output.WriteString("\n\n")
		for _, key := range []string{"summary", "understanding", "action_items", "raw_text"} {
			if value := fmt.Sprint(item[key]); value != "<nil>" && value != "" {
				output.WriteString("## ")
				output.WriteString(key)
				output.WriteString("\n\n")
				output.WriteString(value)
				output.WriteString("\n\n")
			}
		}
	}
	return []byte(output.String()), nil
}

func (s *Service) accountZIP(ctx context.Context, userID uuid.UUID) ([]byte, error) {
	var output bytes.Buffer
	archive := zip.NewWriter(&output)
	manifest := map[string]interface{}{"format": "jl-business-account-export-v1", "exported_at": time.Now().UTC().Format(time.RFC3339), "user_id": userID.String(), "security_excluded": []string{"password_hash", "sessions", "security_audit_logs"}}
	if err := addZipJSON(archive, "manifest.json", manifest); err != nil {
		return nil, err
	}
	for _, item := range []struct{ name, kind string }{{"structured/goals.json", "goals"}, {"structured/calendar.json", "calendar_events"}, {"structured/team.json", "team_members"}, {"structured/income-simulations.json", "income_simulations"}, {"structured/reviews.json", "reviews"}, {"knowledge/knowledge-items.json", "knowledge_items"}} {
		data, err := queryJSON(ctx, s.pool, "SELECT * FROM "+item.kind+" WHERE user_id=$1", userID)
		if err != nil {
			if strings.Contains(err.Error(), "relation") {
				data = []map[string]interface{}{}
			} else {
				return nil, err
			}
		}
		if err := addZipJSON(archive, item.name, data); err != nil {
			return nil, err
		}
	}
	for _, item := range []struct{ name, kind string }{{"structured/worklogs.csv", "WORKLOG"}, {"structured/turnover.csv", "TURNOVER"}, {"structured/finance.csv", "FINANCE"}} {
		headers, rows, err := s.structuredRows(ctx, userID, item.kind)
		if err != nil {
			return nil, err
		}
		data, err := writeCSV(append([][]string{headers}, rows...))
		if err != nil {
			return nil, err
		}
		if err := addZipBytes(archive, item.name, data); err != nil {
			return nil, err
		}
	}
	files, err := queryFileRows(ctx, s.pool, userID)
	if err != nil {
		return nil, err
	}
	for _, item := range files {
		data, readErr := os.ReadFile(filepath.Join(s.root, item.storage))
		if readErr != nil {
			continue
		}
		if err := addZipBytes(archive, "files/"+item.original, data); err != nil {
			return nil, err
		}
	}
	if err := archive.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

type fileRow struct{ storage, original string }

func queryFileRows(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) ([]fileRow, error) {
	rows, err := pool.Query(ctx, `SELECT storage_name,original_name FROM file_assets WHERE user_id=$1 ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []fileRow
	for rows.Next() {
		var item fileRow
		if err := rows.Scan(&item.storage, &item.original); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func queryRows(ctx context.Context, pool *pgxpool.Pool, query string, userID uuid.UUID, width int) ([][]string, error) {
	rows, err := pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([][]string, 0)
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		row := make([]string, width)
		for i := range row {
			if i < len(values) && values[i] != nil {
				row[i] = formatValue(values[i])
			}
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func queryJSON(ctx context.Context, pool *pgxpool.Pool, query string, userID uuid.UUID) ([]map[string]interface{}, error) {
	rows, err := pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	fields := rows.FieldDescriptions()
	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		item := make(map[string]interface{}, len(fields))
		for i, field := range fields {
			if i < len(values) {
				item[string(field.Name)] = normalizeJSONValue(values[i])
			}
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func formatValue(value interface{}) string {
	switch value := value.(type) {
	case time.Time:
		return value.Format("2006-01-02")
	case []byte:
		return string(value)
	default:
		return fmt.Sprint(value)
	}
}
func normalizeJSONValue(value interface{}) interface{} {
	if value == nil {
		return nil
	}
	if raw, ok := value.([]byte); ok {
		var decoded interface{}
		if json.Unmarshal(raw, &decoded) == nil {
			return decoded
		}
		return string(raw)
	}
	return value
}
func writeCSV(rows [][]string) ([]byte, error) {
	var output bytes.Buffer
	output.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(&output)
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	return output.Bytes(), writer.Error()
}
func addZipJSON(archive *zip.Writer, name string, value interface{}) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return addZipBytes(archive, name, data)
}
func addZipBytes(archive *zip.Writer, name string, data []byte) error {
	file, err := archive.Create(name)
	if err != nil {
		return err
	}
	_, err = file.Write(data)
	return err
}
func contentType(format string) string {
	if format == "json" {
		return "application/json"
	}
	return "text/markdown; charset=utf-8"
}
