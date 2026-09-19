package pv

import (
	"errors"
	"math"

	"jl-business-growth/backend/internal/money"
)

const centsPerPV = int64(1250)

func Round(value float64) (float64, error) {
	if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, errors.New("pv must be a non-negative finite number")
	}
	return float64(math.Round(value*100)) / 100, nil
}

func FromNetAmount(amount money.Cents) float64 {
	hundredths := roundRatio(int64(amount)*100, centsPerPV)
	return float64(hundredths) / 100
}

func NetAmount(value float64) (money.Cents, error) {
	rounded, err := Round(value)
	if err != nil {
		return 0, err
	}
	hundredths := int64(math.Round(rounded * 100))
	return money.Cents(roundRatio(hundredths*centsPerPV, 100)), nil
}

func Matches(value float64, amount money.Cents) bool {
	rounded, err := Round(value)
	return err == nil && rounded == FromNetAmount(amount)
}

func roundRatio(numerator, denominator int64) int64 {
	return (numerator + denominator/2) / denominator
}
