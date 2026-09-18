# V1.0 代码与测试命名规范收口完成报告

## 1. 结论

**NAMING CLEANUP NO-GO**

命名收口本身已按 Batch A～E 完成，Git rename、测试函数/helper、Makefile 选择器、性能测试开关、示例配置、活跃 UI 文案与长期规范文档均已落地；migration、生成代码和历史正式编号文档未被重命名或改写。

但是本机没有 `node`/`npm`，且没有可用的 `DATABASE_URL`/`TEST_DATABASE_URL`，Prompt 要求的前端、E2E、数据库 integration/performance 和 migration status 门禁无法完整执行。因此不能给出 PASS。

## 2. 基线与提交

- 基线 HEAD：`401e800b95d0c9f88d68f06de7bc261924018a8f`
- 文档 checkpoint：`67227e8 docs: checkpoint naming audit inputs`
- Batch A：`36097d9 refactor(naming): rename staged api source files`
- Batch B：`5b87793 refactor(test): rename e2e suites by user workflow`
- Batch C：`89adafd refactor(test): rename integration tests by business responsibility`
- Batch D：`a1030f6 refactor(test): rename test gates and runtime flags`
- Batch E：`c6618ec fix(copy): remove development phase wording from active ui`
- 命名规范：`cc0e576 docs: define code naming conventions`
- 命名代码/测试最终 HEAD（本报告提交前）：`cc0e576`
- 仓库交付最终 HEAD：以本报告提交后的 `git rev-parse HEAD` 和最终交付信息为准；报告提交只增加本文件，不再修改代码或测试。

开始命名变更前，三份正式但未跟踪文档已作为独立 checkpoint 提交，之后工作区为空：

```text
docs/42-V1.0最终UAT第三轮第三批修复Prompt-V1.0.md
docs/44-V1.0代码与测试命名规范收口执行Prompt-V1.0.md
docs/code-file-naming-audit.md
```

## 3. 实际文件 rename 映射

全部使用 `git mv`：

```text
backend/internal/api/phase45.go
  -> backend/internal/api/team_knowledge_files_search.go

backend/internal/api/phase5.go
  -> backend/internal/api/finance_income.go

backend/internal/api/phase6.go
  -> backend/internal/api/import_export_account.go

frontend/e2e/baseline.spec.ts
  -> frontend/e2e/application-shell.spec.ts

frontend/e2e/phase1-auth.spec.ts
  -> frontend/e2e/admin-and-business-workflows.spec.ts

backend/cmd/jl-business-api/main_integration_test.go
  -> backend/cmd/jl-business-api/business_api_integration_test.go

backend/cmd/jl-business-api/phase7_comprehensive_test.go
  -> backend/cmd/jl-business-api/security_fault_performance_integration_test.go
```

Git 识别结果：

```text
R100 backend/internal/api/phase5.go -> backend/internal/api/finance_income.go
R100 backend/internal/api/phase6.go -> backend/internal/api/import_export_account.go
R100 backend/internal/api/phase45.go -> backend/internal/api/team_knowledge_files_search.go
R099 frontend/e2e/phase1-auth.spec.ts -> frontend/e2e/admin-and-business-workflows.spec.ts
R078 frontend/e2e/baseline.spec.ts -> frontend/e2e/application-shell.spec.ts
R088 backend/cmd/jl-business-api/main_integration_test.go -> backend/cmd/jl-business-api/business_api_integration_test.go
R065 backend/cmd/jl-business-api/phase7_comprehensive_test.go -> backend/cmd/jl-business-api/security_fault_performance_integration_test.go
```

识别率低于 100% 的测试文件同时进行了 Prompt 要求的测试名、helper 与 fixture 命名同步，不是删除后重建。

## 4. 测试函数与符号改名映射

### 4.1 Go integration test

