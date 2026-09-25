package files

import "testing"

func TestContentTypeMatchesRejectsDeclaredImageForPlainText(t *testing.T) {
	if contentTypeMatches("image/png", "text/plain") {
		t.Fatal("plain text must not be accepted as a PNG")
	}
}

func TestContentTypeMatchesAllowsMarkdownDetectedAsPlainText(t *testing.T) {
	if !contentTypeMatches("text/markdown", "text/plain") {
		t.Fatal("markdown content should be accepted when sniffed as plain text")
	}
}

func TestContentTypeMatchesRequiresBinaryTypesToMatch(t *testing.T) {
	if contentTypeMatches("image/jpeg", "image/png") {
		t.Fatal("different binary image formats must not be accepted")
	}
}
