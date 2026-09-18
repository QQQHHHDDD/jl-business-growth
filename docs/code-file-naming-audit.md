# JL 团队生意成长管理系统：文件命名规范专项审计

## 1. 审计说明与结论摘要

- 审计日期：2026-09-18（Asia/Shanghai）
- 审计范围：`git ls-files` 返回的 226 个受 Git 管理文件，覆盖 `frontend/`、`backend/`、`docs/`、`scripts/`、`deploy/`、`Makefile`、`AGENTS.md`、根目录配置及测试目录。
- 排除范围：`node_modules/`、`dist/`、`build/`、`.git/`、缓存、第三方依赖和其他未受 Git 管理的文件。
- 初始 HEAD：`401e800`
- 初始 `git status --short`：

  ```text
  ?? "docs/42-V1.0最终UAT第三轮第三批修复Prompt-V1.0.md"
  ```

  该文件在审计开始前已经存在且未受 Git 管理；本次未读取为受控仓库样本、未修改，也不计入下述受控文件数量。若以后纳入版本控制，其 UAT/Prompt 序号属于审计追踪编号，应保护。

- 建议重命名文件：**7 个**。
- Phase 命名级遗留项：**29 个**。口径为 5 个非历史文件路径、11 个测试名称、11 个 helper/代码符号、1 个环境变量名和 1 处生产界面文案；引用同一标识符的 Makefile 行不重复计数。另有测试数据/fixture 中的大量 Phase 字面值以及历史说明文字，单独列出，不混入命名级数量。
- 应保护不动的编号文件：**57 个受 Git 管理文件**，即 10 个 Goose migration 与 47 个正式编号文档。
- 未发现文件名为 `temp`、`final-final`、`new`、`old`、`test2` 或同类明显临时命名的受控文件。
- 本次只新增本审计报告；没有执行重命名、引用更新、代码修改、migration/OpenAPI 修改或生成命令。

## A. 当前命名规范概况

### React / TypeScript

- 页面与业务组件主要使用 kebab-case：`calendar-page.tsx`、`account-switcher.tsx`、`route-preload.ts`。
- React 组件导出使用 PascalCase，普通函数使用 camelCase；测试通常与被测文件同目录并采用 `*.test.ts(x)`。
- 业务功能目录基本使用业务域：`auth`、`calendar`、`goals`、`team`、`finance`、`knowledge`、`reviews`、`importexport`。
- 主要偏差是少量测试仍用开发阶段命名（`phase1-auth.spec.ts`、测试标题中的 `Phase 0`/`Phase 1-6`）；`utils.ts` 虽然较宽泛，但属于常见约定且本次不建议仅为美观改名。

### Go

- 包名使用小写业务域；普通文件主要使用 Go 惯例的 snake_case 或固定名：`service.go`、`password_test.go`、`security_headers.go`。
- `cmd/*/main.go`、同包 `main_test.go` 属于 Go 命令约定；`service.go` 在按业务包隔离后职责可由目录名确定。
- 主要偏差集中在 `backend/internal/api/phase45.go`、`phase5.go`、`phase6.go` 与 `phase7_comprehensive_test.go`，文件名表达实现阶段而非业务职责。

### E2E

- Playwright 使用 `frontend/e2e/*.spec.ts`，移动端已有清晰业务/平台语义的 `mobile-shell.spec.ts`。
- `baseline.spec.ts` 含义过宽，其实际职责只是应用壳烟雾检查；`phase1-auth.spec.ts` 已扩展到管理员、账号、日历、目标、团队、财务、导入导出等完整业务链路，当前名称与职责明显不符。
- `frontend/playwright.config.ts` 通过 `*.spec.ts` 自动发现测试，没有按 `phase1-auth.spec.ts` 硬编码；mobile 项目仅对 `mobile-shell.spec.ts` 有明确匹配。

### Integration test

- Go integration test 使用 `*_integration_test.go`，由 Go test 自动发现。
- `main_integration_test.go` 文件名只说明入口包，没有表达其覆盖的 API 业务工作流；内部六个入口仍为 `TestPhase1APIIntegration` 至 `TestPhase6APIIntegration`。
- 综合测试文件及 helper 大量使用 `Phase7`/`phase7`，Makefile 也通过这些测试函数名和环境变量选择执行。

