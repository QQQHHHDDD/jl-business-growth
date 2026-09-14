package search

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"jl-business-growth/backend/internal/problem"
)

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

type Result struct {
	Module    string
	ID        uuid.UUID
	Title     string
	Snippet   string
	UpdatedAt time.Time
	Score     float32
}

func (s *Service) Search(ctx context.Context, userID uuid.UUID, query string, page, pageSize int) ([]Result, int, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []Result{}, 0, problem.New("VALIDATION_ERROR", http.StatusBadRequest, "search query is required")
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	pattern := "%" + query + "%"
	const source = `WITH hits AS (
		SELECT 'goals'::text AS module, id, title, COALESCE(description,'') AS searchable, updated_at FROM goals WHERE user_id=$1
		UNION ALL SELECT 'calendar'::text, id, title, concat_ws(' ',title,description,location_or_link), updated_at FROM calendar_events WHERE user_id=$1
		UNION ALL SELECT 'team'::text, id, name, concat_ws(' ',name,rank,city,note), updated_at FROM team_members WHERE user_id=$1
		UNION ALL SELECT 'knowledge'::text, id, title, concat_ws(' ',title,raw_text,summary,understanding,action_items), updated_at FROM knowledge_items WHERE user_id=$1
		UNION ALL SELECT 'tags'::text, t.id, t.name, t.name, now() FROM tags t WHERE t.user_id=$1
	)
	SELECT module,id,title,searchable,updated_at,
		CASE WHEN searchable ILIKE $2 THEN 1.0 ELSE similarity(searchable,$3) END AS score
	FROM hits WHERE searchable ILIKE $2 OR (length($3) >= 3 AND similarity(searchable,$3) >= 0.15)
	ORDER BY score DESC, updated_at DESC LIMIT $4 OFFSET $5`
	rows, err := s.pool.Query(ctx, source, userID, pattern, query, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]Result, 0)
	for rows.Next() {
		var item Result
		if err := rows.Scan(&item.Module, &item.ID, &item.Title, &item.Snippet, &item.UpdatedAt, &item.Score); err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	err = s.pool.QueryRow(ctx, `WITH hits AS (
		SELECT title AS searchable FROM goals WHERE user_id=$1
		UNION ALL SELECT concat_ws(' ',title,description,location_or_link) FROM calendar_events WHERE user_id=$1
		UNION ALL SELECT concat_ws(' ',name,rank,city,note) FROM team_members WHERE user_id=$1
		UNION ALL SELECT concat_ws(' ',title,raw_text,summary,understanding,action_items) FROM knowledge_items WHERE user_id=$1
		UNION ALL SELECT name FROM tags WHERE user_id=$1
	) SELECT count(*) FROM hits WHERE searchable ILIKE $2 OR (length($3)>=3 AND similarity(searchable,$3)>=0.15)`, userID, pattern, query).Scan(&total)
	return items, total, err
}
