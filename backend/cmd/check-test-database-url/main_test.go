package main

import "testing"

func TestIsAllowedTestDatabaseURL(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want bool
	}{
		{name: "postgres", url: "postgres://user:password@127.0.0.1:5432/jl_business_test?sslmode=disable", want: true},
		{name: "postgresql", url: "postgresql://user:password@127.0.0.1:5432/jl_business_test?sslmode=disable", want: true},
		{name: "development database", url: "postgres://user:password@127.0.0.1:5432/jl_business_dev?sslmode=disable"},
		{name: "production database", url: "postgres://user:password@127.0.0.1:5432/jl_business_prod?sslmode=disable"},
		{name: "wrong scheme", url: "mysql://user:password@127.0.0.1:3306/jl_business_test"},
		{name: "missing database", url: "postgres://user:password@127.0.0.1:5432/"},
		{name: "empty", url: ""},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isAllowedTestDatabaseURL(test.url); got != test.want {
				t.Fatalf("isAllowedTestDatabaseURL(%q) = %v, want %v", test.url, got, test.want)
			}
		})
	}
}