```text
TestPhase1APIIntegration
  -> TestAuthenticationAdminAPIIntegration
TestPhase2APIIntegration
  -> TestDailyBusinessAPIIntegration
TestPhase3APIIntegration
  -> TestCalendarReviewsAnalyticsAPIIntegration
TestPhase4APIIntegration
  -> TestTeamKnowledgeFilesSearchAPIIntegration
TestPhase5APIIntegration
  -> TestFinanceIncomeAPIIntegration
TestPhase6APIIntegration
  -> TestImportExportAccountLifecycleAPIIntegration

TestPhase7SecurityIntegration
  -> TestSecurityIsolationIntegration
TestPhase7FaultHandling
  -> TestFaultHandlingIntegration
TestPhase7Performance
  -> TestPerformanceIntegration
```

### 4.2 helper / type

```text
phase3Tables -> calendarReviewsTablesReady
phase7Harness -> comprehensiveTestHarness
newPhase7Harness -> newComprehensiveTestHarness
phase7SuperAdmin -> comprehensiveSuperAdmin
phase7Invitation -> createTestInvitation
phase7Register -> registerTestUser
phase7FailingSender -> failingSender
phase7UploadFile -> uploadTestFileWithLimits
phase7LoadUser -> performanceUser
phase7RequestResult -> performanceRequestResult
phase7Request -> performanceRequest
jsonMarshalPhase7 -> marshalTestJSON
```

`jsonMarshalPhase7` 是实施时扫描发现的同类遗漏，按相同规则同步清理。

### 4.3 E2E 标题与 fixture

```text
loads the Phase 0 application shell
  -> loads the application shell

covers the Phase 1 administrator flow and Phase 2-6 core loops
  -> covers administrator, account, and core business workflows
```

E2E 中的阶段化密码和 `phase6-worklog.xlsx` 已改为管理员、业务用户及 `worklog-import.xlsx` 场景名。Go integration test 的账号、附件、搜索词、标题和失败提示也只进行了同等语义的 fixture 命名替换；断言标准、请求、API 路径和测试覆盖没有删除或降低。

## 5. Makefile、运行开关和示例配置

### Makefile integration 选择器

旧：

```text
^TestPhase[123456]APIIntegration$
```

新：

```text
^(TestAuthenticationAdminAPIIntegration|TestDailyBusinessAPIIntegration|TestCalendarReviewsAnalyticsAPIIntegration|TestTeamKnowledgeFilesSearchAPIIntegration|TestFinanceIncomeAPIIntegration|TestImportExportAccountLifecycleAPIIntegration)$
```

### Performance

```text
PHASE7_PERFORMANCE -> RUN_PERFORMANCE_TESTS
TestPhase7Performance -> TestPerformanceIntegration
```

`make test-performance` 当前显式设置 `RUN_PERFORMANCE_TESTS=1` 并用 `^TestPerformanceIntegration$` 精确选择。

### 示例配置

```text
replace-before-phase-1 -> replace-before-first-start
```

该值只位于 `.env.example`，未修改环境变量名和认证逻辑。

## 6. 活跃文档与 UI

- `docs/exec-plans/active/v1-implementation.md` 的当前 E2E/integration 路径及仍作为当前引用的测试函数名已更新。
- 历史 Prompt、UAT 和完成报告中的旧路径、旧函数名及 Phase 叙述保留为当时证据。
- `frontend/src/features/placeholder/placeholder-page.tsx` 仍由 `frontend/src/App.tsx` 引用并可经 fallback route 到达，因此将“后续 Phase 开放”改为“该功能暂未开放”，并将后续说明改为产品版本语言；没有删除模块或改变路由/交互。
- 新增长期规范 `docs/code-naming-conventions.md`。

## 7. Protected 文件确认

### 7.1 Goose migration

基线至命名收口 HEAD 的 protected path diff 为空。以下 10 个路径仍完全一致：

