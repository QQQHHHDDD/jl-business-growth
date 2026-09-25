package money

import (
	"encoding/json"
	"errors"
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

// Cents is the only in-process representation of a Renminbi amount.
type Cents int64

// MarshalJSON keeps money human-readable at API and snapshot boundaries.
func (value Cents) MarshalJSON() ([]byte, error) { return json.Marshal(Format(value)) }

func (value *Cents) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return err
	}
	parsed, err := Parse(text)
	if err != nil {
		return err
	}
	*value = parsed
	return nil
}

var decimalPattern = regexp.MustCompile(`^[+]?\d+(?:\.\d+)?$`)

func Parse(value string) (Cents, error) {
	value = strings.TrimSpace(value)
	if value == "" || !decimalPattern.MatchString(value) {
		return 0, errors.New("amount must be a non-negative decimal")
	}
	rational, ok := new(big.Rat).SetString(value)
	if !ok || rational.Sign() < 0 {
		return 0, errors.New("amount must be a non-negative decimal")
	}
	rational.Mul(rational, big.NewRat(100, 1))
	rounded, err := roundRat(rational)
	if err != nil {
		return 0, err
	}
	return Cents(rounded), nil
}

func FromFloat(value float64) (Cents, error) {
	return Parse(strconv.FormatFloat(value, 'f', -1, 64))
}

func FromNumeric(value pgtype.Numeric) (Cents, error) {
	if !value.Valid {
		return 0, nil
	}
	if value.NaN || value.InfinityModifier != 0 {
		return 0, errors.New("invalid numeric amount")
	}
	if value.Int == nil {
		return 0, nil
	}
	if value.Int.Sign() < 0 {
		return 0, errors.New("invalid numeric amount")
	}
	text := value.Int.String()
	if value.Exp >= 0 {
		text += strings.Repeat("0", int(value.Exp))
	} else {
		position := len(text) + int(value.Exp)
		if position <= 0 {
			text = "0." + strings.Repeat("0", -position) + text
		} else {
			text = text[:position] + "." + text[position:]
		}
	}
	return Parse(text)
}

func Numeric(value Cents) pgtype.Numeric {
	var result pgtype.Numeric
	_ = result.ScanScientific(Format(value))
	return result
}

func Format(value Cents) string {
	negative := value < 0
	if negative {
		value = -value
	}
	whole := int64(value) / 100
	fraction := int64(value) % 100
	result := strconv.FormatInt(whole, 10) + "." + strconv.FormatInt(fraction+100, 10)[1:]
	if negative {
		return "-" + result
	}
	return result
}

func roundRat(value *big.Rat) (int64, error) {
	remainder := new(big.Int)
	quotient, remainder := new(big.Int).QuoRem(value.Num(), value.Denom(), remainder)
	if remainder.Sign() != 0 && new(big.Int).Lsh(new(big.Int).Abs(remainder), 1).Cmp(value.Denom()) >= 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	if quotient.Sign() < 0 || quotient.Cmp(big.NewInt(math.MaxInt64)) > 0 {
		return 0, errors.New("amount exceeds supported range")
	}
	return quotient.Int64(), nil
}
