package calendar

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	stdmail "net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/auth"
	"jl-business-growth/backend/internal/problem"
)

type Event struct {
	ID, UserID                        uuid.UUID
	UID                               string
	Sequence                          int
	Title                             string
	Description, Location             *string
	Timezone                          string
	AllDay                            bool
	StartAt, EndAt                    time.Time
	RecurrenceFreq, RecurrenceEndType string
	RecurrenceInterval                int
	RecurrenceWeekdays                []int
	RecurrenceUntil                   *time.Time
	RecurrenceCount                   *int
	OriginalOccurrenceStart           *time.Time
	IsException                       bool
	Attendees                         []Attendee
}

type Attendee struct{ Email, DisplayName string }

type Contact struct {
	ID                   uuid.UUID
	UserID               uuid.UUID
	Name                 *string
	Email                string
	CreatedAt, UpdatedAt time.Time
}

type ContactInput struct {
	Name  *string
	Email string
}

type Input struct {
	Title, Timezone                   string
	Description, Location             *string
	AllDay                            bool
	StartAt, EndAt                    time.Time
	RecurrenceFreq, RecurrenceEndType string
	RecurrenceInterval                int
	RecurrenceWeekdays                []int
	RecurrenceUntil                   *time.Time
	RecurrenceCount                   *int
	Attendees                         []Attendee
	EditScope                         string
	OccurrenceStart                   *time.Time
}

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) ListContacts(ctx context.Context, userID uuid.UUID) ([]Contact, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,name,email,created_at,updated_at FROM calendar_contacts WHERE user_id=$1 ORDER BY lower(COALESCE(name,email)),lower(email)`, auth.ToPGUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Contact, 0)
	for rows.Next() {
		var item Contact
		if err := rows.Scan(&item.ID, &item.UserID, &item.Name, &item.Email, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) SaveContact(ctx context.Context, userID, id uuid.UUID, input ContactInput) (Contact, error) {
	name, email, err := normalizeContact(input)
	if err != nil {
		return Contact{}, err
	}
	var item Contact
	if id == uuid.Nil {
		id = uuid.New()
		err = s.pool.QueryRow(ctx, `INSERT INTO calendar_contacts (id,user_id,name,email) VALUES ($1,$2,$3,$4) RETURNING id,user_id,name,email,created_at,updated_at`, auth.ToPGUUID(id), auth.ToPGUUID(userID), name, email).Scan(&item.ID, &item.UserID, &item.Name, &item.Email, &item.CreatedAt, &item.UpdatedAt)
	} else {
		err = s.pool.QueryRow(ctx, `UPDATE calendar_contacts SET name=$3,email=$4,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,user_id,name,email,created_at,updated_at`, auth.ToPGUUID(id), auth.ToPGUUID(userID), name, email).Scan(&item.ID, &item.UserID, &item.Name, &item.Email, &item.CreatedAt, &item.UpdatedAt)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return Contact{}, problem.New("NOT_FOUND", http.StatusNotFound, "calendar contact not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Contact{}, problem.New("CONTACT_EXISTS", http.StatusConflict, "a contact with this email already exists")
	}
	return item, err
}

func (s *Service) DeleteContact(ctx context.Context, userID, id uuid.UUID) error {
	result, err := s.pool.Exec(ctx, `DELETE FROM calendar_contacts WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID))
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return problem.New("NOT_FOUND", http.StatusNotFound, "calendar contact not found")
	}
	return nil
}

func normalizeContact(input ContactInput) (*string, string, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	address, err := stdmail.ParseAddress(email)
	if err != nil || !strings.EqualFold(address.Address, email) || len(email) > 320 {
		return nil, "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "contact email is invalid")
	}
	var name *string
	if input.Name != nil {
		value := strings.TrimSpace(*input.Name)
		if len(value) > 200 {
			return nil, "", problem.New("VALIDATION_ERROR", http.StatusBadRequest, "contact name is too long")
		}
		if value != "" {
			name = &value
		}
	}
	return name, email, nil
}