### Migration

- Goose migration 统一为五位递增版本号加业务语义：`00001_extensions.sql` 至 `00010_team_member_node_color.sql`。
- 这是迁移系统的版本协议，不是临时编号。现有命名顺序连续、后缀能说明 schema 主题，未发现技术性命名问题。

### Docs

- 正式文档以两位生命周期/审计序号开头，并以 `Vx.y` 或 Prompt/报告类型结尾。
- 同一序号的不同版本用于保留演进记录；UAT Prompt 与完成报告的序号承担可追溯职责。
- UI 重构资料包中的 `Phase-A`/`Phase-B` 是历史工作包名称。它们不符合新源码命名原则，但属于正式历史材料，不能按源码技术债批量重命名。

### Scripts / Makefile / 配置

- Shell 脚本采用 kebab-case 并按操作命名：`backup-db.sh`、`build-release.sh`、`deploy-prod.sh.example`、`dev.sh`，无需调整。
- Makefile target 采用 kebab-case 且是稳定能力名：`test-integration`、`test-performance`、`generate-openapi`、`migrate-test-status`。没有名为 `phase1` 至 `phase7` 的 target。
- npm scripts 使用工具生态常见的冒号分组：`generate:api`、`test:e2e`、`test:watch`；没有 Phase 命名。
- 未发现受 Git 管理的 `.github/workflows` CI 文件；部署配置使用工具所需的 `.service`、`.timer`、`.conf.example` 后缀，命名清晰。

## B. 建议修改的文件

本节只提出未来改名建议，不执行。建议新文件名遵循“业务职责 > 技术职责 > 历史开发阶段”。

| 当前路径 | 当前文件名 | 存在的问题 | 建议新文件名 | 改名理由 | 影响到的 import / script / Makefile / docs / CI / test 引用 | 风险等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `backend/internal/api/phase45.go` | `phase45.go` | 将两个开发阶段拼成文件名，无法判断文件包含团队、知识、学习、文件与搜索 handler。 | `team_knowledge_files_search.go` | 用实际 API 业务域表达职责；保持单文件，不借改名拆分架构。 | Go 同包编译不依赖文件名；未发现 import、Makefile、脚本、CI 或文档按该文件名引用。 | LOW |
| `backend/internal/api/phase5.go` | `phase5.go` | 只表达实现顺序，无法识别财务与收入模拟职责。 | `finance_income.go` | 与文件中的 finance categories/transactions/budgets/snapshots 和 income simulations 对齐。 | Go 同包编译不依赖文件名；未发现精确路径引用。 | LOW |
| `backend/internal/api/phase6.go` | `phase6.go` | 只表达实现阶段，无法识别导入、导出和账号数据删除职责。 | `import_export_account.go` | 直接表达数据导入导出及账号数据操作职责。 | Go 同包编译不依赖文件名；未发现精确路径引用。 | LOW |
| `frontend/e2e/baseline.spec.ts` | `baseline.spec.ts` | `baseline` 含义宽泛，无法从文件名判断它仅验证应用壳加载。 | `application-shell.spec.ts` | 与唯一测试“应用壳加载”一致。 | Playwright 由 `*.spec.ts` 自动发现；未发现 npm、Makefile、CI 或 docs 精确引用。 | LOW |
| `frontend/e2e/phase1-auth.spec.ts` | `phase1-auth.spec.ts` | 文件已覆盖 Phase 1-6 的完整管理员与核心业务链路，不再只是 Phase 1 或 auth。 | `admin-and-business-workflows.spec.ts` | 用稳定业务范围替代阶段编号，准确反映现有职责。 | Playwright 自动发现；需更新实际引用该路径的 `docs/24-*`、`docs/27-*`、`docs/33-*`、`docs/36-*`、`docs/41-*`、一份 `docs/43-*` 及 `docs/exec-plans/active/v1-implementation.md`。历史报告如需保持当时证据，可保留旧路径并添加“现路径”注记，而非覆写事实。 | MEDIUM |
| `backend/cmd/jl-business-api/main_integration_test.go` | `main_integration_test.go` | `main` 只表示包入口，文件实际承载认证及 Phase 1-6 业务 API 工作流，职责不直观。 | `business_api_integration_test.go` | 表达 PostgreSQL 支撑的业务 API integration gate；不建议借机拆分。 | Go 自动发现；需评估 `docs/33-*`、`docs/36-*` 和 `docs/exec-plans/active/v1-implementation.md` 的路径引用。Makefile 当前引用测试函数名而非文件名。 | LOW |
| `backend/cmd/jl-business-api/phase7_comprehensive_test.go` | `phase7_comprehensive_test.go` | 文件名与内部 helper/test/env 标识符均绑定开发阶段；实际覆盖安全隔离、故障处理和性能。 | `security_fault_performance_integration_test.go` | 直接表述三类验收职责，不依赖阶段编号。 | Go 自动发现；`docs/17-*` 精确引用旧路径。若同步清理 `TestPhase7Performance`/`PHASE7_PERFORMANCE`，还必须更新 Makefile 的 `test-performance` 命令及所有调用环境。 | MEDIUM |

