package importexport

import "testing"

func TestXLSXRoundTripPreservesTemplateValues(t *testing.T) {
	want := [][]string{{"date", "amount"}, {"2026-09-14", "123.45"}, {"含空格", ""}}
	data, err := writeXLSX(want)
	if err != nil {
		t.Fatalf("write xlsx: %v", err)
	}
	got, err := readXLSX(data)
	if err != nil {
		t.Fatalf("read xlsx: %v", err)
	}
	if len(got) != len(want) || len(got[0]) != len(want[0]) {
		t.Fatalf("rows = %#v, want %#v", got, want)
	}
	for row := range want {
		for column := range want[row] {
			if got[row][column] != want[row][column] {
				t.Fatalf("cell[%d][%d] = %q, want %q", row, column, got[row][column], want[row][column])
			}
		}
	}
}

func TestValidateRowsRejectsInconsistentTurnover(t *testing.T) {
	rows := [][]string{
		importColumns[ImportTurnover],
		{"2026-09-14", "2", "1", "bad"},
	}
	preview, _, err := validateRows(ImportTurnover, rows)
	if err != nil {
		t.Fatalf("validate rows: %v", err)
	}
	if len(preview) != 1 || len(preview[0].Errors) == 0 {
		t.Fatalf("preview = %#v, want validation errors", preview)
	}
}
