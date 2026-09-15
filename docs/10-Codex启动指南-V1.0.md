# JL团队生意成长管理系统——Codex 启动指南 V1.0

## 1. 推荐工作方式

采用“阶段闸门”方式开发：

1. Phase 0 工程基线
2. 人工检查并确认
3. Phase 1 身份、管理员、邀请码
4. 人工检查并确认
5. 依次推进后续 Phase

不要第一次就让 Codex 无人监督地连续完成所有 Phase。每个 Phase 完成后先运行完整检查、查看页面和 Git diff，再进入下一阶段。

## 2. 在内网 Ubuntu 创建项目目录

```bash
mkdir -p ~/projects/jl-business-growth/docs
cd ~/projects/jl-business-growth
git init
```

把设计文档压缩包上传到内网服务器，例如：

```bash
scp "JL团队生意成长管理系统-进入第6阶段.zip" <用户名>@<内网服务器IP>:~/
```

然后在服务器解压并复制文档：

```bash
rm -rf /tmp/jl-business-docs
mkdir -p /tmp/jl-business-docs
unzip ~/JL团队生意成长管理系统-进入第6阶段.zip -d /tmp/jl-business-docs
cp /tmp/jl-business-docs/JL团队生意成长管理系统-设计文档/*.md ~/projects/jl-business-growth/docs/
cp ~/projects/jl-business-growth/docs/09-AGENTS.md-建议模板-V1.1.md ~/projects/jl-business-growth/AGENTS.md
cd ~/projects/jl-business-growth
```

确认：

```bash
find . -maxdepth 2 -type f | sort
```

至少应看到：

```text
AGENTS.md
docs/00-文档索引.md
...
docs/08-Codex主开发Prompt-V1.1.md
docs/09-AGENTS.md-建议模板-V1.1.md
```

## 3. 启动 Codex 前先做最少检查

```bash
pwd
git status
git --version
go version || true
node --version || true
npm --version || true
psql --version || true
```

缺少系统级依赖不需要你现在自行猜版本安装。让 Codex 根据设计文档检测并给出需要执行的安装命令。

## 4. 第一次对 Codex 说什么

在 `~/projects/jl-business-growth` 根目录启动 Codex 后，发送：

```text
请把仓库中的 docs/08-Codex主开发Prompt-V1.1.md 作为本项目的主开发任务，并先完整阅读根目录 AGENTS.md、docs/00-文档索引.md 以及 docs/ 下全部当前生效设计文档。

严格遵守这些文档，不重新讨论已经确认的产品需求，不擅自改变技术栈或业务规则。

本次先只执行 Phase 0：工程基线。先完成环境检测和实施计划，再实际创建项目骨架、配置开发环境、健康检查、数据库连接、OpenAPI/sqlc/Goose 基线以及前后端构建测试。

如果缺少需要 sudo 安装的系统级依赖，不要擅自执行高风险系统修改，列出准确命令和原因让我确认；项目级 npm/Go 依赖可以自行安装。

Phase 0 完成后必须运行文档要求的测试和 build，修复到通过，然后停止继续开发 Phase 1，向我报告：
1. 完成了什么；
2. 修改/创建了哪些关键文件；
3. 执行了哪些命令和测试；
4. 测试结果；
5. 当前如何在局域网打开系统；
6. 是否存在阻塞、警告或待我决定的问题；
7. git status 和建议的 commit。

现在开始。
```

## 5. 如果 Codex 告诉你缺少系统依赖

先不要让它绕过。

检查它给出的命令是否只是在安装项目需要的：

- Go
- Node/npm
- PostgreSQL
- Git
- 编译基础工具

确认后由你在 Ubuntu 执行需要 `sudo` 的命令。

执行完成后回到 Codex：

```text
系统级依赖已经按你给出的命令安装完成。请重新检测环境，从 Phase 0 未完成的位置继续。仍然只完成 Phase 0，完成并验证后停下报告。
```

## 6. Phase 0 完成后你自己检查什么

首先查看 Codex 报告，并执行：

```bash
cd ~/projects/jl-business-growth
git status
make check
```

如果项目已经可以运行，按 Codex/README 给出的开发启动命令启动。

局域网浏览器目标地址应类似：

```text
http://<内网Ubuntu服务器IP>:5173
```

检查至少：

- 页面能够打开；
- `/api` 代理正常；
- `/api/health/live` 正常；
- `/api/health/ready` 正常；
- 前端 build 成功；
- 后端测试成功；
- 没有使用生产数据库、生产 SMTP 或生产密钥；
- `.env`、`.local/` 等没有被提交到 Git。

## 7. 确认 Phase 0 后进入 Phase 1

对 Codex 发送：

```text
Phase 0 我已经验收通过。现在执行 docs/08-Codex主开发Prompt-V1.1.md 中的 Phase 1：身份、管理员、邀请码。

严格以现有设计文档为准。本次只完成 Phase 1，不提前实现 Phase 2。

先更新执行计划，然后实现并完成该阶段要求的单元测试、集成测试和必要 E2E。重点验证普通用户数据隔离、管理员无法读取业务数据、固定超级管理员、邀请码、Session/CSRF、密码修改/管理员重置密码以及快速账号切换。

全部测试通过后停止，向我报告完成内容、测试结果、局域网人工验收步骤、git status 和建议 commit，不要自动进入 Phase 2。
```

后续 Phase 2～6 使用同样模式：

> 验收上一个 Phase → 明确只允许执行下一个 Phase → 自动测试 → 人工浏览器验收 → Git commit → 再继续。

## 8. 推荐 Git 节奏

第一次正式 commit 可以在 Phase 0 验收后：

```bash
git add .
git status
git commit -m "chore: establish project baseline"
```

后续建议每个 Phase 至少一个独立 commit。

不要提交：

- `.env`
- `.local/`
- 数据库 dump
- 用户上传文件
- 密码或密钥
- 生产配置真实值

## 9. 开发环境与生产环境边界

Codex 日常只接触：

- `jl_business_dev`
- `jl_business_test`
- `.local/files`
- `.local/mail-outbox`

不要给 Codex：

- 云服务器生产 SSH 私钥；
- 生产 PostgreSQL 密码；
- 正式 SMTP 密码；
- 正式用户数据。

生产部署等内网版本完整验收后再进行。

## 10. 什么时候再部署云端

至少满足：

- Phase 0～6 全部完成；
- `make check` 全绿；
- 关键 E2E 全绿；
- 收入模拟 Golden Test 与 Excel 预期一致；
- 你已经在局域网完成主要流程人工验收；
- 数据备份/恢复、发布/回滚脚本经过测试。

然后再按照 `docs/07-Codex开发与云端发布工作流-V1.1.md` 部署生产服务器和绑定域名。
