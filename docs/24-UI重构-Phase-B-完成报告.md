# UI 重构 Phase B 完成报告

## 1. Git 基线与 checkpoint

- Phase B 开始基线：`e1471a5 feat: complete UI refactor phase A`。
- 开始前发现的历史工作区变更已逐项审计，来源可对应到已授权的 UAT 修复、视觉优化、测试稳定性调整和 Phase B 资料包。
- 未删除、覆盖或混入来源不明的改动；历史变更通过 `make check`、`make test-e2e` 和 `git diff --check` 后，以 `341c436 chore: checkpoint pre-phase-b working tree` 建立 checkpoint。
- Phase B 从干净工作区开始实施。

## 2. B1～B4 完成内容

### B1 今日工作

- 增加紧凑的前一天、后一天、今天和日期选择导航，保留历史补录与编辑。
- 八项顾客行动改为可触控的数字步进器，同时保留键盘直接输入，并阻止数值降到 0 以下。
- 将行动、学习分钟和营业额摘要压缩到页面顶部。
- 将成长投入、营业额和备注拆分为清晰分区，保留 PV 与净营业额校验和换算规则。
- 最近记录移至页面底部并限制为最近 7 条，点击日期可继续编辑。

### B2 梦想与目标

- 新增“目标地图 / 目标列表 / 梦想板”三个视图，默认进入目标地图。
- 扩大目标地图工作区，节点点击后通过右侧 Sheet 查看目标、自动进度、父目标、子目标和量化指标。
- 新建与编辑目标统一使用 Sheet，保留目标层级、父子关系、状态、日期、指标、目标值和单位。
- 目标列表增加名称搜索、层级筛选和状态筛选。
- 梦想板改为图片卡片；新增与编辑梦想使用 Sheet，并保留图片和目标关联。
- 空状态缩小并提供明确主操作。

### B3 团队

- 新增“关系图 / 成员列表 / 历史快照”三个视图，默认进入关系图。
- 关系图成为主工作区，支持双向滚动查看，节点可点击打开详情 Sheet。
- 新增与编辑成员统一使用 Sheet，保留姓名、上级、级别、城市、加入日期、状态和备注。
- 成员详情显示真实 `member_code`、上级和直属成员；成员列表支持姓名、编码、级别和城市搜索。
- 保存快照成为页面级操作；历史快照独立展示来源、成员数、`captured_late` 和快照内组织结构。
- 未改变 `member_code`、父级关系、删除限制或快照业务语义。

### B4 日历

- FullCalendar 月、周、日视图成为页面主区域。
- 删除底部长期占位的“已加载日程”面板；点击日期后使用右侧 Sheet 查看当天日程。
- 当日详情可直接新建日程，点击事件可进入编辑 Sheet。
- 保留并在统一编辑界面中覆盖全天事件、重复频率、周重复日、重复结束条件、单次/本次及以后/整个系列、邮件邀请、ICS 相关受邀邮箱和 IANA 时区字段。
- 未重写 FullCalendar 或后端日历展开算法。

## 3. 主要文件

- `frontend/src/components/ui/sheet.tsx`
- `frontend/src/features/worklog/worklog-page.tsx`
- `frontend/src/features/worklog/worklog-page.test.tsx`
- `frontend/src/features/goals/goals-page.tsx`
- `frontend/src/features/goals/goals-page.test.tsx`
- `frontend/src/features/team/team-page.tsx`
- `frontend/src/features/team/team-page.test.tsx`
- `frontend/src/features/calendar/calendar-page.tsx`
- `frontend/src/features/calendar/calendar-page.test.tsx`
- `frontend/src/components/ui/ui-components.test.tsx`
- `frontend/e2e/phase1-auth.spec.ts`

## 4. API 与后端变化

Phase B 提交相对 checkpoint `341c436` 只修改前端源码、前端测试和 E2E 测试。没有修改：

