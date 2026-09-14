package finance

import "testing"

func baseInput() Input {
	return Input{Markets: make([]float64, 12), AnnualGrowthStatus: "NOT_QUALIFIED", DoubleYearMode: "NONE"}
}

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
			want:  Result{Coupon6Percent: 75.01, MonthlyIncome: 75.01, CombinedIncome: 75.01, ExcelTotalIncome: 75.01},
		},
		{
			name:  "personal one thousand",
			input: func() Input { value := baseInput(); value.PersonalUsePV = 1000; return value }(),
			want:  Result{PersonalSalesBonus: 1125, Coupon6Percent: 750, MonthlyIncome: 1875, CombinedIncome: 1875, ExcelTotalIncome: 1875},
		},
		{
			name:  "market two starts at one hundred",
			input: func() Input { value := baseInput(); value.PersonalUsePV = 100; value.Markets[1] = 100; return value }(),
			want:  Result{PersonalSalesBonus: 37.5, MonthlyIncome: 37.5, CombinedIncome: 37.5, ExcelTotalIncome: 37.5},
		},
		{
			name:  "six thousand star with high market",
			input: func() Input { value := baseInput(); value.Markets[0] = 6000; value.Markets[3] = 10000; return value }(),
			want:  Result{DifferentialBonus: 9000, MonthlyMarketingStarBonus: 975, MonthlyIncome: 9975, CombinedIncome: 9975, ExcelTotalIncome: 9975},
		},
		{
			name:  "ruby and star cap",
			input: func() Input { value := baseInput(); value.PersonalUsePV = 20000; return value }(),
			want:  Result{PersonalSalesBonus: 52500, Coupon6Percent: 15000, MonthlyMarketingStarBonus: 3000, RubyBonus: 5000, MonthlyIncome: 75500, CombinedIncome: 75500, ExcelTotalIncome: 75500},
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
			want: Result{PersonalSalesBonus: 2400, Coupon6Percent: 1200, DifferentialBonus: 1012.5, BFIBonus: 1023.75, BBIBonus: 1365, MonthlyIncome: 7001.25, CombinedIncome: 7001.25, ExcelTotalIncome: 7001.25},
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
			want: Result{PersonalSalesBonus: 1125, Coupon6Percent: 750, AnnualGrowthBonus: 393.75, DoubleYearBonus: 12500, MonthlyIncome: 1875, AnnualOrOneTimeIncome: 12893.75, CombinedIncome: 14768.75, ExcelTotalIncome: 2268.75},
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