没有建议重命名 migration、生成代码、工具固定文件、正式编号文档或部署 unit 文件。

## C. 建议保留、不应修改的文件

### C.1 Goose migration：10 个

以下版本号决定 Goose 的应用顺序及 `goose_db_version` 对账，必须保持原路径和版本号：

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

结论：不重新编号、不改名；未来 schema 变化只能追加新 migration。

### C.2 正式编号文档：47 个

这些编号表达软件生命周期、资料包顺序、Prompt/报告配对或 UAT 审计链。应保持历史路径；即使同一序号存在多个版本，也不应以“去重”为由覆盖或改名。

根 `docs/` 下 38 个：

```text
docs/00-文档索引.md
docs/01-问题定义-V1.4.md
docs/02-可行性研究-V1.5.md
docs/03-需求分析说明书-V1.4.md
docs/03-需求分析说明书-V1.5.md
docs/04-总体设计说明书-V1.3.md
docs/04-总体设计说明书-V1.4.md
docs/05-详细设计说明书-V1.2.md
docs/05-详细设计说明书-V1.3.md
docs/06-收入模拟器公式映射-V1.0.md
docs/07-Codex开发与云端发布工作流-V1.1.md
docs/07-Codex开发与云端发布工作流-V1.2.md
docs/08-Codex主开发Prompt-V1.1.md
docs/08-Codex主开发Prompt-V1.2.md
docs/09-AGENTS.md-建议模板-V1.1.md
docs/09-AGENTS.md-建议模板-V1.2.md
docs/10-Codex启动指南-V1.0.md
docs/11-开发实现差异与V1收口清单-V1.0.md
docs/12-Codex-V1收口修复Prompt-V1.0.md
docs/13-综合测试计划-V1.0.md
docs/14-综合测试用例-V1.0.md
docs/15-Codex第7阶段综合测试Prompt-V1.0.md
docs/16-UAT人工验收清单-V1.0.md
docs/17-第7阶段综合测试报告-V1.0.md
docs/24-UI重构-Phase-B-完成报告.md
docs/27-UI重构-最终完成报告.md
docs/29-V1.0最终收尾与增强合并修改说明-V1.0.md
docs/30-V1.0最终收尾完成报告.md
docs/32-V1.0最终UAT第一轮问题修复Prompt-V1.0.md
docs/33-V1.0最终UAT第一轮修复完成报告.md
docs/35-V1.0最终UAT第二轮问题修复Prompt-V1.0.md
docs/36-V1.0最终UAT第二轮修复完成报告.md
docs/38-V1.0最终UAT第三轮第一批修复Prompt-V1.0.md
docs/39-V1.0最终UAT第三轮第一批修复完成报告-V1.0.md
docs/40-V1.0最终UAT第三轮第二批修复Prompt-V1.0.md
docs/41-V1.0最终UAT第三轮第二批修复完成报告-V1.0.md
docs/43-V1.0最终UAT第三轮第三批修复完成报告-V1.0.md
docs/43-V1.0最终UAT第三轮第四批修复完成报告-V1.0.md
```

三个 UI 重构资料包中的 9 个：

