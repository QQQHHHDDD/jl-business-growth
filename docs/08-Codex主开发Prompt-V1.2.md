# JL团队生意成长管理系统 V1——Codex 主开发 Prompt

> **状态说明（2026-09-15）**：Phase 0–6 主体开发已完成。本文件继续作为原始开发基线，不应再次从 Phase 0 重跑。当前下一步以 `11-开发实现差异与V1收口清单-V1.0.md` 和 `12-Codex-V1收口修复Prompt-V1.0.md` 为准；收口后进入第7阶段综合测试。

> 用法：把本文件与 `docs/` 设计文档一起放到项目仓库中，然后在 Ubuntu 内网开发服务器的项目根目录启动 Codex，将“从下面的任务开始执行”之后的内容作为主任务提交给 Codex。

---

## 你的角色

你是“JL团队生意成长管理系统”项目的主实现工程师。你的目标不是制作演示原型，而是按照仓库中的正式设计文档，实现一个可以长期维护、可以在内网完成测试、随后部署到 Ubuntu 云服务器生产运行的 V1。

项目名称：**JL团队生意成长管理系统**  

## 首要规则

1. 先阅读仓库根目录 `AGENTS.md`（如果不存在，先按本 Prompt 创建一个简短版本）。
2. 再阅读 `docs/` 中所有当前生效设计文档，尤其：
   - 问题定义；
   - 可行性研究；
   - 需求分析；
   - 总体设计；
   - 详细设计；
   - 收入模拟器公式映射；
   - Codex 开发与云端发布工作流。
3. 这些文档是业务需求和技术约束的事实来源。不要自行改变已经明确的业务规则。
4. 如果文档之间存在冲突，以**版本号更高、阶段更靠后、修改日期更新**的文档为准，并在实施计划中记录冲突。
5. 不使用 Docker、Kubernetes、Redis、Elasticsearch、消息队列或微服务。
6. 不把项目改造成 CRM，不记录候选人个人对话流程。
7. 不加入 AI 功能。
8. 不上传音频、视频或 DOCX。
9. PDF/TXT/Markdown/图片只保存原文件并网页预览，不解析附件正文，不做 OCR。
10. 管理员绝不能通过管理员端读取普通用户业务数据。

## 工作环境

开发环境是 Ubuntu 内网服务器。

开发流程：

```text
Codex 在内网 Ubuntu Git 工作区开发
→ 本机运行前后端
→ 局域网浏览器测试
→ 自动化测试
→ 生产构建
→ 人工确认
→ 再部署云服务器
```

不要假设你拥有生产服务器权限。

### 安全边界

- 不请求或读取生产 SSH 私钥；
- 不请求生产数据库密码；
- 不请求正式 SMTP 密码；
- 不直接操作生产服务器；
- 不修改工作区之外的系统文件，除非用户明确批准；
- 如果缺少 PostgreSQL、Go、Node 等系统级依赖，先检测并列出需要用户执行的安装命令，不要擅自执行高风险 `sudo`；
- 项目级依赖可以正常通过 npm / Go modules 安装。

## 技术栈

前端：

- React 19；
- TypeScript；
- Vite；
- Tailwind CSS；
- shadcn/ui；
- TanStack Query；
- React Router 或详细设计已锁定的路由方案；
- FullCalendar；
- React Flow；
- Apache ECharts；
- Vitest；
- React Testing Library；
- Playwright。

后端：

- Go 1.27+；
- Echo；
- OpenAPI 3；
- oapi-codegen；
- pgx；
- sqlc；
- Goose migration；
- Go testing。

数据库：PostgreSQL。  
搜索：PostgreSQL `pg_trgm`。  
生产：Nginx + systemd。  
包管理：前端优先使用 npm 并提交 `package-lock.json`。

## 本地开发拓扑

前端开发服务：

```text
0.0.0.0:5173
```

后端：

```text
127.0.0.1:8080
```

Vite 必须代理：

```text
/api/* → http://127.0.0.1:8080
```

从局域网浏览器访问：

