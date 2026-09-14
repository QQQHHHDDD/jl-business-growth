package main

import (
	"net/http/httptest"
	"testing"
)

func TestTrustedProxyIPExtractorUsesOnlyLoopbackProxyHops(t *testing.T) {
	extractor := trustedProxyIPExtractor()

	proxiedRequest := httptest.NewRequest("GET", "http://127.0.0.1/api/health/live", nil)
	proxiedRequest.RemoteAddr = "127.0.0.1:8080"
	proxiedRequest.Header.Set("X-Forwarded-For", "203.0.113.10")
	if got := extractor(proxiedRequest); got != "203.0.113.10" {
		t.Fatalf("trusted proxy request IP = %q, want client address", got)
	}

	directRequest := httptest.NewRequest("GET", "http://127.0.0.1/api/health/live", nil)
	directRequest.RemoteAddr = "192.0.2.20:8080"
	directRequest.Header.Set("X-Forwarded-For", "198.51.100.20")
	if got := extractor(directRequest); got != "192.0.2.20" {
		t.Fatalf("direct request IP = %q, want network peer address", got)
	}
}
