# JL团队生意成长管理系统——Codex UI 重构剩余页面与最终收尾 Prompt V1.0

## 1. 当前基线

Phase A 已完成。Phase B 已完成并自动化 PASS。

请以当前仓库 HEAD 为真实基线，不机械假设某个 commit 哈希一定是最新。

## 2. 本次目标

一次完成剩余 UI 重构和全局视觉收尾：

- C1 财务
- C2 学习中心
- C3 收入模拟
- C4 复盘
- C5 数据统计
- D1 导入/导出 + 设置
- D2 全局搜索
- D3 全局响应式与视觉一致性收尾

产品负责人希望全部完成后再统一截图验收，因此中途不需要等待人工确认，但内部必须分小提交。

## 3. 开始前

先不要修改代码。

完整阅读：

- `AGENTS.md`
- 当前生效设计文档
- `docs/18-V1-UIUX信息架构重构设计-V1.0.md`
- `docs/21-UI重构-Phase-B-设计说明-V1.0.md`
- `docs/24-UI重构-Phase-B-完成报告.md`
- `docs/25-UI重构-剩余页面与全局收尾设计-V1.0.md`

执行：

```bash
git status --short
git log --oneline --decorate -12
```

必须确认工作区可解释。如果有未提交变更，先识别来源，不得删除、覆盖或擅自吸收；无法确认来源则停止并报告。

## 4. 功能冻结

禁止修改：后端 API 语义、migration、数据库结构、OpenAPI 业务合约、权限、收入模拟公式、财务计算、导入幂等规则、团队快照规则、搜索业务范围，也禁止新增业务模块。

如果某个 UI 需求无法纯前端实现，停止并报告。

## 5. C1 财务

实现：

```text
[总览] [流水] [预算] [资金快照]
```

要求：

- 总览显示真实现有数据；
- 流水列表为主，新增流水使用 Drawer；
- 分类管理降级为次级操作；
- 预算独立 Tab；
- 资金快照独立 Tab；
- 不改变金额精度和业务模型。

建议 commit：

`feat(ui): redesign finance workspace`

## 6. C2 学习中心

实现：

```text
[学习项目] [附件库]
```

要求：

- 顶部学习摘要；
- 学习项目列表/卡片；
- 搜索、类型、状态、标签筛选；
- 新增/编辑项目使用 Drawer；
- 附件库集中展示；
- 原附件关联、预览、删除规则不变。

建议 commit：

`feat(ui): redesign learning workspace`

## 7. C3 收入模拟

实现：

```text
[模拟器] [保存方案] [方案比较]
```

模拟器分为基础数据、市场结构、奖励条件。桌面结果区使用 sticky panel。

要求：

- 不改任何计算公式；
- 不改变输入字段语义；
- 保存方案、复制、比较、删除全部保留；
- 移动端结果区正常降级。

建议 commit：

`feat(ui): redesign income simulator workspace`

## 8. C4 复盘

实现：

```text
[每日] [每周] [每月]
```

要求：

- 当前周期经营摘要与文本复盘整合；
- 最近历史复盘可快速访问；
- 不改变周期唯一规则；
- 不改变自动摘要数据来源。

建议 commit：

`feat(ui): redesign review workspace`

## 9. C5 数据统计

实现：

```text
[工作量] [营业额] [目标] [团队] [财务]
```

时间范围：

```text
本周 | 本月 | 本年 | 自定义
```

每个领域统一为 KPI、趋势、分布/结构、明细。只使用现有 analytics API。

建议 commit：

`feat(ui): redesign analytics workspace`

## 10. D1 导入/导出 + 设置

导入改为明显步骤流：类型 → 模板 → 上传 → 校验预览 → 确认。

导出改为紧凑结构列表。

设置改为：

```text
[账号] [偏好] [数据与安全]
```

危险操作单独放置。

建议 commit：

`feat(ui): refine tools and settings`

## 11. D2 全局搜索

使用 Phase A 顶部搜索入口，实现 Search / Command Overlay：

- 输入关键词；
- 模块分组结果；
- 键盘选择；
- Enter 打开；
- 查看全部结果进入原搜索页面。

不得扩大后端搜索范围。

建议 commit：

`feat(ui): refine global search experience`

## 12. D3 全局收尾

统一所有页面的 PageHeader、Tabs、Drawer/Sheet、Empty State、Table、Form spacing、Buttons、Badge、Search/filter bars 和 Mobile responsive behavior。

重点检查：1280px、1440px+、Tablet、Mobile。

管理员端只做视觉统一，不重构权限或业务结构。

建议 commit：

`style(ui): complete responsive visual consistency pass`

## 13. 测试

每个子阶段执行相关 Vitest。最终执行：

```bash
make lint
make test
make build
make check
make test-e2e
git diff --check
```

不得删除失败断言、降低测试标准或 skip 原有 E2E。如发现 Phase A/B 布局回归可以修复，但不要新增业务功能。

## 14. 最终输出

完成全部 C/D 后生成：

`docs/27-UI重构-最终完成报告.md`

内容至少包括：

1. 当前基线；
2. C1～C5、D1～D3 完成内容；
3. 每阶段 commit；
4. 主要文件；
5. 是否发生后端/API/数据库变化；
6. Desktop 效果；
7. Mobile 效果；
8. 管理员端结果；
9. 自动测试结果；
10. git status；
11. 已知 UI 技术债务；
12. 产品负责人建议截图页面清单。

完成后停止。不要继续生产部署，不要创建 v1.0.0，等待产品负责人截图和最终 UI 验收。
