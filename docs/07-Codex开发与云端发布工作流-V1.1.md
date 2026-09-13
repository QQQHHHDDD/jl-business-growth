# JL团队生意成长管理系统——Codex 开发与云端发布工作流 V1.1

- 状态：已确认
- 日期：2026-09-13
- 适用阶段：第6阶段 编码与单元测试，以及后续发布维护

## 1. 总原则

项目采用：

> **内网 Ubuntu 开发/验收 + 云服务器生产运行**

Codex 只负责内网 Git 工作区中的开发、测试、构建和生成部署产物；生产服务器不是 Codex 的日常开发环境。

## 2. 环境划分

| 环境 | 用途 | 数据库 | 文件 | 邮件 |
|---|---|---|---|---|
| development | Codex 日常开发、人工联调 | `jl_business_dev` | `.local/files` | file outbox |
| test | 自动化测试/E2E | `jl_business_test` | 临时目录 | file outbox |
| production | 正式用户访问 | 独立生产库 | `/var/lib/jl-business-growth/files` | SMTP |

三套环境绝不共用密钥和业务数据。

## 3. Codex 安全边界

Codex 可以：

- 读写项目工作区；
- 安装项目级 npm/Go 依赖；
- 执行代码生成；
- 执行 migration 到 dev/test 数据库；
- 运行测试、lint、build；
- 创建 `deploy/` 配置模板和发布脚本。

Codex 不应自动：

- 登录生产服务器；
- 读取生产数据库；
- 获取生产 SSH 私钥；
- 获取正式 SMTP 密码；
- 修改 `/etc/nginx`、`/etc/systemd` 等系统目录；
- 执行未知的 `sudo` 命令；
- 使用 Docker。

## 4. 本地开发访问

前端：

```text
Vite 0.0.0.0:5173
```

后端：

```text
Go 127.0.0.1:8080
```

Vite：

```text
/api → http://127.0.0.1:8080
```

因此同一局域网设备访问：

```text
http://<内网服务器IP>:5173
```

即可完整测试前后端，同样使用 `/api` 路径。

## 5. 邮件测试

开发环境不得默认真实发送日历邀请。

系统实现：

```text
MAIL_MODE=file
```

把生成的邮件和 ICS 文件写入：

```text
.local/mail-outbox/
```

确认邮件格式无误后，生产环境才使用：

```text
MAIL_MODE=smtp
```

## 6. 编码循环

每个功能按以下顺序：

```text
阅读设计文档
→ 更新 OpenAPI / migration
→ 生成代码
→ 实现后端
→ 后端单元测试
→ 实现前端
→ 前端测试
→ E2E
→ 浏览器人工检查
→ Git commit
```

数据库和 API 先于 UI 细节。

## 7. 发布前完整检查

至少运行：

```bash
make generate
make lint
make test
make test-e2e
make build
```

并执行收入模拟 Golden Test。

## 8. 发布产物

生产发布不复制开发工作区的 `.env`、`.local`、node_modules 或开发数据库。

只发布：

- Go Linux 二进制；
- React `dist/`；
- migration；
- 必要部署配置模板；
- release metadata。

## 9. 云端发布

```text
上传新 release
→ pg_dump
→ migration
→ 切换软链接
→ restart
→ health check
```

失败时保留上一版本应用产物用于回滚。

## 10. 生产域名

生产环境最终结构：

```text
https://你的域名/       → React dist
https://你的域名/api/* → Nginx → 127.0.0.1:8080
```

生产 API 不直接对公网开放端口。

## 11. AGENTS.md

仓库根目录建立简短 `AGENTS.md`，只包含：

- 项目是什么；
- 技术栈；
- 关键不可违反约束；
- 常用命令；
- 设计文档索引；
- 当前实施计划位置。

完整需求继续放在 `docs/`，不要把几十页设计文档复制进 `AGENTS.md`。
