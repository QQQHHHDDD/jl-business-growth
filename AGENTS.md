# AGENTS.md

## Project

JL团队生意成长管理系统是 JL 团队内部使用的个人生意成长与经营管理系统。核心闭环：梦想/目标 → 日历 → 每日行动 → 工作量/营业额/财务/团队 → 复盘。

## Source of truth

正式产品与技术规则在 `docs/`。开始任务前先读：

- `docs/00-文档索引.md`
- 当前阶段对应设计文档
- `docs/06-收入模拟器公式映射-V1.0.md`（涉及收入计算时）
- `docs/07-Codex开发与云端发布工作流-V1.2.md`

不要根据常识擅自修改已确定业务规则。

## Stack

- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query
- Backend: Go + Echo + OpenAPI + oapi-codegen + pgx + sqlc + Goose
- DB: PostgreSQL
- Production: Nginx + systemd
- No Docker

## Hard constraints

- 不做候选人 CRM。
- 不做微服务。
- 不使用 Redis/MQ/Elasticsearch/Kubernetes。
- V1 不做 AI。
- 不上传音频、视频、DOCX。
- 附件正文不自动解析/OCR。
- 管理员不得读取普通用户业务数据。
- 所有 USER 业务数据必须严格按用户隔离。
- 开发与测试环境不得使用生产数据库、生产密钥或生产文件。

## Local environment

- Frontend: `0.0.0.0:5173`
- Backend: `127.0.0.1:8080`
- Vite proxies `/api` to backend
- Dev DB: `jl_business_dev`
- Test DB: `jl_business_test`
- Dev files: `.local/files`
- Dev mail: `.local/mail-outbox`

## Commands

Prefer repository-level commands:

```bash
make generate
make lint
make test
make test-e2e
make build
make check
```

If a command is missing, add it rather than documenting many ad-hoc alternatives.

## Change discipline

- API contract starts from `backend/openapi/openapi.yaml`.
- DB changes require new migration.
- Keep SQL explicit and type-safe through sqlc.
- Add tests for business-rule changes.
- Income simulator changes require Golden Tests.
- V1 money fields use decimal strings at API boundaries and integer cents for final Go business values.
- Current schema migrations end at `00010_team_member_node_color.sql`; migrations are append-only.
- Do not commit secrets, `.env`, `.local`, database dumps, or user files.

## Current execution plan

Use `docs/exec-plans/active/v1-implementation.md`. Keep it updated as implementation progresses.

Phase 0-6, the V1 P0-01-P0-11 closeout, and Phase 7 comprehensive testing are
complete. Current work is final UAT and PR review on `v1-final-uat-closure`.
Do not perform production deployment or create the production release unless
explicitly approved by the product owner.