```text
docs/JL团队生意成长管理系统-UI重构-PhaseA资料包/18-V1-UIUX信息架构重构设计-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseA资料包/19-Codex-UI重构-Phase-A-Prompt-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseA资料包/20-UI重构-Phase-A-验收清单-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseB资料包/21-UI重构-Phase-B-设计说明-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseB资料包/22-Codex-UI重构-Phase-B-Prompt-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseB资料包/23-UI重构-Phase-B-验收清单-V1.0.md
docs/JL团队生意成长管理系统-UI重构-最终阶段资料包/25-UI重构-剩余页面与全局收尾设计-V1.0.md
docs/JL团队生意成长管理系统-UI重构-最终阶段资料包/26-Codex-UI重构-剩余页面与最终收尾-Prompt-V1.0.md
docs/JL团队生意成长管理系统-UI重构-最终阶段资料包/28-UI重构-最终人工验收清单-V1.0.md
```

保护编号文件总数为 `10 + 47 = 57`。未受 Git 管理的 `docs/42-*` 不进入该统计。

### C.3 生成代码与生成源

以下生成代码应通过对应工具重建，不能人工改名：

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

对应生成输入/配置 `backend/openapi/openapi.yaml`、`backend/oapi-codegen.yaml`、`backend/sqlc.yaml` 也遵循工具约定；本次未建议改名。

### C.4 工具要求或生态惯例固定名

- Go：`go.mod`、`go.sum`、命令入口 `main.go`、测试后缀 `*_test.go`。
- Node/Vite/TypeScript：`package.json`、`package-lock.json`、`vite.config.ts`、`playwright.config.ts`、`tsconfig*.json`、`index.html`。
- 仓库入口：`README.md`、`AGENTS.md`、`Makefile`、`.gitignore`、`.env.example`。
- systemd/nginx：`*.service`、`*.timer`、`*.conf.example`，文件名与部署 unit/config 引用一致。

### C.5 数字具有实际语义的其他名称

- 文档中的 `V1.0`、`V1.1` 等是文档版本，不是临时实现顺序。
- `v1-implementation.md` 中的 `v1` 是产品版本语义；文件本身不建议改名。
- migration 的五位数字是系统版本键；UAT 的“第一轮/第二轮/第三轮”和“批次”是审计批次。
- `phase7` 出现在历史第 7 阶段测试报告时属于历史里程碑；源码和可执行测试标识符中的同名则属于待清理项，两者必须区别处理。

## D. 所有 `phase` 遗留项

### D.1 统计口径

全仓使用大小写不敏感表达式搜索 `phase`、`phase1`、`phase 1`、`phase-1`、`phase_1` 及其他数字/字母阶段写法。结果分为：

1. **命名级遗留项 29 个**：未来可按命名专项处理。
2. **测试 fixture/字面值**：仍暴露阶段词，但不是独立文件/符号名；按文件与命中数盘点。
3. **历史或状态说明**：用于审计/里程碑叙述，单独保护，不计入 29 个。

受控非 `docs/` 文件共有 235 个 Phase 内容命中。其中 `AGENTS.md`、根 `README.md`、`deploy/README.md` 共 6 个是项目阶段说明；其余 229 个位于配置、Makefile、测试或仍会显示的页面文案。另有 3 个仅文件名含 Phase 而正文不含 Phase 的 API 文件。

### D.2 文件名与目录名

非历史路径中的 5 个文件名遗留：

```text
backend/internal/api/phase45.go
backend/internal/api/phase5.go
backend/internal/api/phase6.go
backend/cmd/jl-business-api/phase7_comprehensive_test.go
frontend/e2e/phase1-auth.spec.ts
```

- 非历史目录名遗留：0。
- 历史资料路径中另有 7 个路径含 Phase：`docs/24-UI重构-Phase-B-完成报告.md`，以及 `PhaseA资料包`/`PhaseB资料包` 下的 `18` 至 `23` 六个文件。它们属于历史项目资料，保护不改。

### D.3 npm script 与 Makefile target / command

