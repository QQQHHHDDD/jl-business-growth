# UI-A：Design System + App Shell 完成报告

## 范围与结论

本批仅执行 `UI-A：Design System + App Shell`。已建立语义化 Design Tokens，升级共享 UI primitive 与 App Shell，并保留现有路由、业务逻辑、API、权限、Sidebar 分组展开逻辑、移动端 Drawer / Bottom Nav、App Shell DOM 生命周期和 PageContainer 几何结构。

本批没有进入 UI-B；首页、数据统计、梦想与目标没有做页面特化，也没有新增业务数据。

结论：UI-A 实现与自动化门禁通过，等待人工视觉验收。

## 最终 Design Tokens

定义位置：`frontend/src/index.css` 与 `frontend/tailwind.config.ts`。

| 类别 | Token | 值 / 用途 |
| --- | --- | --- |
| Canvas | `canvas` | `rgb(247 250 252)`，冷白浅蓝灰全局背景 |
| Surface | `surface` | `rgb(255 255 255)`，卡片、导航和内容表面 |
| Surface | `surface-soft` | `rgb(248 251 255)`，柔和内容区和 Skeleton |
| Surface | `surface-muted` | `rgb(242 247 249)`，控件底色与导航 hover |
| Ink | `ink` | `rgb(15 23 42)`，主要标题和正文 |
| Ink | `ink-muted` | `rgb(71 85 105)`，次级正文 |
| Ink | `ink-faint` | `rgb(100 116 139)`，辅助文字 |
| Outline | `outline` | `rgb(226 235 241)`，边框与分隔线 |
| Brand | `brand-50…900` | 青绿品牌阶梯，主操作使用 `brand-700` |
| Accent | `accent-blue/purple/coral/orange/yellow/mint/sky` | 预留给共享指标和状态，不在本批给业务页注入虚构数据 |
| Radius | `control/card/panel/hero` | `12px / 16px / 20px / 24px` |
| Shadow | `hairline/card/card-hover/brand-glow/panel/float/overlay` | 低对比层次、品牌主操作、浮层 |
| Motion | `motion-fast/normal/slow` | `120ms / 160ms / 200ms`；仅用于控件状态与 Sidebar 宽度，不做页面切换动画 |

全局背景只使用极低对比的固定径向色斑；没有远程字体、重型 UI 框架或全站渐变卡片。

## 新增与修改的公共组件

修改：

- `Button`：统一主色、次级按钮、Ghost、Icon、Danger、焦点环、禁用和 loading 状态。
- `Input`：统一边框、控件圆角、焦点环与语义文字；保留原有 icon padding 和字段行为。
- `StatusBadge`：中性、信息、成功、警告、危险状态统一语义色。
- `Panel`、`PageHeader`：统一表面、边框、标题层级、间距和圆角。
- `Tabs`：统一 segmented 风格、横向滚动和 active 状态；保留原有 Radix 行为。
- `Dialog`、`Sheet`：统一 overlay、表面、边框、阴影和圆角；保留原有移动/桌面尺寸与交互。
- `DataTable`：统一表头、hover、边框与表面；保留 `min-w-[760px]` 和横向滚动。
- `LoadingState`、`PageLoadingState`、`EmptyState`、`ErrorState`：保留稳定高度和可访问状态，增加共享视觉层次。

新增但尚未特化任何业务页：

- `MetricCard`：带语义 tone、图标、数值和辅助信息的指标卡 primitive。
- `SegmentedControl`：带 `aria-pressed` 的可复用分段控件。
- `Notice`：成功、信息、警告、危险通知 primitive。

共享 primitive 已加入 `frontend/src/components/ui/ui-components.test.tsx` 的可访问性和交互测试。

## App Shell 改动

修改 `frontend/src/components/layout/navigation.tsx` 与 `account-menu.tsx`：

