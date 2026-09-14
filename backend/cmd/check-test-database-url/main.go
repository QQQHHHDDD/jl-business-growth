package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

func main() {
	if !isAllowedTestDatabaseURL(os.Getenv("TEST_DATABASE_URL")) {
		fmt.Fprintln(os.Stderr, "TEST_DATABASE_URL must be a PostgreSQL URL targeting the isolated jl_business_test database")
		os.Exit(1)
	}
}

func isAllowedTestDatabaseURL(databaseURL string) bool {
	parsedURL, err := url.Parse(databaseURL)
	if err != nil || (parsedURL.Scheme != "postgres" && parsedURL.Scheme != "postgresql") {
		return false
	}
	return strings.TrimPrefix(parsedURL.Path, "/") == "jl_business_test"
}
