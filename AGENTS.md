# AGENTS.md

## Purpose

JL 团队生意成长管理系统是团队内部使用的个人生意成长与经营管理系统，核心闭环是：梦想/目标 → 日历 → 每日行动 → 工作量、营业额、财务、团队 → 复盘。

这是一个 React/TypeScript + Vite 前端、Go/Echo 后端、PostgreSQL 数据库的单体应用；正式运行模型是 Nginx + systemd，不使用 Docker。

## Operating rules

- 直接的系统、开发者和用户要求优先于本文件；更深目录中的适用 instructions 优先于本文件。
- 每项任务开始前先确认当前目录、Git 根目录、分支、HEAD 和工作区状态；不要假设用户描述的分支或版本仍然是当前状态。
- 保留用户已有的未提交修改；不要用清理、重置或覆盖操作解决无关问题。
- 不连接或修改生产服务器、生产数据库、生产密钥或生产文件，除非当前任务明确授权。
- 不从普通的“完成任务”请求推导出 commit、push、PR、merge、tag、GitHub Release 或部署权限；这些是独立动作。
- 不编造文件、接口、版本、测试结果、部署结果或 Git 状态。

## Product boundaries

- 不做候选人 CRM、微服务、Redis/MQ/Elasticsearch/Kubernetes 或 V1 AI 功能。
- 不上传音频、视频或 DOCX；附件正文不自动解析或 OCR。
- 管理员不得读取普通用户业务数据；所有 USER 业务数据必须按当前认证用户严格隔离。
- 未经产品负责人明确批准，不改变已确定的业务规则、API 行为或已发布版本的语义。

## Source of truth

- API contract 以 OpenAPI 定义为准；不要只修改生成的 API 类型或 handler 代码来绕过 contract。
- 数据库行为以 migration、sqlc query 和测试共同定义；SQL 保持显式、类型安全，并使用 sqlc 生成访问代码。
- 生成文件不要手工编辑。修改其源文件后运行 `make generate`，检查生成 diff 是否符合预期。
- 正式运行、Release、updater 和 bootstrap 的细节以 `docs/`、`deploy/` 中的正式文档及现有测试为准，不把易过期的部署状态写进本文件。

## Database and migration rules

- 支持 PostgreSQL 13 或更新版本；`pg_trgm` 是必需 extension，应用不依赖 `pgcrypto` 或 OpenSSL 构建选项。
- migration 默认 append-only，只能通过新增 migration 演进 schema，并同时考虑 fresh database 和从已发布版本升级的路径。当前终点为 `00014_remove_import_export.sql`；除已记录的 pgcrypto 兼容例外外，不得修改已发布 migration。
- 对 `00001_extensions.sql` 删除未使用 pgcrypto create/drop 是唯一批准的历史兼容例外；不得借此修改其他已发布 migration。不可变的 v1.1.3 tag 不得移动或重建。
- 生产 migration forward-only，只允许受信任 helper 执行 Goose `up`；不得引入任意 migration 路径、命令或 `down` 流程。
- 开发和集成测试只能使用明确隔离的数据库。使用 `TEST_DATABASE_URL` 前必须通过项目的 test-database guard，不能猜测地址或复用生产 `DATABASE_URL`。
- 生产 psql/pg_dump 使用受信任 EnvironmentFile 提供的 libpq `PG*` 配置；数据库 URL、密码和完整 conninfo 不得进入 process argv、日志、状态 JSON 或前端。

## Environment and secrets

- 本地开发使用 Go 1.27+、Node.js 20+ 和 npm；前端依赖以 `package-lock.json` 为准。
- 本地默认 API 监听 `127.0.0.1:8080`，Vite 监听 `0.0.0.0:5173` 并代理 `/api`；生产端口和地址以部署配置为准，不要把生产地址硬编码进通用源码。
- 不读取、打印、复制或提交 `.env.*.local`、`.local/`、数据库 dump、用户文件、生产配置或任何 secret；`.env.example` 只能作为非敏感配置模板。
- `RELEASE_UPDATE_ENABLED` 默认必须为 `false`。在线更新启用是单独的生产运维决策，不因完成普通代码任务而开启。

## Code and security invariants

- V1 money values 在 API 边界使用 decimal strings，在 Go 业务边界使用 integer cents；不要用不受约束的浮点或整数转换替代现有 money helpers。
- 认证、授权和用户隔离必须在后端服务和查询边界强制执行，不能依赖前端隐藏或过滤。
- Release archive、installed release、current symlink、runtime state 和 systemd sandbox 构成 updater trust boundary；不要降低 ownership、mode、non-symlink 或固定路径校验。
- root updater 不执行 Release 中的 application binary，不执行来自请求的任意 command/path/URL/repository，也不直接以 root 运行 backup helper。
- 不为了让测试通过而放宽权限边界、跳过验证、吞掉错误或伪造状态。

## Verification

优先使用仓库级命令，并按变更范围补充针对性验证：

```bash
make generate
make lint
make test
make build
make check
```

- `make check` 会生成代码并执行 lint、单元测试和构建；它不等于 integration、E2E、Release 或生产 rehearsal 全部通过。
- backend 变更至少运行相关 Go tests；frontend 行为变更至少运行相关 unit tests，并在用户流程受影响时运行 E2E。
- migration 变更补充 fresh/upgrade 或已有 migration regression 验证；数据库级验证只能连接受 guard 保护的测试库。
- fresh/upgrade、integration 和 E2E 需要数据库时，优先使用 `make test-isolated` 创建任务专用实例；安全边界和分范围命令见 `docs/testing.md`，不得擅自重置外部提供的数据库。
- shell、updater、backup、migration helper 或 systemd 模板变更，运行对应 syntax check、静态检查和 harness。
- 未运行的验证必须报告为“未运行”；不要把局部测试描述成完整集成、E2E 或生产验证。
- 完成修改后检查 `git diff --check`、`git status --short`，并确认没有意外生成物、secret 或用户数据进入 diff。

## Git and handoff

- 保持变更小而明确，避免无关重构、格式化和文档扩张。
- 不使用 force push、删除/移动已发布 tag 或重建已发布 Release，除非用户明确授权且任务专门要求。
- 最终报告应包含：修改范围、实际运行的验证命令及结果、未运行项目及原因、Git 状态，以及 commit/push/PR/tag/Release/deployment 是否发生。

不要从本文件推断当前 branch、HEAD、schema、Release、PR 或部署状态；每次任务都必须现场检查仓库和外部状态。