```text
http://<LAN-IP>:5173
```

浏览器仍然使用同源 `/api/*`，不要为了开发方便开启 `Access-Control-Allow-Origin: *`。

开发数据库：

```text
jl_business_dev
```

测试数据库：

```text
jl_business_test
```

开发文件：

```text
.local/files
```

开发邮件：

```text
MAIL_MODE=file
.local/mail-outbox
```

开发环境默认不得真实向外发送邀请邮件。

## 仓库结构

使用详细设计中规定的结构，并统一项目 slug 为：

```text
jl-business-growth
```

根目录至少具备：

```text
jl-business-growth/
├── AGENTS.md
├── Makefile
├── frontend/
├── backend/
├── deploy/
├── scripts/
├── docs/
├── .env.example
└── README.md
```

不要创建 `utils` 大杂烩。

## AGENTS.md 要求

如果仓库还没有 `AGENTS.md`，创建一个约 80–150 行以内的简短文件。

它只负责：

- 项目简介；
- 架构原则；
- 禁止事项；
- 常用命令；
- 环境说明；
- 指向 `docs/` 的链接；
- 当前实施计划链接。

不要把整份需求说明书复制进去。

## 执行计划

在真正大规模编码前，创建：

```text
docs/exec-plans/active/v1-implementation.md
```

包含：

- 当前环境检测；
- 分阶段任务；
- 数据库 migration 顺序；
- API 顺序；
- 测试策略；
- 已完成项；
- 阻塞项。

然后开始执行，不要只停留在写计划。

## 实施顺序

严格按以下优先级推进。

### Phase 0：工程基线

完成：

- Git 仓库基础检查；
- `AGENTS.md`；
- README；
- Makefile；
- 前端初始化；
- 后端初始化；
- `.env.example`；
- 配置加载；
- PostgreSQL 连接；
- Goose；
- sqlc；
- OpenAPI；
- oapi-codegen；
- Vite `/api` proxy；
- `/api/health/live`；
- `/api/health/ready`；
- 基础 CI 风格本地检查命令。

完成后运行测试和 build，并形成一个清晰 Git commit。

### Phase 1：身份、管理员、邀请码

实现：

- USER / ADMIN / SUPER_ADMIN；
- 固定超级管理员初始化；
- Argon2id 密码；
- 邀请码注册；
- 登录、退出、修改密码；
- 管理员重置用户密码；
- 用户禁用/恢复/删除；
- 超级管理员 CRUD 普通管理员；
- Session；
- CSRF；
- 同浏览器多普通账号快速切换；
- 用户时区设置；
- 严格后端数据隔离。

重点安全测试必须在这一阶段完成。

### Phase 2：每日核心闭环

实现：

- 每日工作量；
- 营业额；
- 1 PV = 12.5 元；
- 首页基础 Dashboard；
- 梦想；
- 目标；
- 目标父子关系；
- 量化目标自动进度；
- 目标 React Flow 可视化。

确保营业额只有一个事实源，不重复存冲突数据。

### Phase 3：日历与复盘

实现：

- 日/周/月日历；
- 单次日程；
- 重复日程；
- “仅此一次 / 此次及以后 / 整个系列”修改；
- ICS 邀请；
- `MAIL_MODE=file`；
- SMTP adapter；
- 每日/每周/每月复盘；
- Analytics 基础聚合。

开发环境验证 `.eml` / `.ics`，不要实际群发邮件。

### Phase 4：团队、学习、文件、搜索

实现：

- 团队树；
- 月末快照；
- 手动快照；
- React Flow 团队可视化；
- 学习项目；
- 学习 Session 与每日读书/音频分钟的单一事实源；
- PDF/TXT/Markdown/JPG/PNG/WebP 上传；
- 网页预览；
- 不解析附件正文；
- PostgreSQL 模糊搜索。

### Phase 5：财务与收入模拟

实现：

- 财务流水；
- 预算；
- 现金流；
- 储蓄/应急资金；
- 收入模拟方案；
- 方案复制/比较；
- 双年奖金；
- Excel 兼容计算引擎。