- npm script：0 个 Phase 命名；现有 `dev`、`build`、`lint`、`test`、`test:e2e`、`generate:api` 均为能力语义。
- Makefile target：0 个 Phase 命名；`test-integration` 与 `test-performance` 应保留。
- Makefile 命令内有 3 处命名引用：

  ```text
  TestPhase[123456]APIIntegration
  PHASE7_PERFORMANCE
  TestPhase7Performance
  ```

  前两类测试函数和环境变量已在下方命名项中计数，Makefile 引用不重复计数。未来改名必须原子更新 Makefile，否则测试门禁会失效。

### D.4 测试名称：11 个

```text
frontend/e2e/baseline.spec.ts
  loads the Phase 0 application shell

frontend/e2e/phase1-auth.spec.ts
  covers the Phase 1 administrator flow and Phase 2-6 core loops

backend/cmd/jl-business-api/main_integration_test.go
  TestPhase1APIIntegration
  TestPhase2APIIntegration
  TestPhase3APIIntegration
  TestPhase4APIIntegration
  TestPhase5APIIntegration
  TestPhase6APIIntegration

backend/cmd/jl-business-api/phase7_comprehensive_test.go
  TestPhase7SecurityIntegration
  TestPhase7FaultHandling
  TestPhase7Performance
```

建议语义方向分别为 application shell、administrator/account lifecycle、daily/goals、calendar/reviews、team/knowledge/files/search、finance/income、import/export/account deletion、security isolation、fault handling、performance；本轮不实施。

### D.5 helper / 代码符号：11 个

```text
backend/cmd/jl-business-api/main_integration_test.go
  phase3Tables

backend/cmd/jl-business-api/phase7_comprehensive_test.go
  phase7Harness
  newPhase7Harness
  phase7SuperAdmin
  phase7Invitation
  phase7Register
  phase7FailingSender
  phase7UploadFile
  phase7LoadUser
  phase7RequestResult
  phase7Request
```

未来可用 `integrationTablesReady`、`comprehensiveTestHarness`、`createTestInvitation`、`registerTestUser`、`failingSender`、`loadUser`、`requestResult` 等职责名替换；具体名称应在实施批次结合调用上下文一次确定。

### D.6 环境变量名与生产界面文字：2 个

- 环境变量：`PHASE7_PERFORMANCE`（1 个）。建议未来改为 `RUN_PERFORMANCE_TESTS`，并同步 Makefile、测试代码及运行文档。
- 生产界面文案：`frontend/src/features/placeholder/placeholder-page.tsx` 中“后续 Phase 开放”（1 处）。这不是文件名问题，但属于面向用户暴露开发阶段概念，未来应换成产品状态语言；本轮不改。

上述 5 个文件名 + 11 个测试名 + 11 个 helper/符号 + 1 个环境变量 + 1 处界面文案 = **29 个命名级 Phase 遗留项**。

### D.7 fixture、测试数据和配置字面值

这些字面值不另外计入 29 个命名级项，但未来执行 Batch B/C 时应随对应测试整体替换，避免只改入口名称留下阶段化账号、文件名或提示：

| 路径 | Phase 内容命中数 | 类型与处理建议 |
| --- | ---: | --- |
| `.env.example` | 1 | `replace-before-phase-1` 是示例密码值；可换成与首次启动相关的中性占位符，变量名本身无需改。 |
| `Makefile` | 3 | 测试函数正则与性能环境变量引用；必须与测试标识符同步。 |
| `backend/cmd/jl-business-api/main_integration_test.go` | 130 | 测试函数、`phase3Tables`、账号/密码、邀请码、标题、附件名、断言/错误消息等；按 auth/calendar/team/finance/import-export 业务 fixture 成组命名。 |
| `backend/cmd/jl-business-api/phase7_comprehensive_test.go` | 87 | helper/type/test/env 名，以及账号、附件、搜索词、错误消息；按 security/fault/performance 语义成组命名。 |
| `frontend/e2e/baseline.spec.ts` | 1 | 测试标题。 |
| `frontend/e2e/phase1-auth.spec.ts` | 6 | 测试标题、测试密码与导入文件名；用 admin/user/import 等语义。 |
| `frontend/src/features/placeholder/placeholder-page.tsx` | 1 | 用户可见阶段文案。 |

### D.8 历史正文与项目状态叙述：单独保留

