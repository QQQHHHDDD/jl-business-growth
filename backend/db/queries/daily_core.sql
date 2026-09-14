-- name: ListWorklogs :many
SELECT w.id, w.user_id, w.work_date,
       w.open_conversation_count, w.deep_conversation_count, w.buffer_count,
       w.story_share_count, w.screening_count, w.opportunity_count,
       w.meeting_count, w.customer_followup_count, w.note,
       w.created_at, w.updated_at,
       COALESCE((SELECT ls.minutes FROM learning_sessions ls
                 WHERE ls.user_id = w.user_id AND ls.activity_date = w.work_date
                   AND ls.activity_type = 'READING' AND ls.source = 'DAILY_UNALLOCATED'), 0)::bigint AS reading_minutes,
       COALESCE((SELECT ls.minutes FROM learning_sessions ls
                 WHERE ls.user_id = w.user_id AND ls.activity_date = w.work_date
                   AND ls.activity_type = 'AUDIO' AND ls.source = 'DAILY_UNALLOCATED'), 0)::bigint AS audio_minutes,
       t.pv AS turnover_pv, t.net_amount AS turnover_net_amount
FROM daily_worklogs w
LEFT JOIN daily_turnovers t ON t.user_id = w.user_id AND t.turnover_date = w.work_date
WHERE w.user_id = $1 AND w.work_date BETWEEN $2 AND $3
ORDER BY w.work_date DESC;

-- name: GetWorklog :one
SELECT w.id, w.user_id, w.work_date,
       w.open_conversation_count, w.deep_conversation_count, w.buffer_count,
       w.story_share_count, w.screening_count, w.opportunity_count,
       w.meeting_count, w.customer_followup_count, w.note,
       w.created_at, w.updated_at,
       COALESCE((SELECT ls.minutes FROM learning_sessions ls
                 WHERE ls.user_id = w.user_id AND ls.activity_date = w.work_date
                   AND ls.activity_type = 'READING' AND ls.source = 'DAILY_UNALLOCATED'), 0)::bigint AS reading_minutes,
       COALESCE((SELECT ls.minutes FROM learning_sessions ls
                 WHERE ls.user_id = w.user_id AND ls.activity_date = w.work_date
                   AND ls.activity_type = 'AUDIO' AND ls.source = 'DAILY_UNALLOCATED'), 0)::bigint AS audio_minutes,
       t.pv AS turnover_pv, t.net_amount AS turnover_net_amount
FROM daily_worklogs w
LEFT JOIN daily_turnovers t ON t.user_id = w.user_id AND t.turnover_date = w.work_date
WHERE w.user_id = $1 AND w.work_date = $2;

-- name: UpsertWorklog :one
INSERT INTO daily_worklogs (
    id, user_id, work_date, open_conversation_count, deep_conversation_count,
    buffer_count, story_share_count, screening_count, opportunity_count,
    meeting_count, customer_followup_count, note
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (user_id, work_date) DO UPDATE SET
    open_conversation_count = EXCLUDED.open_conversation_count,
    deep_conversation_count = EXCLUDED.deep_conversation_count,
    buffer_count = EXCLUDED.buffer_count,
    story_share_count = EXCLUDED.story_share_count,
    screening_count = EXCLUDED.screening_count,
    opportunity_count = EXCLUDED.opportunity_count,
    meeting_count = EXCLUDED.meeting_count,
    customer_followup_count = EXCLUDED.customer_followup_count,
    note = EXCLUDED.note,
    updated_at = now()
RETURNING id, user_id, work_date, open_conversation_count, deep_conversation_count,
          buffer_count, story_share_count, screening_count, opportunity_count,
          meeting_count, customer_followup_count, note, created_at, updated_at;

-- name: DeleteWorklog :exec
DELETE FROM daily_worklogs WHERE user_id = $1 AND work_date = $2;

-- name: UpsertDailyLearningSession :one
INSERT INTO learning_sessions (id, user_id, activity_type, activity_date, minutes, source)
VALUES ($1, $2, $3, $4, $5, 'DAILY_UNALLOCATED')
ON CONFLICT (user_id, activity_date, activity_type) WHERE source = 'DAILY_UNALLOCATED' DO UPDATE SET
    minutes = EXCLUDED.minutes,
    updated_at = now()
RETURNING id, user_id, activity_type, activity_date, minutes, source, created_at, updated_at;

-- name: DeleteDailyLearningSession :exec
DELETE FROM learning_sessions
WHERE user_id = $1 AND activity_date = $2 AND activity_type = $3 AND source = 'DAILY_UNALLOCATED';

-- name: ListTurnovers :many
SELECT id, user_id, turnover_date, pv, net_amount, note, created_at, updated_at
FROM daily_turnovers
WHERE user_id = $1 AND turnover_date BETWEEN $2 AND $3
ORDER BY turnover_date DESC;

-- name: GetTurnover :one
SELECT id, user_id, turnover_date, pv, net_amount, note, created_at, updated_at
FROM daily_turnovers
WHERE user_id = $1 AND turnover_date = $2;

-- name: UpsertTurnover :one
INSERT INTO daily_turnovers (id, user_id, turnover_date, pv, net_amount, note)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, turnover_date) DO UPDATE SET
    pv = EXCLUDED.pv,
    net_amount = EXCLUDED.net_amount,
    note = EXCLUDED.note,
    updated_at = now()