收入模拟必须依据 `收入模拟器公式映射` 实现，不自行“纠正” Excel。

必须建立 Golden Test：

```text
Go 计算结果 == 固化的 Excel 预期结果
```

阈值边界都要测试。

### Phase 6：导入导出与数据治理

实现：

- 工作量模板；
- 营业额模板；
- 财务模板；
- 团队模板；
- 下载模板 → 上传 → 校验 → 预览 → 确认导入；
- CSV/XLSX 导出；
- Markdown/JSON 导出；
- 完整账户 ZIP 导出；
- 删除账户；
- 文件清理；
- 备份和发布脚本模板。

## API 与数据库原则

1. `backend/openapi/openapi.yaml` 是 HTTP 合约唯一来源。
2. 修改接口先改 OpenAPI，再生成类型，再实现。
3. 所有 schema 修改使用 Goose migration。
4. 已进入生产的 migration 永远不改历史，只新增。
5. SQL 查询优先明确写 SQL，通过 sqlc 生成类型安全代码。
6. 所有普通用户业务表必须具备 `user_id` 或等价明确所有权链。
7. 权限不能依赖前端隐藏。
8. 管理员路由不得提供通用 user_id 读取业务数据接口。

## UI 原则

这不是内部粗糙管理后台。

界面应：

- 简洁；
- 现代；
- 有呼吸感；
- 数据层级清楚；
- 桌面优先同时手机可用；
- 目标树、团队树、Dashboard 图表重点做好视觉质量；
- 不使用花哨但低信息密度的装饰；
- 高频“每日工作量”录入应尽可能在约 1 分钟内完成。

系统正式名称统一显示为：

```text
JL团队生意成长管理系统
```

## 测试纪律

每个 Phase：

1. 实现前先补关键测试或明确测试案例；
2. 实现后运行相关单测；
3. Phase 完成运行完整 `make check`；
4. 不通过测试不要宣称完成；
5. 不删除失败测试来“修复”构建；
6. E2E 至少覆盖：注册、登录、工作量、目标、日历、收入模拟、管理员。

## Git 纪律

- 不强制创建复杂分支；
- 不 force push；
- 每个可验证 Phase 至少一个语义清晰 commit；
- 不提交 `.env`、`.local`、数据库 dump、用户上传文件、密钥；
- 完成任务后确保 `git status` 清楚，并报告未提交内容。

## 生产构建与发布准备

不要直接部署生产，但必须准备：

```text
deploy/nginx/
deploy/systemd/
scripts/build-release.sh
scripts/deploy-prod.sh.example
scripts/backup-db.sh
```

生产目标：

```text
Nginx
├── / → React dist
└── /api/* → 127.0.0.1:8080
```

systemd：

```text
jl-business-api.service
jl-business-jobs.timer
jl-business-backup.timer
```

生产配置：

```text
/etc/jl-business-growth/jl-business-growth.env
```

发布目录：

```text
/opt/jl-business-growth/releases/<version>/
/var/www/jl-business-growth/releases/<version>/
```

采用 `current` 软链接原子切换。

## 开始任务前的第一步

现在开始执行以下动作：

1. 输出你检测到的 Ubuntu、CPU 架构、Go、Node/npm、PostgreSQL、Git 版本；
2. 检查当前目录、Git 状态和现有文件；
3. 阅读所有设计文档；
4. 列出文档间可能冲突或环境缺失项；
5. 如果只是项目级依赖缺失，直接处理；如果需要系统级 `sudo` 安装，明确告诉用户所需命令；
6. 创建/更新 `AGENTS.md`；
7. 创建 `docs/exec-plans/active/v1-implementation.md`；
8. 立即开始 Phase 0；
9. 完成 Phase 0 后运行测试和 build，修复至通过；
10. 向用户报告：完成内容、执行过的测试、仍存在的阻塞，然后继续后续 Phase，除非确实需要用户提供系统级权限或外部凭据。

不要重新讨论已经在设计文档中确定的产品需求；优先实现、测试并留下可验证结果。
