package communication

import "testing"

func TestNormalizeParagraphsKeepsOrderAndRejectsBlankOnly(t *testing.T) {
	got := normalizeParagraphs([]string{"  第一段  ", "\n", "第二段"})
	if len(got) != 2 || got[0] != "  第一段  " || got[1] != "第二段" {
		t.Fatalf("normalizeParagraphs() = %#v", got)
	}
	if err := validateScript(ScriptInput{Title: "问题", ScriptType: "FAQ", Paragraphs: []string{"第一段", "\n"}}); err == nil {
		t.Fatal("blank paragraphs must be rejected")
	}
	if err := validateScript(ScriptInput{Title: "导师故事", ScriptType: "Buffer", Paragraphs: []string{"第一段"}}); err != nil {
		t.Fatalf("custom script types must be accepted: %v", err)
	}
}

func TestScriptTypeValidationAllowsOnlyNonBlankNames(t *testing.T) {
	if _, err := validateScriptType("  "); err == nil {
		t.Fatal("blank script types must be rejected")
	}
	if got, err := validateScriptType("  导师故事  "); err != nil || got != "导师故事" {
		t.Fatalf("custom script type was not normalized: %q, %v", got, err)
	}
}

func TestFriendValidationRequiresStableSourceIdentity(t *testing.T) {
	if err := validateFriend(FriendInput{Platform: "微信", AccountLabel: "主号", GroupName: "群"}); err == nil {
		t.Fatal("invalid direction must be rejected")
	}
	if err := validateFriend(FriendInput{Platform: "微信", AccountLabel: "主号", GroupName: "群", AddDirection: "FORWARD"}); err != nil {
		t.Fatalf("valid friend record rejected: %v", err)
	}
}
