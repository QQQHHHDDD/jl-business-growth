package main

import (
	"testing"
)

func TestResetCommandRefusesProduction(t *testing.T) {
	if err := validateEnvironment("production"); err == nil {
		t.Fatal("reset command accepted production environment")
	}
	if err := validateEnvironment("development"); err != nil {
		t.Fatalf("reset command rejected development environment: %v", err)
	}
}
