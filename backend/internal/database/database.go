package database

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Pinger interface {
	Ping(context.Context) error
}

func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, databaseURL)
}