- Brand 区域改为青绿品牌阶梯、轻量阴影和更清晰的品牌字阶。
- Sidebar active item 改为完整圆角、浅青绿 active surface、细内描边和轻阴影；保留 `bg-teal-50` 兼容现有测试语义。
- 各 Sidebar 业务分组继续独立展开，未改 state、localStorage key 或路由行为。
- 展开 Sidebar 保持 `220px`，收起 rail 保持 `64px`；Topbar 保持 `64px`。
- 增加低对比、无交互的 `Growth Together` 品牌提示卡，仅位于展开的普通用户 Sidebar 底部。
- Topbar、账号菜单、移动 Drawer、Bottom Nav 使用统一 surface、outline、shadow 和焦点样式。
- AppLoadingShell 与真实 Shell 使用相同语义背景，避免 loading 阶段视觉跳变。
- `PageContainer` 的 `max-w-[1360px]`、padding、`min-h`、overflow 与 `data-testid` 均保持不变。

未改变 App Shell 的 DOM identity、路由 Outlet、Sidebar / Topbar 挂载逻辑、prefetch 回调、移动 Drawer / Bottom Nav 行为，也未增加路由切换动画或透明度遮罩。

## Tailwind 抽象范围

共享层与 Shell 中将重复的 `bg-white`、`bg-slate-*`、`text-slate-*`、`border-slate-*`、`rounded-md/lg/xl`、硬编码 shadow 替换为 `bg-surface*`、`text-ink*`、`border-outline`、`rounded-control/card/panel`、语义 shadow 和 brand 色阶。

业务 feature 页仍保留自身业务语义所需的局部 class；本批没有批量改写业务表单，也没有替换全站原生 `Select` / `Textarea`。

## 页面影响边界

所有使用共享 `Button`、`Input`、`Panel`、`Tabs`、`Dialog`、`Sheet`、`DataTable`、状态组件、`PageHeader` 或 App Shell 的页面会自然获得统一视觉。首页、数据统计、梦想与目标仅受到共享层影响，没有修改其页面文件、查询、业务数据、布局结构或交互流程。

## 截图证据

截图由真实 Chromium、开发服务器和真实用户登录流程生成；桌面尺寸为 1440×900，移动尺寸为 390×844。

- [1440 desktop - App Shell 展开](ui-visual-upgrade-ui-a-screenshots/desktop-app-shell-expanded.png)
- [1440 desktop - App Shell 收起](ui-visual-upgrade-ui-a-screenshots/desktop-app-shell-collapsed.png)
- [1440 desktop - Dialog](ui-visual-upgrade-ui-a-screenshots/desktop-dialog.png)
- [1440 desktop - Empty State](ui-visual-upgrade-ui-a-screenshots/desktop-empty-state.png)
- [390 mobile - Shell + Bottom Nav](ui-visual-upgrade-ui-a-screenshots/mobile-shell-bottom-nav.png)
- [390 mobile - Drawer](ui-visual-upgrade-ui-a-screenshots/mobile-drawer.png)
- [390 mobile - Dialog](ui-visual-upgrade-ui-a-screenshots/mobile-dialog.png)
- [390 mobile - Sheet](ui-visual-upgrade-ui-a-screenshots/mobile-sheet.png)

空态截图来自新建普通用户在学习中心的真实“没有匹配的学习项目”状态；没有注入虚构业务数据。

## 自动化验证

执行结果：

| 命令 | 结果 |
| --- | --- |
| `make lint` | PASS（Go vet、frontend ESLint） |
| `make test` | PASS（后端 Go tests；前端 22 files / 100 tests） |
| `make build` | PASS（Go API/jobs 与 Vite production build）；Vite 仅输出已有 chunk size warning |
| `make test-e2e` | PASS：1 个开发 Shell E2E 通过；2 个需要 `APP_ENV=test` 与测试数据库凭据的项目按现有配置 skip |
| 真实 Chromium UI-A screenshot capture | PASS：1 test，完成 8 张 1440/390 截图 |
| `git diff --check` | PASS |

本批未修改 E2E 业务测试的 skip 条件，也未用 skip 掩盖 UI-A 单元测试或构建失败。

## 提交与工作区

- UI-A 实现与截图提交：`86f6b27` (`style(ui): implement ui-a design system and app shell`)
- 报告提交：本报告单独提交；最终 HEAD 与 `git status --short` 以完成本报告提交后的最终交接输出为准。
- 本批不部署生产，不创建 `v1.0.0`。
