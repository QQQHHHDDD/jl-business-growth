package daily

import (
	"math"
	"testing"

	"jl-business-growth/backend/internal/problem"
)

func TestNormalizeTurnover(t *testing.T) {
	tests := []struct {
		name       string
		pv         *float64
		netAmount  *float64
		wantPV     float64
		wantAmount float64
		wantError  bool
	}{
		{name: "pv is canonical input", pv: floatPointer(2), wantPV: 2, wantAmount: 25},
		{name: "net amount is converted", netAmount: floatPointer(37.5), wantPV: 3, wantAmount: 37.5},
		{name: "matching inputs are accepted", pv: floatPointer(2), netAmount: floatPointer(25), wantPV: 2, wantAmount: 25},
		{name: "currency rounding is accepted", pv: floatPointer(2), netAmount: floatPointer(25.004), wantPV: 2, wantAmount: 25},
		{name: "mismatched inputs are rejected", pv: floatPointer(2), netAmount: floatPointer(30), wantError: true},
		{name: "negative values are rejected", pv: floatPointer(-1), wantError: true},
		{name: "non finite values are rejected", pv: floatPointer(math.NaN()), wantError: true},
		{name: "empty input is rejected", wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			pv, amount, err := normalizeTurnover(test.pv, test.netAmount)
			if test.wantError {
				if err == nil {
					t.Fatal("normalizeTurnover() error = nil, want error")
				}
				if known, ok := problem.As(err); !ok || known.Code != "VALIDATION_ERROR" {
					t.Fatalf("normalizeTurnover() error = %v, want VALIDATION_ERROR", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeTurnover() error = %v", err)
			}
			if pv != test.wantPV || amount != test.wantAmount {
				t.Fatalf("normalizeTurnover() = (%v, %v), want (%v, %v)", pv, amount, test.wantPV, test.wantAmount)
			}
		})
	}
}

func TestValidateWorklog(t *testing.T) {
	if err := validateWorklog(WorklogInput{MeetingCount: 1, ReadingMinutes: 20}); err != nil {
		t.Fatalf("validateWorklog() valid input error = %v", err)
	}
	if err := validateWorklog(WorklogInput{MeetingCount: -1}); err == nil {
		t.Fatal("validateWorklog() negative input error = nil, want error")
	}
}

func TestMetricActual(t *testing.T) {
	worklogs := WorklogTotals{MeetingCount: 3, ReadingMinutes: 45}
	turnover := TurnoverTotals{PV: 4, NetAmount: 50}
	for _, test := range []struct {
		code string
		want float64
	}{
		{code: "meeting_count", want: 3},
		{code: "reading_minutes", want: 45},
		{code: "turnover_pv", want: 4},
		{code: "turnover_net_amount", want: 50},
		{code: "unknown", want: 0},
	} {
		if got := metricActual(test.code, worklogs, turnover); got != test.want {
			t.Errorf("metricActual(%q) = %v, want %v", test.code, got, test.want)
		}
	}
}

func floatPointer(value float64) *float64 {
	return &value
}