RETURNING id, user_id, turnover_date, pv, net_amount, note, created_at, updated_at;

-- name: DeleteTurnover :exec
DELETE FROM daily_turnovers WHERE user_id = $1 AND turnover_date = $2;

-- name: GetWorklogTotals :one
SELECT COALESCE(SUM(open_conversation_count), 0)::bigint AS open_conversation_count,
       COALESCE(SUM(deep_conversation_count), 0)::bigint AS deep_conversation_count,
       COALESCE(SUM(buffer_count), 0)::bigint AS buffer_count,
       COALESCE(SUM(story_share_count), 0)::bigint AS story_share_count,
       COALESCE(SUM(screening_count), 0)::bigint AS screening_count,
       COALESCE(SUM(opportunity_count), 0)::bigint AS opportunity_count,
       COALESCE(SUM(meeting_count), 0)::bigint AS meeting_count,
       COALESCE(SUM(customer_followup_count), 0)::bigint AS customer_followup_count,
       COALESCE((SELECT SUM(ls.minutes) FROM learning_sessions ls WHERE ls.user_id = $1 AND ls.activity_date BETWEEN $2 AND $3 AND ls.activity_type = 'READING' AND ls.source = 'DAILY_UNALLOCATED'), 0)::bigint AS reading_minutes,
       COALESCE((SELECT SUM(ls.minutes) FROM learning_sessions ls WHERE ls.user_id = $1 AND ls.activity_date BETWEEN $2 AND $3 AND ls.activity_type = 'AUDIO' AND ls.source = 'DAILY_UNALLOCATED'), 0)::bigint AS audio_minutes
FROM daily_worklogs w
WHERE w.user_id = $1 AND w.work_date BETWEEN $2 AND $3;

-- name: GetTurnoverTotals :one
SELECT COALESCE(SUM(pv), 0)::numeric AS pv,
       COALESCE(SUM(net_amount), 0)::numeric AS net_amount
FROM daily_turnovers t
WHERE t.user_id = $1 AND t.turnover_date BETWEEN $2 AND $3;

-- name: ListDreams :many
SELECT d.id, d.user_id, d.title, d.description, d.sort_order, d.created_at, d.updated_at
FROM dreams d
WHERE d.user_id = $1
ORDER BY d.sort_order, d.created_at;

-- name: GetDream :one
SELECT d.id, d.user_id, d.title, d.description, d.sort_order, d.created_at, d.updated_at
FROM dreams d
WHERE d.user_id = $1 AND d.id = $2
;

-- name: ListDreamGoalIDs :many
SELECT goal_id FROM dream_goal_links WHERE dream_id = $1 ORDER BY goal_id;

-- name: CreateDream :one
INSERT INTO dreams (id, user_id, title, description, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, user_id, title, description, sort_order, created_at, updated_at;

-- name: UpdateDream :one
UPDATE dreams SET title = $3, description = $4, sort_order = $5, updated_at = now()
WHERE user_id = $1 AND id = $2
RETURNING id, user_id, title, description, sort_order, created_at, updated_at;

-- name: DeleteDream :exec
DELETE FROM dreams WHERE user_id = $1 AND id = $2;

-- name: DeleteDreamGoalLinks :exec
DELETE FROM dream_goal_links WHERE dream_id = $1;

-- name: AddDreamGoalLink :exec
INSERT INTO dream_goal_links (dream_id, goal_id) VALUES ($1, $2);

-- name: ListGoals :many
SELECT id, user_id, parent_id, type, title, description, start_date, due_date, status, sort_order, created_at, updated_at
FROM goals WHERE user_id = $1 ORDER BY sort_order, created_at;

-- name: GetGoal :one
SELECT id, user_id, parent_id, type, title, description, start_date, due_date, status, sort_order, created_at, updated_at
FROM goals WHERE user_id = $1 AND id = $2;

-- name: CreateGoal :one
INSERT INTO goals (id, user_id, parent_id, type, title, description, start_date, due_date, status, sort_order)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id, user_id, parent_id, type, title, description, start_date, due_date, status, sort_order, created_at, updated_at;

-- name: UpdateGoal :one
UPDATE goals SET parent_id = $3, type = $4, title = $5, description = $6, start_date = $7,
    due_date = $8, status = $9, sort_order = $10, updated_at = now()
WHERE user_id = $1 AND id = $2
RETURNING id, user_id, parent_id, type, title, description, start_date, due_date, status, sort_order, created_at, updated_at;

-- name: DeleteGoal :exec
DELETE FROM goals WHERE user_id = $1 AND id = $2;

-- name: ListGoalMetrics :many
SELECT goal_id, metric_code, target_value, unit
FROM goal_metrics WHERE goal_id = ANY($1::uuid[]) ORDER BY goal_id, metric_code;

-- name: DeleteGoalMetrics :exec
DELETE FROM goal_metrics WHERE goal_id = $1;

-- name: UpsertGoalMetric :exec
INSERT INTO goal_metrics (goal_id, metric_code, target_value, unit)
VALUES ($1, $2, $3, $4)
ON CONFLICT (goal_id, metric_code) DO UPDATE SET target_value = EXCLUDED.target_value, unit = EXCLUDED.unit;

-- name: CountDreams :one
SELECT count(*)::bigint FROM dreams WHERE user_id = $1;