- 后端 Go 代码；
- PostgreSQL 数据结构；
- Goose migration；
- OpenAPI 业务合约或生成代码；
- sqlc 查询；
- 认证、权限和业务规则。

Checkpoint 中的后端/OpenAPI 文件属于 Phase B 开始前已存在且经审计的 UAT 历史变更，不属于 Phase B 实现。

## 5. Desktop 效果

- 四个页面均优先展示核心工作区，不再由常驻创建表单挤压首屏。
- 目标地图、团队关系图和日历获得稳定的大面积区域。
- 目标、梦想、成员和日程使用同一套右侧 Sheet；标题和操作区固定，中部内容独立滚动。
- 列表视图保持最小可读宽度和横向滚动，不压缩关键列。

## 6. Mobile 效果

- Sheet 在小屏使用全屏布局，在桌面切换为 520～580px 的右侧抽屉。
- Sheet 支持焦点约束、Escape 关闭、关闭按钮和关闭后焦点返回。
- 今日工作步进器提供 44px 触控目标，日期导航和保存操作保持可达。
- 目标列表、成员列表和日历在小屏保留可读与滚动能力，编辑表单不产生页面级横向溢出。

## 7. 自动测试结果

最终验证于 2026-09-16 执行：

| 命令 | 结果 |
| --- | --- |
| `make lint` | PASS，Go vet 与 ESLint 通过 |
| `make test` | PASS，Go 测试通过；Vitest 10 个文件、34 项测试通过 |
| `make build` | PASS，两个 Go 二进制和 Vite 生产构建成功 |
| `make check` | PASS，代码生成、Lint、测试和构建全部通过 |
| `make test-e2e` | PASS，Playwright 3/3 通过 |
| `git diff --check` | PASS |

新增或加强的回归覆盖包括：步进器与负数保护、历史日期、目标 Tabs/Sheet/梦想板、团队 Tabs/Sheet/快照入口、日历日期详情与月周日配置、重复日程编辑范围、移动端 Sheet 响应式约束，以及原业务 E2E 主流程。

## 8. Commit

四个子阶段独立 commit：

- B1：`f59cf48 feat: redesign daily work entry`
- B2：`8659d68 feat: redesign goals and dreams workspace`
- B3：`c6e145a feat: redesign team structure workspace`
- B4：`7418d05 feat: redesign calendar workspace`

补充提交：

- checkpoint：`341c436 chore: checkpoint pre-phase-b working tree`
- 最终回归覆盖：`aa79742 test: complete phase b regression coverage`

## 9. Git status

报告生成前工作区无未提交代码变更。报告提交后再次执行 `git status --short` 核验，预期为空。

## 10. 已知问题

- 自动化已验证结构、交互和响应式 CSS 约束，但视觉审美、真实触控手感和不同手机尺寸仍需产品负责人进行人工验收。
- 团队关系图沿用当前前端自绘布局和滚动查看能力，没有在本阶段引入新的缩放引擎。
- 日历在很窄的移动屏幕上允许日历主区域横向滚动，以保持周列和事件文字可读。
- Playwright 启动子进程时仍输出 `NO_COLOR` 与 `FORCE_COLOR` 同时存在的非阻塞 Node 警告，不影响测试结果或产品行为。

## 11. 产品负责人重点人工验收

1. 在手机上连续录入八项行动，确认加减按钮、直接输入和日期切换手感。
2. 在有多层父子目标的数据中缩放和拖动目标地图，并检查目标详情、编辑及梦想图片呈现。
3. 在成员较多、层级较深的真实团队中查看关系图，并检查成员搜索和历史快照结构。
4. 在月、周、日三种日历视图中检查全天、普通和重复事件，重点验证单次、本次及以后、整个系列三种编辑范围。
5. 分别在桌面和手机上检查所有 Sheet 的滚动、固定操作区、Escape/关闭按钮和焦点返回。

Phase B 自动化验收结论：**PASS，等待产品负责人进行人工 UI 验收。**
