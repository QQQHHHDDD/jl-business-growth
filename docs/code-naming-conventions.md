# V1.0 代码与测试命名规范

本规范适用于 JL 团队生意成长管理系统的长期源码、测试、脚本和新增文档。原则是：

> 业务职责优先，技术职责其次，历史开发阶段不作为长期命名。

## TypeScript / React

- 文件和目录使用 kebab-case：`calendar-page.tsx`、`account-switcher.tsx`、`route-preload.ts`。
- 页面使用 `<domain>-page.tsx`；共享组件使用清晰的组件/能力名：`page-header.tsx`、`timezone-select.tsx`。
- 单元测试与源文件同名并追加 `.test.ts` 或 `.test.tsx`：`calendar-page.test.tsx`。
- Playwright 文件使用用户旅程、业务域或质量属性命名并追加 `.spec.ts`：`auth.spec.ts`、`calendar.spec.ts`、`mobile-navigation.spec.ts`、`admin-and-business-workflows.spec.ts`。
- helper 按职责命名；仅在边界确实跨域时使用 `utils.ts`。
- 生成文件保持生成器约定，例如 `openapi.gen.ts`，不人工改名。

## Go

- 包目录按业务域使用小写；文件使用 snake_case：`finance_income.go`、`security_headers.go`。
- 在目录语义已经充分时可以使用 `service.go`、`handler.go`；跨多个业务域时文件名应列出主要职责。
- 普通测试使用 `<subject>_test.go`；数据库/HTTP 工作流使用 `<workflow>_integration_test.go`。
- 测试函数使用 `Test<BusinessBehavior>`，例如 `TestFinanceIncomeAPIIntegration`、`TestSecurityIsolationIntegration`；不得使用 `TestPhaseN...`。
- helper、type 和 fixture 使用业务场景或质量属性命名，例如 `comprehensiveTestHarness`、`registerTestUser`、`performanceRequestResult`。
- `cmd/*/main.go`、`go.mod`、`go.sum` 和生成代码遵循 Go/toolchain 固定命名。

## 测试、fixture 与运行开关

- 测试文件表达业务域、用户旅程或质量属性，不使用 `phaseN`、`test2`、`new-test`、`final-test`。
- fixture 账号、附件、标题表达场景：`calendar-owner`、`isolated-user`、`worklog-import.xlsx`。
- Make target 和 npm script 表达能力：`test-integration`、`test-performance`、`test:e2e`、`generate:api`。
- 环境变量表达行为：`RUN_PERFORMANCE_TESTS`；不得使用 `PHASE7_PERFORMANCE` 作为长期运行开关。
- 重命名测试函数后，必须同步 Makefile/CI 的 `-run` 过滤器，并确认命令实际选中预期测试而不是零测试。

## Migration 与生成代码

- Goose migration 使用 `NNNNN_business_subject.sql`；已应用 migration 永不重命名或重编号，只能追加新版本。
- OpenAPI/sqlc 生成代码只能由生成工具更新；不人工调整生成文件路径或文件名。

## 文档

- 正式历史文档的生命周期、版本、UAT、Prompt 和完成报告编号一旦进入审计链即冻结。
- 历史正文中的 Phase 描述可以保留以维护可追溯性；新源码和新测试不应以历史阶段命名。
- 活跃文档引用当前源码路径；历史报告中的旧路径属于当时证据，不应静默改写。
