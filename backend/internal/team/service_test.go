package team

import (
	"testing"
	"time"
)

func TestSnapshotMonthForUsesAccountTimezone(t *testing.T) {
	instant := time.Date(2026, 5, 1, 16, 30, 0, 0, time.UTC)
	month, late, err := SnapshotMonthFor(instant, "Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	if month.In(time.FixedZone("CST", 8*60*60)).Format("2006-01-02") != "2026-04-01" || !late {
		t.Fatalf("snapshot = %s late=%v, want 2026-04-01 late=true", month, late)
	}
	month, late, err = SnapshotMonthFor(time.Date(2026, 5, 1, 7, 30, 0, 0, time.UTC), "America/Los_Angeles")
	if err != nil {
		t.Fatal(err)
	}
	if month.In(time.FixedZone("PDT", -7*60*60)).Format("2006-01-02") != "2026-04-01" || late {
		t.Fatalf("DST boundary snapshot = %s late=%v", month, late)
	}
}

func TestSnapshotMonthForDefaultsTimezoneAndRejectsInvalid(t *testing.T) {
	month, late, err := SnapshotMonthFor(time.Date(2026, 2, 1, 0, 1, 0, 0, time.UTC), "")
	if err != nil || month.In(time.FixedZone("CST", 8*60*60)).Format("2006-01-02") != "2026-01-01" || late {
		t.Fatalf("default timezone result = %s late=%v err=%v", month, late, err)
	}
	if _, _, err := SnapshotMonthFor(time.Now(), "Not/IANA"); err == nil {
		t.Fatal("invalid timezone unexpectedly accepted")
	}
}
