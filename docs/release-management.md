# 版本与 Release 管理

## 版本来源

本地普通构建显示 `dev`，不会冒充正式版本。正式版本只接受稳定格式
`vX.Y.Z`。`make release VERSION=vX.Y.Z` 从同一次构建向以下位置注入完全
一致的版本、Git SHA 和 UTC 构建时间：

- Go `internal/buildinfo`；
- 前端 `VITE_APP_VERSION`、`VITE_GIT_COMMIT` 和 `VITE_BUILD_TIME`；
- release artifact 中的 `release.json`。

Go API 和 jobs 二进制支持 `--version`，构建脚本会用它验证 ldflags 结果。

## 创建 GitHub Release

`.github/workflows/release.yml` 只接受匹配 `vX.Y.Z` 的 tag。流程运行
`make check` 和 `make release VERSION=<tag>`，校验 manifest 与 SHA256 后，
使用 GitHub CLI 创建非 draft、非 prerelease 的 Release。工作流只具有
`contents: write`，不读取生产环境密钥，也不执行生产部署。

## Artifact 格式

上传文件为：

```text
jl-business-growth_vX.Y.Z_linux_amd64.tar.gz
SHA256SUMS
```

archive 包含：

```text
jl-business-api
jl-business-jobs
web/
migrations/
scripts/
release.json
```

`release.json` 包含 `version`、`git_sha`、`built_at`、`platform`、
`schema_version`、`compatible_schema_min` 和 `compatible_schema_max`。
schema version 从最新 migration 文件名生成，不永久硬编码。

## SUPER_ADMIN Version Center

USER、ADMIN、SUPER_ADMIN 都可以看到侧边栏版本号。USER 和 ADMIN 看到的
是普通 `span`，不会打开浮层或请求管理接口。只有 SUPER_ADMIN 可以打开
Version Center，检查固定仓库 `QQQHHHDDD/jl-business-growth` 的正式 GitHub
Release、查看发布时间与 Release 页面、观察更新状态及已安装版本。

后端 GitHub 请求设置 5 秒 timeout、明确 User-Agent 和 5 分钟缓存。没有
`GITHUB_TOKEN` 时仍可访问 public repository；如果配置 token，它只存在于
服务器环境。draft、prerelease 和非稳定 semver 会被忽略。

## 启用 online updater

所有环境默认：

```text
RELEASE_UPDATE_ENABLED=false
```

关闭时仍可查看和检查 Release，但 update/rollback API 返回拒绝结果，UI
不会展示可执行的更新按钮。生产环境不会因部署而自动开启。启用前必须
完成备份与恢复演练、systemd 安装、运行目录权限和命令依赖检查。

## 独立 updater

运行中的 API 不替换自身，也不直接调用 `systemctl`。API 完成角色、CSRF、
stable semver、固定 repository、正式 Release 和并发锁验证后，只向
`/var/lib/jl-business-growth/release-updater/requests/` 写入 request、enqueue
lock 和可选 queued metadata。最后原子写入 `requests/request.json` 作为唯一
trigger commit point；`state/status.json` 由 root updater 独占写入，API 只读。
`jl-business-updater.path` 监听 `requests/request.json` 并触发独立 oneshot
service 执行更新。
生产环境的 `RELEASE_RUNTIME_ROOT` 被强制固定为该目录，以避免 API 写入路径与
systemd 监听路径不一致。

runtime 权限域固定为：runtime 根目录 `root:jl-business 0750`，`requests/`
为 API 可写输入区，`state/` 为 `root:jl-business 0750` 的 authoritative
状态区，`work/` 为 `root:root 0700` 的 runner lock、claim 和临时工作区。
API 的 systemd `ReadWritePaths` 只允许 requests 区域。

updater 启动后先取得 `work/runner.lock`，再把 `requests/request.json` 原子
claim 到 root-only work 区域，并在 claim 后重新验证 regular file、非 symlink、
JSON schema、request ID、action、版本和固定 repository。directory、FIFO、
device、symlink 或 malformed request 都会被拒绝，不会被跟随或执行 root 操作。

请求只包含 action、from/target version、固定 repository、request ID 和
时间，不接受 URL、文件路径、asset URL 或 shell command。updater 自行构造
固定 GitHub 下载地址，不使用 `bash -c` 拼接用户输入。

## 更新流程

1. 获取持久更新锁，拒绝并发任务。
2. 下载固定 Release archive 与 `SHA256SUMS`。
3. 校验 SHA256、archive 路径和 `release.json`。
4. 确认 manifest version 与请求版本一致。
5. 执行数据库和文件备份。
6. 只执行向前 migration。
7. 安装新的 backend/frontend immutable release directory。
8. 原子切换 backend 和 web `current` symlink。
9. 重启 API 与 jobs timer。
10. 检查 `/api/health/live` 和 `/api/health/ready`。
11. 将安全状态写回 `state/status.json`，供 React Query 轮询。

状态包括 queued、downloading、verifying、backing_up、migrating、switching、
restarting、health_check、succeeded 和 failed，不伪造百分比。

## Rollback 限制

Rollback 只切换已安装的 application release，绝不执行 `goose down` 或其他
生产 down migration。目标 manifest 必须明确声明当前数据库 schema 位于
`compatible_schema_min` 和 `compatible_schema_max` 范围内，否则 API 与
updater 都会拒绝自动回退。

如果新版本启动或健康检查失败，updater 可以恢复之前的 application
symlink 并重启服务，但不会回滚已执行的数据库 migration。状态会明确要求
人工检查数据库兼容性。

## Backup 与 migration

更新前调用 root-provisioned `/usr/local/libexec/jl-business-backup-db`，不执行
release directory 内的 `scripts/backup-db.sh`。数据库凭据只来自服务器
EnvironmentFile，不进入请求、status、前端、Release archive 或 audit
details。生产 migration 只有显式启用 updater 并确认正式 Release 后才会由
独立 updater 执行。

updater 和 backup helper 的安全更新需要在受信任的部署流程中由 root 显式
provision；application account 不得自动更新 `/usr/local/libexec` 中的 helper。

## Audit Log

以下操作写入 `security_audit_logs`：

- `SYSTEM_RELEASE_CHECK`
- `SYSTEM_RELEASE_UPDATE_REQUEST`
- `SYSTEM_RELEASE_ROLLBACK_REQUEST`

update/rollback audit details 记录安全的 target version 和 request ID，不记录
token、数据库 URL、命令、文件系统秘密路径或 stack trace。实际 updater
过程同时进入 systemd journal。

## Troubleshooting

- GitHub 不可用：当前版本仍会显示，稍后手动重新检查。
- updater disabled：确认这是默认安全状态，仅在完成运维准备后启用。
- update lock 存在：先检查 `state/status.json` 和 updater journal，不要直接并发重试。
- checksum 或 manifest 失败：Release 不会安装，检查 GitHub assets 是否由同一
  tag workflow 生成。
- health check 失败：检查 status 是否显示 application 已恢复，并人工确认已执行
  migration 与旧应用的兼容性。
