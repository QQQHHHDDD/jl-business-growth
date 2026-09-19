package pv

import (
	"testing"

	"jl-business-growth/backend/internal/money"
)

func TestConversionUsesTwoDecimalHalfUpRules(t *testing.T) {
	for _, test := range []struct {
		amount money.Cents
		wantPV float64
	}{
		{amount: 125000, wantPV: 100},
		{amount: 1100, wantPV: 0.88},
		{amount: 1001, wantPV: 0.80},
		{amount: 0, wantPV: 0},
		{amount: 999999999999, wantPV: 800000000},
	} {
		if got := FromNetAmount(test.amount); got != test.wantPV {
			t.Fatalf("FromNetAmount(%d) = %v, want %v", test.amount, got, test.wantPV)
		}
	}
	amount, err := NetAmount(0.88)
	if err != nil || amount != 1100 {
		t.Fatalf("NetAmount(0.88) = %d, %v; want 1100", amount, err)
	}
	if !Matches(0.88, 1100) || !Matches(0.80, 1001) || Matches(0.81, 1001) {
		t.Fatal("Matches did not apply amount-to-PV rounding")
	}
}
