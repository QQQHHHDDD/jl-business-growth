package calendar

import (
	"testing"
	"time"
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
