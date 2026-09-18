# UI-B1：数据统计页面视觉升级完成报告

## 范围与结论

本批只改造 `/app/analytics` 数据统计页面，未修改首页、梦想与目标、其他业务页面、后端、API、schema、权限或路由。

现有查询、React Query key、`businessRange` 时间范围规则、五个业务 Tab、指标切换、图表数据来源和明细数据均保持不变。没有增加虚构的环比、趋势百分比或其他后端不存在的数据。

结论：UI-B1 analytics 实现与自动化门禁通过，等待产品负责人视觉确认后再决定是否扩散到其他页面。

## 页面视觉实现

### 1. 成长主题 Hero

将原有简单 `PageHeader` 包在轻量成长主题 Hero 中：

- 保留“经营分析 / 数据统计 / 按业务领域和时间范围查看当前账号已记录的数据”。
- 增加本地内联原创 SVG：路径、山峰、叶片、太阳等固定尺寸装饰。
- 使用非常淡的青绿、蓝色背景层次；装饰 `pointer-events-none`，不参与布局。
- 桌面右侧显示装饰，移动端自动隐藏；首屏高度保持克制。
- 没有使用远程图片或远程字体。

### 2. 一级业务 Tabs

继续使用 UI-A 的 `Tabs` / `TabsList` / `TabsTrigger` 体系，明确区分：

```text
工作量 / 营业额 / 目标 / 团队 / 财务
```

没有改变 Radix Tabs 行为或业务切换逻辑。

### 3. 时间范围 SegmentedControl

将时间范围按钮替换为 UI-A `SegmentedControl`：

```text
本周 / 本月 / 自然年 / 财年 / 自定义
```

- active 使用青绿色语义色。
- 日期范围变为低对比辅助信息。
- 自定义日期输入仍写入原来的 `customFrom` / `customTo`，没有改变日期计算或查询参数。
- `SegmentedControl` 仅做一个兼容性小调整：`items` 接受 readonly 数组，以支持页面的常量定义，不改变运行时行为。

### 4. 工作量 KPI MetricCard

工作量五张 KPI 已接入 UI-A 的 `MetricCard`，仅展示真实 label/value/icon：

| KPI | Tone | Icon |
| --- | --- | --- |
| 开启对话 | brand / mint | MessagesSquare |
| 深入对话 | blue | MessageCircleMore |
| 分享故事 | coral | Star |
| 筛选 | amber / yellow | Filter |
| 会面 | purple | Handshake |

没有添加“较上期”“环比”“+10%”等不存在的数据。其他业务 Tab 的 KPI 也只使用已有返回值，并未新增数据字段。

### 5. 趋势图与无趋势状态

- 保留原有柱形图实现、指标选择和 `chartValue` 计算。
- 降低 grid / axis 对比度，统一为 brand palette，柱形采用更柔和的青绿色。
- 趋势指标切换按钮改为低强度 chip，触控高度至少 40px。
- 当只有一个统计周期，改为品牌化 `暂无趋势` 状态：本地 SVG 成长插画、说明“再记录几个周期后，这里会逐渐形成你的成长轨迹。”和真实路由 CTA“去记录工作量”。
- 无周期时同样提供调整范围 / 记录工作量的稳定空态；没有返回 `null` 或短暂空白。
- CTA 使用应用内 `/app/worklog` 路由。

### 6. 结构摘要

保留原有五项工作量内容：

```text
Buffer / 提供机会 / 顾客跟进 / 阅读分钟 / 音频分钟
```

升级为带轻量 icon、辅助色块、突出数值和弱 divider 的 summary card；内容和数值来源未变。其他业务 Tab 的摘要也沿用相同层次，但没有改变业务数据。

## Mobile 处理

390px 真实移动 Chromium context 取证：

```text
innerWidth: 390
clientWidth: 390
mainLeft: 0
mainPaddingLeft: 0px
pageLeft: 0
scrollWidth: 390
```

Hero 装饰在移动端隐藏；KPI 为单列、Tabs 可横向滚动、时间范围保持可点击、底部导航不被页面内容遮挡，页面无横向溢出。

## 真实 Chromium 截图

截图由真实应用、真实登录流程和真实工作量数据生成。测试用户写入了两个不同业务日期的工作量记录，用于形成实际多周期趋势；没有使用设计稿替代运行中应用截图。

- [1440px 工作量 / 本周 / 实际趋势](ui-visual-upgrade-ui-b-analytics-screenshots/analytics-1440-worklogs-week.png)
- [1440px 工作量 / 无趋势状态（完整页面，含 CTA）](ui-visual-upgrade-ui-b-analytics-screenshots/analytics-1440-worklogs-no-trend.png)
- [1280px 工作量 / 本周 / 实际趋势](ui-visual-upgrade-ui-b-analytics-screenshots/analytics-1280-worklogs-week.png)
- [1024px 工作量 / 本周 / 实际趋势](ui-visual-upgrade-ui-b-analytics-screenshots/analytics-1024-worklogs-week.png)
- [390px 工作量 / 本周 / 实际趋势](ui-visual-upgrade-ui-b-analytics-screenshots/analytics-390-worklogs-week.png)

尺寸：工作量趋势截图分别为 1440×900、1280×900、1024×900、390×844；无趋势完整页面为 1440×1345（宽度保持 1440，确保插画与 CTA 同时可见）。

专用 Chromium 采集结果：1 test passed；四种视口均完成；`console` / `pageerror` 为空；移动端 `scrollWidth` 未超过 `clientWidth`。

## 自动化门禁

| 命令 | 结果 |
| --- | --- |
| `make lint` | PASS（Go vet、frontend ESLint） |
| `make test` | PASS（后端测试；前端 22 files / 100 tests） |
| `make build` | PASS（Go API/jobs、Vite production build）；Vite 仅报告 chunk size warning |
| `make test-e2e` | PASS：1 个开发 Shell E2E 通过；2 个需要 `APP_ENV=test` 与测试数据库凭据的项目按现有配置 skip |
| `git diff --check` | PASS |

analytics 单测额外覆盖：一级 Tab 与时间范围切换、自定义日期输入、品牌化单周期空态 CTA、团队无快照状态、双周期真实趋势图。

## 提交与边界

- UI-B1 实现与截图提交：`4bf7788` (`style(analytics): apply ui-b visual language`)
- 本报告随后作为独立文档提交。
- 未进入首页、梦想与目标或其他业务页面的页面级视觉改造。
- 未修改 analytics API、查询规则、日期范围逻辑、后端、schema、权限或路由。
- 不部署生产，不创建 `v1.0.0`。
