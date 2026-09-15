package finance

import (
	"testing"

	"jl-business-growth/backend/internal/money"
)

func baseInput() Input {
	return Input{Markets: make([]float64, 12), AnnualGrowthStatus: "NOT_QUALIFIED", DoubleYearMode: "NONE"}
}

func cents(value float64) money.Cents { result, _ := money.FromFloat(value); return result }

func TestCalculateExcelGoldenCases(t *testing.T) {
	tests := []struct {
		name  string
		input Input
		want  Result
	}{
		{
			name:  "zero input",
			input: baseInput(),
			want:  Result{},
		},
		{
			name:  "coupon strict greater than one hundred",
			input: func() Input { value := baseInput(); value.PersonalUsePV = 100.01; return value }(),
			want:  Result{Coupon6Percent: cents(75.01), MonthlyIncome: cents(75.01), CombinedIncome: cents(75.01), ExcelTotalIncome: cents(75.01)},
		},
		{
			name:  "personal one thousand",
			input: func() Input { value := baseInput(); value.PersonalUsePV = 1000; return value }(),
			want:  Result{PersonalSalesBonus: cents(1125), Coupon6Percent: cents(750), MonthlyIncome: cents(1875), CombinedIncome: cents(1875), ExcelTotalIncome: cents(1875)},
		},
		{
			name:  "market two starts at one hundred",
			input: func() Input { value := baseInput(); value.PersonalUsePV = 100; value.Markets[1] = 100; return value }(),
			want:  Result{PersonalSalesBonus: cents(37.5), MonthlyIncome: cents(37.5), CombinedIncome: cents(37.5), ExcelTotalIncome: cents(37.5)},
		},
		{
			name:  "six thousand star with high market",
			input: func() Input { value := baseInput(); value.Markets[0] = 6000; value.Markets[3] = 10000; return value }(),
			want:  Result{DifferentialBonus: cents(9000), MonthlyMarketingStarBonus: cents(975), MonthlyIncome: cents(9975), CombinedIncome: cents(9975), ExcelTotalIncome: cents(9975)},
		},
		{
			name:  "ruby and star cap",
			input: func() Input { value := baseInput(); value.PersonalUsePV = 20000; return value }(),
			want:  Result{PersonalSalesBonus: cents(52500), Coupon6Percent: cents(15000), MonthlyMarketingStarBonus: cents(3000), RubyBonus: cents(5000), MonthlyIncome: cents(75500), CombinedIncome: cents(75500), ExcelTotalIncome: cents(75500)},
		},
		{
			name: "bfi and bbi gates",
			input: func() Input {
				value := baseInput()
				value.PersonalUsePV = 1600
				value.Markets[0] = 300
				value.Markets[1] = 300
				value.Markets[2] = 300
				value.BFIPeriodEligible = true
				value.BBIPeriodEligible = true
				return value
			}(),
			want: Result{PersonalSalesBonus: cents(2400), Coupon6Percent: cents(1200), DifferentialBonus: cents(1012.5), BFIBonus: cents(1023.75), BBIBonus: cents(1365), MonthlyIncome: cents(7001.25), CombinedIncome: cents(7001.25), ExcelTotalIncome: cents(7001.25)},
		},
		{
			name: "annual growth and double year",
			input: func() Input {
				value := baseInput()
				value.PersonalUsePV = 1000
				value.AnnualGrowthStatus = "GROWTH"
				value.DoubleYearMode = "FIRST"
				value.DoubleYearRank = "高级营销主任"
				return value
			}(),
			want: Result{PersonalSalesBonus: cents(1125), Coupon6Percent: cents(750), AnnualGrowthBonus: cents(393.75), DoubleYearBonus: cents(12500), MonthlyIncome: cents(1875), AnnualOrOneTimeIncome: cents(12893.75), CombinedIncome: cents(14768.75), ExcelTotalIncome: cents(2268.75)},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := Calculate(test.input)
			if err != nil {
				t.Fatalf("Calculate() error = %v", err)
			}
			if got != test.want {
				t.Fatalf("Calculate() = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestCalculateRejectsInvalidDoubleYearRank(t *testing.T) {
	input := baseInput()
	input.DoubleYearMode = "FIRST"
	input.DoubleYearRank = "unknown"
	if _, err := Calculate(input); err == nil {
		t.Fatal("Calculate() accepted an invalid double-year rank")
	}
}
