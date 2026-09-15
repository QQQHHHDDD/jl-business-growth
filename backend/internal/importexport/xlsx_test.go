package importexport

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"jl-business-growth/backend/internal/money"
)

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

func TestValidateRowsAllowsParentFromExistingAccount(t *testing.T) {
	rows := [][]string{
		importColumns[ImportTeam],
		{"stable-child", "Child", "stable-existing-parent", "2026-09-14", "", "", "ACTIVE", ""},
	}
	preview, parsed, err := validateRows(ImportTeam, rows)
	if err != nil {
		t.Fatalf("validate rows: %v", err)
	}
	if len(preview) != 1 || len(parsed) != 1 || len(preview[0].Errors) != 0 {
		t.Fatalf("preview = %#v, want no file-only parent error", preview)
	}
}

func TestValidateRowsRejectsDuplicateTeamMemberCodes(t *testing.T) {
	rows := [][]string{
		importColumns[ImportTeam],
		{"stable-member", "First", "", "2026-09-14", "", "", "ACTIVE", ""},
		{"stable-member", "Second", "", "2026-09-14", "", "", "ACTIVE", ""},
	}
	preview, _, err := validateRows(ImportTeam, rows)
	if err != nil {
		t.Fatalf("validate rows: %v", err)
	}
	if len(preview) != 2 || len(preview[1].Errors) == 0 {
		t.Fatalf("preview = %#v, want duplicate member_code error", preview)
	}
}

func TestFinanceFingerprintIsStable(t *testing.T) {
	categoryID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	amount, err := money.Parse("123.45")
	if err != nil {
		t.Fatal(err)
	}
	left := financeFingerprint(time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC), "expense", categoryID, amount, "description", "note")
	right := financeFingerprint(time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC), "EXPENSE", categoryID, amount, " description ", " note ")
	if left != right {
		t.Fatalf("fingerprint changed across normalization: %q != %q", left, right)
	}
}
