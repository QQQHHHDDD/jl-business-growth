package mail

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/smtp"
	"os"
	"path/filepath"
	"strings"
	"time"

	"jl-business-growth/backend/internal/config"
)

type Message struct {
	To          string
	Subject     string
	Body        string
	ContentType string
}

type Sender interface {
	Send(context.Context, Message) (string, error)
}

func NewSender(cfg config.Config) Sender {
	if cfg.MailMode == "smtp" {
		return &SMTPSender{Host: cfg.SMTPHost, Port: cfg.SMTPPort, Username: cfg.SMTPUsername, Password: cfg.SMTPPassword, From: cfg.SMTPFrom}
	}
	return &FileSender{Root: cfg.MailOutboxRoot}
}

type FileSender struct{ Root string }

func (s *FileSender) Send(_ context.Context, message Message) (string, error) {
	if err := os.MkdirAll(s.Root, 0o700); err != nil {
		return "", fmt.Errorf("create mail outbox: %w", err)
	}
	var random [8]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", fmt.Errorf("generate mail filename: %w", err)
	}
	id := fmt.Sprintf("%d-%s", time.Now().UnixNano(), hex.EncodeToString(random[:]))
	path := filepath.Join(s.Root, id+".eml")
	content := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: %s; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n", "JL团队生意成长系统", message.To, strings.ReplaceAll(message.Subject, "\r", ""), message.ContentType, message.Body)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write mail: %w", err)
	}
	return id, nil
}

type SMTPSender struct {
	Host, Port, Username, Password, From string
}

func (s *SMTPSender) Send(_ context.Context, message Message) (string, error) {
	if s.Host == "" || s.Port == "" || s.From == "" {
		return "", fmt.Errorf("SMTP configuration is incomplete")
	}
	auth := smtp.Auth(nil)
	if s.Username != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	body := bytes.NewBufferString(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: %s; charset=UTF-8\r\n\r\n%s\r\n", s.From, message.To, message.Subject, message.ContentType, message.Body))
	if err := smtp.SendMail(s.Host+":"+s.Port, auth, s.From, []string{message.To}, body.Bytes()); err != nil {
		return "", err
	}
	return "smtp-" + time.Now().UTC().Format("20060102150405.000000000"), nil
}
