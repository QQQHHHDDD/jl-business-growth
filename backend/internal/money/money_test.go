package money

import (
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestParseAndFormatUsesCents(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"0.10", "0.10"},
		{"0.20", "0.20"},
		{"0.1", "0.10"},
		{"1.005", "1.01"},
		{"9999999999.99", "9999999999.99"},
	}
	for _, test := range tests {
		got, err := Parse(test.input)
		if err != nil {
			t.Fatalf("Parse(%q): %v", test.input, err)
		}
		if Format(got) != test.want {
			t.Fatalf("Parse(%q) formatted as %q, want %q", test.input, Format(got), test.want)
		}
	}
	first, _ := Parse("0.10")
	second, _ := Parse("0.20")
	if Format(first+second) != "0.30" {
		t.Fatalf("0.10 + 0.20 = %s, want 0.30", Format(first+second))
	}
}

func TestNumericAndJSONRoundTrip(t *testing.T) {
	value, err := Parse("123.45")
	if err != nil {
		t.Fatal(err)
	}
	numeric := Numeric(value)
	got, err := FromNumeric(numeric)
	if err != nil || got != value {
		t.Fatalf("numeric round trip = %d, %v; want %d", got, err, value)
	}
	encoded, err := json.Marshal(value)
	if err != nil || string(encoded) != `"123.45"` {
		t.Fatalf("JSON encoding = %s, %v", encoded, err)
	}
	var decoded Cents
	if err := json.Unmarshal([]byte(`"123.45"`), &decoded); err != nil || decoded != value {
		t.Fatalf("JSON decoding = %d, %v; want %d", decoded, err, value)
	}
	if _, err := FromNumeric(pgtype.Numeric{NaN: true, Valid: true}); err == nil {
		t.Fatal("NaN numeric unexpectedly accepted")
	}
}

func TestParseRejectsNegativeAndInvalidValues(t *testing.T) {
	for _, input := range []string{"-0.01", "", "abc", "1e2"} {
		if _, err := Parse(input); err == nil {
			t.Fatalf("Parse(%q) unexpectedly succeeded", input)
		}
	}
}

func TestParseRejectsAmountsThatOverflowCents(t *testing.T) {
	for _, input := range []string{"92233720368547758.08", "92233720368547758.075"} {
		if _, err := Parse(input); err == nil {
			t.Fatalf("Parse(%q) unexpectedly succeeded", input)
		}
	}
	if value, err := Parse("92233720368547758.07"); err != nil || Format(value) != "92233720368547758.07" {
		t.Fatalf("Parse(max cents) = %d, %v", value, err)
	}
}