```text
backend/db/migrations/00001_extensions.sql
backend/db/migrations/00002_authentication.sql
backend/db/migrations/00003_daily_core.sql
backend/db/migrations/00004_calendar_reviews.sql
backend/db/migrations/00005_team_knowledge_files.sql
backend/db/migrations/00006_finance_income.sql
backend/db/migrations/00007_import_jobs.sql
backend/db/migrations/00008_v1_closure.sql
backend/db/migrations/00009_calendar_contacts.sql
backend/db/migrations/00010_team_member_node_color.sql
```

没有创建 migration，没有改名、重编号或修改内容。

### 7.2 生成代码

基线至命名收口 HEAD 的下列路径 diff 为空：

```text
backend/db/generated/auth.sql.go
backend/db/generated/daily_core.sql.go
backend/db/generated/db.go
backend/db/generated/health.sql.go
backend/db/generated/import_jobs.sql.go
backend/db/generated/invitation.sql.go
backend/db/generated/models.go
backend/internal/api/openapi.gen.go
frontend/src/api/openapi.gen.ts
```

`make generate` 中 Go OpenAPI/sqlc 生成步骤成功且没有产生受控差异；前端生成步骤因 `npm` 不存在而未运行。

### 7.3 历史文档与工具固定文件

- 没有重命名任何既有编号文档、历史 Prompt/UAT/完成报告。
- `go.mod`、`go.sum`、`main.go`、`package*.json`、Vite/Playwright/tsconfig、README、AGENTS、Makefile 文件名、systemd/nginx 文件名均保持不变。
- Makefile 内容只更新测试选择器和性能开关。

## 8. 剩余 `phase` 命中分类

### 合理保留

非 `docs/` 受控文件只剩 6 处：

```text
AGENTS.md:78-79       项目 Phase 0-7 状态与执行边界
README.md:3,55        历史完成阶段和验收说明
deploy/README.md:13,16 发布门禁的历史阶段说明
```

`docs/` 中的命中均属于以下类别：

- 原始开发 Prompt、阶段计划和正式设计文档；
- UI Phase A/B 历史资料；
- UAT/综合测试 Prompt 与完成报告；
- 本轮输入审计、执行 Prompt、长期规范中对禁用旧命名的说明；
- `docs/exec-plans/active/v1-implementation.md` 中的已完成阶段、历史 commit 与测试结果记录。

历史文档中的旧源码路径和旧测试名未被批量改写。

### 需要后续处理

**0 个命名遗留项。**

以下目录/文件扫描未发现无合理历史意义的 `phaseN` 名称：

```text
frontend/src/
frontend/e2e/
backend/internal/
backend/cmd/
Makefile
.env.example
scripts/
```

`deploy/README.md` 的两个命中是准确的发布阶段叙述，不是脚本、配置或运行标识符。

## 9. 测试选择器真实性验证

`go test -list` 实际发现 9 个新名称：

```text
TestAuthenticationAdminAPIIntegration
TestDailyBusinessAPIIntegration
TestCalendarReviewsAnalyticsAPIIntegration
TestTeamKnowledgeFilesSearchAPIIntegration
TestFinanceIncomeAPIIntegration
TestImportExportAccountLifecycleAPIIntegration
TestSecurityIsolationIntegration
TestFaultHandlingIntegration
TestPerformanceIntegration
```

又用与 Makefile 等价的业务测试正则执行 verbose Go test，输出了全部 9 个 `=== RUN`；前 8 个因缺少 `TEST_DATABASE_URL` 跳过，performance 因直接验证命令未设置 `RUN_PERFORMANCE_TESTS=1` 跳过。该证据确认测试发现和重命名后的正则不是零测试。正式 Make target 仍因数据库前置检查失败而不能算通过。

## 10. Prompt 全量回归结果