- `AGENTS.md` 2 处、根 `README.md` 2 处、`deploy/README.md` 2 处描述 Phase 0-7 的项目状态/发布边界，不是文件命名。进入正式发布时可由发布流程核对是否仍准确，但本次不改。
- 共有 31 个受控 `docs/` 文件正文含 Phase。它们是架构、实施计划、Prompt、验收清单或完成报告的历史描述，不属于必须清理项：

```text
docs/00-文档索引.md
docs/04-总体设计说明书-V1.4.md
docs/05-详细设计说明书-V1.3.md
docs/07-Codex开发与云端发布工作流-V1.2.md
docs/08-Codex主开发Prompt-V1.1.md
docs/08-Codex主开发Prompt-V1.2.md
docs/09-AGENTS.md-建议模板-V1.2.md
docs/10-Codex启动指南-V1.0.md
docs/11-开发实现差异与V1收口清单-V1.0.md
docs/12-Codex-V1收口修复Prompt-V1.0.md
docs/13-综合测试计划-V1.0.md
docs/15-Codex第7阶段综合测试Prompt-V1.0.md
docs/17-第7阶段综合测试报告-V1.0.md
docs/24-UI重构-Phase-B-完成报告.md
docs/27-UI重构-最终完成报告.md
docs/30-V1.0最终收尾完成报告.md
docs/33-V1.0最终UAT第一轮修复完成报告.md
docs/36-V1.0最终UAT第二轮修复完成报告.md
docs/39-V1.0最终UAT第三轮第一批修复完成报告-V1.0.md
docs/41-V1.0最终UAT第三轮第二批修复完成报告-V1.0.md
docs/43-V1.0最终UAT第三轮第三批修复完成报告-V1.0.md
docs/43-V1.0最终UAT第三轮第四批修复完成报告-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseA资料包/18-V1-UIUX信息架构重构设计-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseA资料包/19-Codex-UI重构-Phase-A-Prompt-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseA资料包/20-UI重构-Phase-A-验收清单-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseB资料包/21-UI重构-Phase-B-设计说明-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseB资料包/22-Codex-UI重构-Phase-B-Prompt-V1.0.md
docs/JL团队生意成长管理系统-UI重构-PhaseB资料包/23-UI重构-Phase-B-验收清单-V1.0.md
docs/JL团队生意成长管理系统-UI重构-最终阶段资料包/25-UI重构-剩余页面与全局收尾设计-V1.0.md
docs/JL团队生意成长管理系统-UI重构-最终阶段资料包/26-Codex-UI重构-剩余页面与最终收尾-Prompt-V1.0.md
docs/exec-plans/active/v1-implementation.md
```

## E. 推荐的项目正式命名规范

总原则：**业务职责 > 技术职责 > 历史开发阶段**。

### E.1 通用规则

1. 名称应让不了解开发时间线的人判断职责；禁止以 `phaseN`、实现批次、个人临时序号作为长期名称。
2. 只在编号有协议或审计意义时保留：migration 版本、正式文档序号、产品版本、UAT 批次。
3. 避免 `new`、`old`、`temp`、`final-final`、`test2`、`misc`、`common2`；用状态、业务域或职责命名。
4. 重命名必须与 import、脚本、Makefile、CI、测试筛选器和活跃文档引用在同一批完成；历史报告不得静默改写当时证据。

### E.2 React / TypeScript

- 文件/目录：kebab-case；React 页面使用 `<domain>-page.tsx`，组件使用名词或能力名，如 `account-switcher.tsx`。
- 单元测试：与源文件同名加 `.test.ts(x)`。
- helper：按单一职责命名，如 `route-preload.ts`、`timezones.ts`；仅在真正跨域且边界明确时使用 `utils.ts`。
- 生成文件保持生成器名称，例如 `openapi.gen.ts`。

### E.3 Go

- 包目录用小写业务域，文件用 snake_case 和业务主题，如 `finance_income.go`、`security_headers.go`。
- 包内 `service.go`/`handler.go` 可在目录已给出充分语义时保留；跨多个业务域的文件名应列出主要职责。
- 测试使用 `<subject>_test.go` 或 `<workflow>_integration_test.go`；函数用 `Test<BusinessBehavior>`，不使用 `TestPhaseN...`。
- `cmd/*/main.go`、生成代码名与 migration 名按工具约定保留。