func (s *Service) List(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]Event, error) {
	if !from.Before(to) {
		return nil, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "calendar range must have from before to")
	}
	rows, err := s.pool.Query(ctx, `SELECT id,user_id,uid,sequence,title,description,location_or_link,timezone,all_day,start_at,end_at,recurrence_freq::text,recurrence_interval,recurrence_weekdays,recurrence_end_type::text,recurrence_until,recurrence_count FROM calendar_events WHERE user_id=$1 AND start_at < $3 AND (recurrence_freq <> 'NONE' OR end_at > $2) ORDER BY start_at`, auth.ToPGUUID(userID), from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Event{}
	for rows.Next() {
		var event Event
		var weekdays []int16
		if err := rows.Scan(&event.ID, &event.UserID, &event.UID, &event.Sequence, &event.Title, &event.Description, &event.Location, &event.Timezone, &event.AllDay, &event.StartAt, &event.EndAt, &event.RecurrenceFreq, &event.RecurrenceInterval, &weekdays, &event.RecurrenceEndType, &event.RecurrenceUntil, &event.RecurrenceCount); err != nil {
			return nil, err
		}
		for _, weekday := range weekdays {
			event.RecurrenceWeekdays = append(event.RecurrenceWeekdays, int(weekday))
		}
		event.Attendees, err = s.attendees(ctx, event.ID)
		if err != nil {
			return nil, err
		}
		exceptions, err := s.exceptions(ctx, event.ID)
		if err != nil {
			return nil, err
		}
		for _, occurrence := range expand(event, from, to, exceptions) {
			occurrence.Attendees = event.Attendees
			result = append(result, occurrence)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) Get(ctx context.Context, userID, id uuid.UUID) (Event, error) {
	var event Event
	var weekdays []int16
	err := s.pool.QueryRow(ctx, `SELECT id,user_id,uid,sequence,title,description,location_or_link,timezone,all_day,start_at,end_at,recurrence_freq::text,recurrence_interval,recurrence_weekdays,recurrence_end_type::text,recurrence_until,recurrence_count FROM calendar_events WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID)).Scan(&event.ID, &event.UserID, &event.UID, &event.Sequence, &event.Title, &event.Description, &event.Location, &event.Timezone, &event.AllDay, &event.StartAt, &event.EndAt, &event.RecurrenceFreq, &event.RecurrenceInterval, &weekdays, &event.RecurrenceEndType, &event.RecurrenceUntil, &event.RecurrenceCount)
	if err != nil {
		if err == pgx.ErrNoRows {
			return Event{}, problem.New("NOT_FOUND", http.StatusNotFound, "calendar event not found")
		}
		return Event{}, err
	}
	for _, weekday := range weekdays {
		event.RecurrenceWeekdays = append(event.RecurrenceWeekdays, int(weekday))
	}
	event.Attendees, err = s.attendees(ctx, id)
	return event, err
}

func (s *Service) Save(ctx context.Context, userID, id uuid.UUID, input Input) (Event, error) {
	input.Title = strings.TrimSpace(input.Title)
	input.Timezone = strings.TrimSpace(input.Timezone)
	if input.RecurrenceFreq == "NONE" {
		input.RecurrenceEndType = "NEVER"
		input.RecurrenceUntil = nil
		input.RecurrenceCount = nil
	}
	for index := range input.Attendees {
		input.Attendees[index].Email = strings.TrimSpace(input.Attendees[index].Email)
		input.Attendees[index].DisplayName = strings.TrimSpace(input.Attendees[index].DisplayName)
	}
	if err := validate(input); err != nil {
		return Event{}, err
	}
	if input.EditScope == "THIS_AND_FOLLOWING" && input.OccurrenceStart != nil && id != uuid.Nil {
		return s.saveFuture(ctx, userID, id, input)
	}
	if input.EditScope == "THIS_ONLY" && input.OccurrenceStart != nil && id != uuid.Nil {
		return s.saveException(ctx, userID, id, input)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Event{}, err
	}
	defer tx.Rollback(ctx)
	uid := uuid.NewString()
	sequence := 0
	var event Event
	weekdays := smallInts(input.RecurrenceWeekdays)
	if id == uuid.Nil {
		id = uuid.New()
		if err := tx.QueryRow(ctx, `INSERT INTO calendar_events (id,user_id,uid,title,description,location_or_link,timezone,all_day,start_at,end_at,recurrence_freq,recurrence_interval,recurrence_weekdays,recurrence_end_type,recurrence_until,recurrence_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id,user_id,uid,sequence,title,description,location_or_link,timezone,all_day,start_at,end_at,recurrence_freq::text,recurrence_interval,recurrence_weekdays,recurrence_end_type::text,recurrence_until,recurrence_count`, auth.ToPGUUID(id), auth.ToPGUUID(userID), uid, input.Title, input.Description, input.Location, input.Timezone, input.AllDay, input.StartAt, input.EndAt, input.RecurrenceFreq, input.RecurrenceInterval, weekdays, input.RecurrenceEndType, input.RecurrenceUntil, input.RecurrenceCount).Scan(&event.ID, &event.UserID, &event.UID, &event.Sequence, &event.Title, &event.Description, &event.Location, &event.Timezone, &event.AllDay, &event.StartAt, &event.EndAt, &event.RecurrenceFreq, &event.RecurrenceInterval, &weekdays, &event.RecurrenceEndType, &event.RecurrenceUntil, &event.RecurrenceCount); err != nil {
			return Event{}, err
		}
	} else {
		if err := tx.QueryRow(ctx, `UPDATE calendar_events SET title=$3,description=$4,location_or_link=$5,timezone=$6,all_day=$7,start_at=$8,end_at=$9,recurrence_freq=$10,recurrence_interval=$11,recurrence_weekdays=$12,recurrence_end_type=$13,recurrence_until=$14,recurrence_count=$15,sequence=sequence+1,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,user_id,uid,sequence,title,description,location_or_link,timezone,all_day,start_at,end_at,recurrence_freq::text,recurrence_interval,recurrence_weekdays,recurrence_end_type::text,recurrence_until,recurrence_count`, auth.ToPGUUID(id), auth.ToPGUUID(userID), input.Title, input.Description, input.Location, input.Timezone, input.AllDay, input.StartAt, input.EndAt, input.RecurrenceFreq, input.RecurrenceInterval, weekdays, input.RecurrenceEndType, input.RecurrenceUntil, input.RecurrenceCount).Scan(&event.ID, &event.UserID, &event.UID, &event.Sequence, &event.Title, &event.Description, &event.Location, &event.Timezone, &event.AllDay, &event.StartAt, &event.EndAt, &event.RecurrenceFreq, &event.RecurrenceInterval, &weekdays, &event.RecurrenceEndType, &event.RecurrenceUntil, &event.RecurrenceCount); err != nil {
			if err == pgx.ErrNoRows {
				return Event{}, problem.New("NOT_FOUND", http.StatusNotFound, "calendar event not found")
			}
			return Event{}, err
		}
		uid = event.UID
		sequence = event.Sequence
	}
	if _, err := tx.Exec(ctx, `DELETE FROM calendar_attendees WHERE event_id=$1`, auth.ToPGUUID(id)); err != nil {
		return Event{}, err
	}
	for _, attendee := range input.Attendees {
		if _, err := tx.Exec(ctx, `INSERT INTO calendar_attendees (event_id,email,display_name) VALUES ($1,$2,$3)`, auth.ToPGUUID(id), attendee.Email, nullableString(attendee.DisplayName)); err != nil {
			return Event{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Event{}, err
	}
	event.ID, event.UserID, event.UID, event.Sequence = id, userID, uid, sequence
	event.Attendees = input.Attendees
	event.RecurrenceWeekdays = make([]int, len(weekdays))
	for index, weekday := range weekdays {
		event.RecurrenceWeekdays[index] = int(weekday)
	}
	return event, nil
}

func (s *Service) Delete(ctx context.Context, userID, id uuid.UUID) error {
	_, err := s.Get(ctx, userID, id)
	if err != nil {
		return err
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM calendar_events WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID)); err != nil {
		return err
	}
	return nil
}

func (s *Service) saveFuture(ctx context.Context, userID, id uuid.UUID, input Input) (Event, error) {
	original, err := s.Get(ctx, userID, id)
	if err != nil {
		return Event{}, err
	}
	if original.RecurrenceFreq == "NONE" || !input.OccurrenceStart.After(original.StartAt) {
		return Event{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "this-and-following edits require a later recurring occurrence")
	}
	cutoff := input.OccurrenceStart.Add(-time.Nanosecond)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Event{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE calendar_events SET recurrence_end_type='UNTIL',recurrence_until=$3,recurrence_count=NULL,updated_at=now() WHERE id=$1 AND user_id=$2`, auth.ToPGUUID(id), auth.ToPGUUID(userID), cutoff); err != nil {
		return Event{}, err
	}
	newID, newUID := uuid.New(), uuid.NewString()
	attendees := input.Attendees
	if len(attendees) == 0 {
		attendees = original.Attendees
	}
	weekdays := smallInts(input.RecurrenceWeekdays)
	var created Event
	if err := tx.QueryRow(ctx, `INSERT INTO calendar_events (id,user_id,uid,title,description,location_or_link,timezone,all_day,start_at,end_at,recurrence_freq,recurrence_interval,recurrence_weekdays,recurrence_end_type,recurrence_until,recurrence_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id,user_id,uid,sequence,title,description,location_or_link,timezone,all_day,start_at,end_at,recurrence_freq::text,recurrence_interval,recurrence_weekdays,recurrence_end_type::text,recurrence_until,recurrence_count`, auth.ToPGUUID(newID), auth.ToPGUUID(userID), newUID, input.Title, input.Description, input.Location, input.Timezone, input.AllDay, input.StartAt, input.EndAt, input.RecurrenceFreq, input.RecurrenceInterval, weekdays, input.RecurrenceEndType, input.RecurrenceUntil, input.RecurrenceCount).Scan(&created.ID, &created.UserID, &created.UID, &created.Sequence, &created.Title, &created.Description, &created.Location, &created.Timezone, &created.AllDay, &created.StartAt, &created.EndAt, &created.RecurrenceFreq, &created.RecurrenceInterval, &weekdays, &created.RecurrenceEndType, &created.RecurrenceUntil, &created.RecurrenceCount); err != nil {
		return Event{}, err
	}
	for _, attendee := range attendees {
		if _, err := tx.Exec(ctx, `INSERT INTO calendar_attendees (event_id,email,display_name) VALUES ($1,$2,$3)`, auth.ToPGUUID(newID), attendee.Email, nullableString(attendee.DisplayName)); err != nil {
			return Event{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Event{}, err
	}
	created.RecurrenceWeekdays = append([]int(nil), input.RecurrenceWeekdays...)
	created.Attendees = attendees
	return created, nil
}

func (s *Service) saveException(ctx context.Context, userID, id uuid.UUID, input Input) (Event, error) {
	event, err := s.Get(ctx, userID, id)
	if err != nil {
		return Event{}, err
	}
	if event.RecurrenceFreq == "NONE" {
		return Event{}, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "single events do not have occurrences")
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO calendar_event_exceptions (event_id,original_occurrence_start,exception_type,override_title,override_start_at,override_end_at,override_description,override_location) VALUES ($1,$2,'MODIFIED',$3,$4,$5,$6,$7) ON CONFLICT (event_id,original_occurrence_start) DO UPDATE SET exception_type='MODIFIED',override_title=EXCLUDED.override_title,override_start_at=EXCLUDED.override_start_at,override_end_at=EXCLUDED.override_end_at,override_description=EXCLUDED.override_description,override_location=EXCLUDED.override_location`, auth.ToPGUUID(id), *input.OccurrenceStart, input.Title, input.StartAt, input.EndAt, input.Description, input.Location)
	if err != nil {
		return Event{}, err
	}
	event.Title, event.Description, event.Location, event.StartAt, event.EndAt, event.OriginalOccurrenceStart, event.IsException = input.Title, input.Description, input.Location, input.StartAt, input.EndAt, input.OccurrenceStart, true
	return event, nil
}

type exception struct {
	Start                        time.Time
	Type                         string
	Title, Description, Location *string
	StartAt, EndAt               *time.Time
}

func (s *Service) exceptions(ctx context.Context, id uuid.UUID) ([]exception, error) {
	rows, err := s.pool.Query(ctx, `SELECT original_occurrence_start,exception_type::text,override_title,override_description,override_location,override_start_at,override_end_at FROM calendar_event_exceptions WHERE event_id=$1`, auth.ToPGUUID(id))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []exception{}
	for rows.Next() {
		var item exception
		if err := rows.Scan(&item.Start, &item.Type, &item.Title, &item.Description, &item.Location, &item.StartAt, &item.EndAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Service) attendees(ctx context.Context, id uuid.UUID) ([]Attendee, error) {
	rows, err := s.pool.Query(ctx, `SELECT email,COALESCE(display_name,'') FROM calendar_attendees WHERE event_id=$1 ORDER BY email`, auth.ToPGUUID(id))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Attendee{}
	for rows.Next() {
		var item Attendee
		if err := rows.Scan(&item.Email, &item.DisplayName); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func validate(input Input) error {
	if input.Title == "" || len(input.Title) > 200 {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "event title must be between 1 and 200 characters")
	}
	if _, err := time.LoadLocation(input.Timezone); err != nil {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "event timezone must be a valid IANA timezone")
	}
	if !input.EndAt.After(input.StartAt) {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "event end must be after start")
	}
	if input.RecurrenceInterval < 1 {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "recurrence interval must be positive")
	}
	if _, ok := map[string]bool{"NONE": true, "DAILY": true, "WEEKLY": true, "MONTHLY": true, "YEARLY": true}[input.RecurrenceFreq]; !ok {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "recurrence frequency is invalid")
	}
	if _, ok := map[string]bool{"NEVER": true, "UNTIL": true, "COUNT": true}[input.RecurrenceEndType]; !ok {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "recurrence end type is invalid")
	}
	if input.RecurrenceEndType == "UNTIL" && input.RecurrenceUntil == nil || input.RecurrenceEndType == "COUNT" && (input.RecurrenceCount == nil || *input.RecurrenceCount < 1) {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "recurrence end value is required")
	}
	if input.RecurrenceFreq != "WEEKLY" && len(input.RecurrenceWeekdays) > 0 {
		return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "weekdays are only valid for weekly events")
	}
	for _, day := range input.RecurrenceWeekdays {
		if day < 0 || day > 6 {
			return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "weekday must be between 0 and 6")
		}
	}
	seen := map[string]bool{}
	for index := range input.Attendees {
		input.Attendees[index].Email = strings.TrimSpace(input.Attendees[index].Email)
		if _, err := stdmail.ParseAddress(input.Attendees[index].Email); err != nil {
			return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "attendee email is invalid")
		}
		if seen[strings.ToLower(input.Attendees[index].Email)] {
			return problem.New("VALIDATION_ERROR", http.StatusBadRequest, "attendee emails must be unique")
		}
		seen[strings.ToLower(input.Attendees[index].Email)] = true
	}
	return nil
}

func expand(event Event, from, to time.Time, exceptions []exception) []Event {
	loc, err := time.LoadLocation(event.Timezone)
	if err != nil {
		return nil
	}
	startLocal := event.StartAt.In(loc)
	endLocal := event.EndAt.In(loc)
	duration := endLocal.Sub(startLocal)
	exceptionMap := map[int64]exception{}
	for _, item := range exceptions {
		exceptionMap[item.Start.UnixNano()] = item
	}
	result := []Event{}
	count := 0
	limit := 1000
	for date := startLocal; !date.After(to.In(loc).AddDate(0, 0, 1)) && count < limit; {
		matches := false
		switch event.RecurrenceFreq {
		case "NONE":
			matches = count == 0
		case "DAILY":
			matches = date.Sub(startLocal).Hours() >= 0 && int(date.Sub(startLocal).Hours()/24)%event.RecurrenceInterval == 0
		case "WEEKLY":
			weeks := int(date.Truncate(24*time.Hour).Sub(startLocal.Truncate(24*time.Hour)).Hours() / 24 / 7)
			matches = weeks >= 0 && weeks%event.RecurrenceInterval == 0 && (len(event.RecurrenceWeekdays) == 0 || contains(event.RecurrenceWeekdays, int(date.Weekday())))
		case "MONTHLY":
			months := (date.Year()-startLocal.Year())*12 + int(date.Month()-startLocal.Month())
			matches = months >= 0 && months%event.RecurrenceInterval == 0 && date.Day() == startLocal.Day()
		case "YEARLY":
			years := date.Year() - startLocal.Year()
			matches = years >= 0 && years%event.RecurrenceInterval == 0 && date.Month() == startLocal.Month() && date.Day() == startLocal.Day()
		}
		if matches {
			if event.RecurrenceEndType == "COUNT" && event.RecurrenceCount != nil && count >= *event.RecurrenceCount {
				break
			}
			if event.RecurrenceEndType == "UNTIL" && event.RecurrenceUntil != nil && date.After(event.RecurrenceUntil.In(loc)) {
				break
			}
			occurrenceStart := time.Date(date.Year(), date.Month(), date.Day(), startLocal.Hour(), startLocal.Minute(), startLocal.Second(), startLocal.Nanosecond(), loc)
			occurrenceEnd := occurrenceStart.Add(duration)
			item := event
			item.StartAt, item.EndAt, item.OriginalOccurrenceStart = occurrenceStart.UTC(), occurrenceEnd.UTC(), nil
			item.IsException = false
			if exceptionItem, ok := exceptionMap[occurrenceStart.UTC().UnixNano()]; ok {
				if exceptionItem.Type == "CANCELLED" {
					count++
					date = date.AddDate(0, 0, 1)
					continue
				}
				item.IsException = true
				item.OriginalOccurrenceStart = &item.StartAt
				if exceptionItem.Title != nil {
					item.Title = *exceptionItem.Title
				}
				if exceptionItem.Description != nil {
					item.Description = exceptionItem.Description
				}
				if exceptionItem.Location != nil {
					item.Location = exceptionItem.Location
				}
				if exceptionItem.StartAt != nil {
					item.StartAt = *exceptionItem.StartAt
				}
				if exceptionItem.EndAt != nil {
					item.EndAt = *exceptionItem.EndAt
				}
			}
			if item.EndAt.After(from) && item.StartAt.Before(to) {
				result = append(result, item)
			}
			count++
		}
		if event.RecurrenceFreq == "NONE" {
			break
		}
		date = date.AddDate(0, 0, 1)
	}
	return result
}

func contains(values []int, value int) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}
func smallInts(values []int) []int16 {
	if len(values) == 0 {
		return nil
	}
	result := make([]int16, len(values))
	for i, v := range values {
		result[i] = int16(v)
	}
	return result
}
func nullableString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}
func EventOccurrenceID(event Event) string {
	sum := sha256.Sum256([]byte(event.ID.String() + event.StartAt.UTC().Format(time.RFC3339Nano)))
	return hex.EncodeToString(sum[:8])
}
