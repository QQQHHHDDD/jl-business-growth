# 本地隔离测试

仓库的数据库集成测试只允许使用数据库名为 `jl_business_test` 的 PostgreSQL
数据库，并且仍然必须通过 `backend/cmd/check-test-database-url` guard。仅因为地址
是 localhost 或变量名包含 `test`，不能证明数据库可以重置。

在没有明确获准的外部测试库时，使用下面的入口创建本任务专用的 PostgreSQL
实例。它会使用独立临时数据目录、随机回环端口和临时 socket，设置合成测试账号、
会话密钥、文件根目录和 `RELEASE_UPDATE_ENABLED=false`，完成 fresh migration、从
`v1.1.3` 基线升级到当前 schema 14、集成测试和生产构建后的完整 E2E。进程退出或
中断时只停止并删除自己创建的实例和临时目录：

```bash
make test-isolated
```

也可以只运行一个范围：

```bash
make test-isolated SCOPE=migrations
make test-isolated SCOPE=integration
make test-isolated SCOPE=e2e
```

该入口不会读取或覆盖现有 `TEST_DATABASE_URL`，不会重置外部数据库，也不会连接
生产资源。它要求本机已安装 `initdb`、`pg_ctl`、`postgres`、`psql` 和 Go；前端
E2E 在本仓库已有依赖和 Bun 可用时使用 Bun 启动。若使用外部测试库，先单独运行
`make check-test-database`，并在报告中说明数据库来源、是否允许重置以及实际运行的
测试范围；不要把“全部跳过”报告为通过。