### E.4 E2E / integration / fixture

- E2E 文件按用户旅程：`auth.spec.ts`、`calendar.spec.ts`、`mobile-navigation.spec.ts`、`account-switching.spec.ts`、`import-export.spec.ts`。
- 跨域验收可用 `admin-and-business-workflows.spec.ts`，但不要用 `phase1-auth.spec.ts` 表示后来不断扩大的范围。
- Integration test 按 API 业务流或质量属性：`business_api_integration_test.go`、`security_integration_test.go`、`performance_test.go`。
- fixture 账号、附件、标题应体现场景：`calendar-owner`、`isolated-user`、`worklog-import.xlsx`，不使用 `phase6-user`。

### E.5 Docs / scripts / commands

- 正式文档允许 `<序号>-<主题>-<版本>.md`，序号一旦进入审计链即冻结。
- 新的非历史说明文档优先使用主题名，不为了“排版整齐”增加无意义前缀。
- 脚本用动词-对象 kebab-case：`backup-db.sh`、`build-release.sh`。
- Make/npm 命令按能力命名：`test-integration`、`test-performance`、`test:e2e`；运行开关按行为命名，如 `RUN_PERFORMANCE_TESTS`。

## F. 推荐执行顺序

### Batch A：纯源码 / 组件 / 普通测试文件

1. `backend/internal/api/phase45.go` → `team_knowledge_files_search.go`
2. `backend/internal/api/phase5.go` → `finance_income.go`
3. `backend/internal/api/phase6.go` → `import_export_account.go`
4. 如单独安排普通测试标题清理，可将 `baseline.spec.ts` 与其标题改为 application shell 语义；由于它属于 E2E，也可统一放入 Batch B。

验证重点：`gofmt` 不应产生内容变化；`go test ./...`、前端 lint/typecheck 不应因纯文件改名变化。

### Batch B：E2E 与 integration test

1. `baseline.spec.ts` → `application-shell.spec.ts`。
2. `phase1-auth.spec.ts` → `admin-and-business-workflows.spec.ts`，同步标题与 fixture。
3. `main_integration_test.go` → `business_api_integration_test.go`，将六个 Phase 测试入口及 `phase3Tables` 改为业务语义。
4. `phase7_comprehensive_test.go` → `security_fault_performance_integration_test.go`，同步 helper/type/test 名和 fixture。

验证重点：先列出 Playwright 测试，再运行 E2E；运行所有 Go integration/security/fault 测试，确认没有因筛选器改名漏跑。

### Batch C：scripts / Makefile / 测试命令

1. 在 Batch B 测试名确定后更新 Makefile `-run` 正则。
2. `PHASE7_PERFORMANCE` → `RUN_PERFORMANCE_TESTS`，同步测试代码和所有运行说明。
3. 处理 `.env.example` 的阶段化示例值和 placeholder 页面用户文案。
4. npm scripts 与 Make target 当前无阶段命名，不为统一形式做无收益改名。

验证重点：确认 `make test-integration` 和 `make test-performance` 仍实际选中预期测试，而不是“命令成功但零测试执行”。

### Batch D：文档整理

1. 只更新活跃索引/实施计划中的“现路径”；历史完成报告保留原证据路径，必要时追加迁移映射。
2. 不批量替换历史正文中的 Phase 叙述，不改 UAT/Prompt/报告序号。
3. 正式发布时另行核对 `README.md`、`AGENTS.md`、`deploy/README.md` 的阶段状态是否仍然准确；这属于发布状态维护，不是文件命名重构。

### Protected

- 10 个 Goose migration：永久保护版本号和文件名。
- 47 个正式编号文档：保护生命周期、版本和审计链。
- 9 个生成代码文件：只能通过 OpenAPI/sqlc 生成器更新。
- 工具固定文件、Go `main.go`、生态配置名、systemd/nginx unit/config：保持不动。

## 审计边界确认

本报告不建议借重命名拆分大型测试、移动包、重构 handler/service/repository、改变架构或业务逻辑。未来若获批准实施，改动范围只应包含文件/符号命名及其必然引用更新，并按上述批次逐批验证。
