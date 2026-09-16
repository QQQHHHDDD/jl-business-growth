package calendar

import (
	"net/http"
	"testing"
	"time"

	"jl-business-growth/backend/internal/problem"
)

func TestExpandWeeklyKeepsEventTimezoneWallClock(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	start := time.Date(2026, 3, 1, 9, 0, 0, 0, loc)
	end := start.Add(time.Hour)
	event := Event{ID: [16]byte{}, UID: "test@example", Title: "Weekly", Timezone: "America/New_York", StartAt: start.UTC(), EndAt: end.UTC(), RecurrenceFreq: "WEEKLY", RecurrenceInterval: 1, RecurrenceEndType: "COUNT", RecurrenceCount: intPtr(4)}
	items := expand(event, start.UTC(), start.AddDate(0, 0, 30).UTC(), nil)
	if len(items) != 4 {
		t.Fatalf("expanded %d items, want 4", len(items))
	}
	for _, item := range items {
		if item.StartAt.In(loc).Hour() != 9 {
			t.Fatalf("occurrence %s moved wall-clock hour", item.StartAt)
		}
	}
}

func intPtr(value int) *int { return &value }

func TestNormalizeContact(t *testing.T) {
	tests := []struct {
		name      string
		input     ContactInput
		wantName  *string
		wantEmail string
		wantError bool
	}{
		{name: "normalizes optional name and email", input: ContactInput{Name: stringPtr("  张三  "), Email: "  Guest@Example.COM  "}, wantName: stringPtr("张三"), wantEmail: "guest@example.com"},
		{name: "allows an empty name", input: ContactInput{Name: stringPtr("  "), Email: "guest@example.com"}, wantEmail: "guest@example.com"},
		{name: "rejects an invalid email", input: ContactInput{Email: "not-an-email"}, wantError: true},
		{name: "rejects an overlong name", input: ContactInput{Name: stringPtr(string(make([]byte, 201))), Email: "guest@example.com"}, wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			name, email, err := normalizeContact(test.input)
			if test.wantError {
				if err == nil {
					t.Fatal("normalizeContact() error = nil, want validation error")
				}
				apiProblem, ok := problem.As(err)
				if !ok || apiProblem.Status != http.StatusBadRequest {
					t.Fatalf("normalizeContact() error = %v, want 400 problem", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeContact() error = %v", err)
			}
			if email != test.wantEmail {
				t.Fatalf("email = %q, want %q", email, test.wantEmail)
			}
			if (name == nil) != (test.wantName == nil) || name != nil && *name != *test.wantName {
				t.Fatalf("name = %v, want %v", name, test.wantName)
			}
		})
	}
}

func stringPtr(value string) *string { return &value }
