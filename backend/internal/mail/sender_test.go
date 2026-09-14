package mail

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileSenderWritesEML(t *testing.T) {
	root := t.TempDir()
	id, err := (&FileSender{Root: root}).Send(context.Background(), Message{To: "person@example.com", Subject: "Calendar", Body: "BEGIN:VCALENDAR\r\nMETHOD:REQUEST", ContentType: "text/calendar; method=REQUEST"})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	content, err := os.ReadFile(filepath.Join(root, id+".eml"))
	if err != nil {
		t.Fatalf("read mail: %v", err)
	}
	if !strings.Contains(string(content), "METHOD:REQUEST") || !strings.Contains(string(content), "person@example.com") {
		t.Fatalf("mail content = %q", content)
	}
}