| 命令 | 结果 | 真实输出/边界 |
| --- | --- | --- |
| `make generate` | FAIL / 环境阻塞 | Go OpenAPI 和 sqlc 生成成功；`generate-frontend` 报 `npm: 未找到命令`，exit 127。生成文件无 Git 差异。 |
| `make lint` | FAIL / 环境阻塞 | `go vet ./...` 通过；前端 lint 报 `npm: 未找到命令`。 |
| `make test` | FAIL / 环境阻塞 | `go test ./...` 全部通过；前端 Vitest 报 `npm: 未找到命令`。 |
| `make build` | FAIL / 环境阻塞 | 两个 Go binary 构建成功；前端 build 报 `npm: 未找到命令`。 |
| `make check` | FAIL / 环境阻塞 | 在 `generate-frontend` 因缺少 `npm` 停止。 |
| `make test-integration` | FAIL / 环境阻塞 | `check-test-database` 明确拒绝：`TEST_DATABASE_URL must be a PostgreSQL URL targeting the isolated jl_business_test database`。 |
| `make test-e2e` | FAIL / 环境阻塞 | 报 `npm: 未找到命令`。 |
| `make test-performance` | FAIL / 环境阻塞 | 在 `check-test-database` 因缺少合规 `TEST_DATABASE_URL` 停止。 |
| `git diff --check` | PASS | 当前工作树没有 whitespace error。额外的 `401e800..HEAD` range 检查只报告新纳入版本控制的正式 Prompt 44 原有 Markdown hard-break 尾随空格；未改写该保护文档。 |
| `make migrate-status` | FAIL / 环境阻塞 | `DATABASE_URL must be set`。 |
| `make migrate-test-status` | FAIL / 环境阻塞 | 缺少指向 `jl_business_test` 的 `TEST_DATABASE_URL`。 |

补充通过项：

```text
go test ./...                                      PASS
go vet ./...                                       PASS
Go API/jobs binary build                           PASS
Go integration package compile                     PASS
go test -list renamed test discovery               PASS（9/9 已发现）
verbose renamed-test selector audit                PASS（9/9 被选中，因环境跳过执行）
```

由于 Prompt 要求的所有门禁没有完整通过，本轮结论必须是 NO-GO；不能用局部 Go 通过替代前端、数据库、E2E 和性能验收。

## 11. `git diff --name-status`

相对基线 `401e800`，报告提交前为：

```text
M    .env.example
M    Makefile
R088 backend/cmd/jl-business-api/main_integration_test.go -> backend/cmd/jl-business-api/business_api_integration_test.go
R065 backend/cmd/jl-business-api/phase7_comprehensive_test.go -> backend/cmd/jl-business-api/security_fault_performance_integration_test.go
R100 backend/internal/api/phase5.go -> backend/internal/api/finance_income.go
R100 backend/internal/api/phase6.go -> backend/internal/api/import_export_account.go
R100 backend/internal/api/phase45.go -> backend/internal/api/team_knowledge_files_search.go
A    docs/42-V1.0最终UAT第三轮第三批修复Prompt-V1.0.md
A    docs/44-V1.0代码与测试命名规范收口执行Prompt-V1.0.md
A    docs/code-file-naming-audit.md
A    docs/code-naming-conventions.md
M    docs/exec-plans/active/v1-implementation.md
R099 frontend/e2e/phase1-auth.spec.ts -> frontend/e2e/admin-and-business-workflows.spec.ts
R078 frontend/e2e/baseline.spec.ts -> frontend/e2e/application-shell.spec.ts
M    frontend/src/features/placeholder/placeholder-page.tsx
```

本报告提交后会额外出现：

```text
A    docs/code-file-naming-cleanup-report.md
```

没有意外删除或新增业务文件。

## 12. 最终工作树与行为边界

本报告提交后预期：

```text
git status --short
# 无输出
```

本轮没有发生业务逻辑、API 路径、database schema、migration、权限模型、生产部署或 UI 交互变化。只发生：

- 文件、测试函数、helper/type、fixture、运行开关及必要引用的命名整理；
- 仍可访问占位页面的一处产品文案调整；
- 长期命名规范和完成报告新增。

未部署生产，未创建 `v1.0.0`。
