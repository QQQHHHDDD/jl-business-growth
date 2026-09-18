# JL团队生意成长管理系统 V1.0 前端视觉升级计划

## 1. 文档定位

本文件是 `docs/45-V1.0前端视觉升级总Prompt-V1.0.md` 的第一阶段输出，只做现状审计与实施规划，不包含代码改造。

本轮目标是在保持功能、信息架构、路由、业务字段、主要布局和核心交互基本不变的前提下，把现有偏传统企业后台的视觉语言升级为年轻、活力、清爽、有成长感和品牌辨识度的现代界面。

本轮边界：

- 不修改后端业务逻辑、API、OpenAPI、schema、migration、权限和业务口径；
- 不重排主要页面结构，不新增虚假功能入口；
- 不重写 FullCalendar、React Flow 或现有路由/App Shell 架构；
- 不引入重型 UI 框架；
- 不使用页面切换动画、全屏淡入淡出、延时或固定高度掩盖问题；
- 不部署生产，不创建 `v1.0.0`。

## 2. 审计基线与输入

- 审计 HEAD：`2be84f2`。
- 当前工作区已有上一任务的测试和报告修改，另有未跟踪的 Prompt 45；本次不改动或清理这些既有内容。
- 技术栈：React 19、TypeScript、Tailwind CSS 3.4、Radix Dialog/Tabs/Slot、CVA、Lucide、FullCalendar、React Flow。
- 视觉输入：产品负责人提供的当前系统截图与青春活力版数据统计参考图。
- 当前公共图片资产只有 `frontend/public/favicon.svg`，尚无品牌插画、空状态插画或页面氛围素材。

## 3. 当前视觉问题

### 3.1 截图对比结论

当前界面的优点是结构稳定、信息清楚、密度克制，但视觉主要依赖白底、灰边框和青绿色 active 状态：

- 页面背景是均一浅灰，Page Header 只是标题、说明和分隔线，品牌记忆点弱；
- Sidebar、Topbar、Panel、KPI 和筛选条都以相似的白底灰边框表达层级，界面显得平、硬、偏传统后台；
- KPI 只有标签和数字，没有统一图标、色调、辅助信息和语义层次；
- 空数据区域大而空，缺少引导动作与成长主题的视觉表达；
- 一级 Tab、时间范围、趋势指标等不同层级控件强度接近，层级区分不足；
- 页面标题、KPI 数字和 Section 标题之间的字体层级差距不够；
- 当前截图中的大面积留白属于“缺少内容”，而不是经过设计的呼吸感。

参考图值得吸收的部分：

- 青绿品牌主色和少量蓝、紫、珊瑚、暖黄辅助色；
- 柔和渐变、圆角和轻阴影共同建立层级；
- 带成长主题装饰的 Page Header；
- 有图标、强调数字和轻量辅助信息的 KPI 卡；
- 主 Tab 与时间范围采用不同强度的 segmented control；
- 空状态包含轻量插画、解释和明确 CTA；
- Sidebar 通过完整圆角高亮、品牌短句和轻量装饰增强辨识度。

不应直接照搬的部分：

- 不增加当前产品不存在的通知铃铛、快捷键或趋势数据；
- 不为了接近参考图而扩大或重排业务区域；
- 不让所有卡片都使用渐变和彩色背景；
- 不复制参考图插画，应建立 JL 自有且可复用的原创轻量视觉资产。

### 3.2 Design Tokens 现状

当前 token 主要位于：

- `frontend/tailwind.config.ts`
- `frontend/src/index.css`

已有能力：

- `brand` 色阶以 teal 为核心，但只有 50、100、200、500、600、700、800、900；
- `shadow-panel`、`shadow-float`、`shadow-overlay` 三档阴影；
- 根变量只有 `--brand-600`、`--brand-700`、`--focus-ring`；
- 全局表单 focus、selection、FullCalendar 基础视觉已有统一规则；
- `scrollbar-gutter: stable`、页面横向裁切等稳定性约束已存在，应保留。

主要缺口：

- `components.json` 声明 `cssVariables: true`，但实际没有完整的语义色、surface、border、radius、shadow、motion、typography token 系统；
- 业务组件广泛直接使用 `slate-*`、`teal-*`、`rose-*`，难以一次调整全局视觉；
- `text-slate-500`、`border-slate-200`、`bg-slate-100` 等使用非常密集，当前层级高度依赖灰色边框；
- Shell 仍直接写 `#f6f8fa`，React Flow 节点和少数组件存在硬编码 hex；
- 字体栈声明了 Inter，但项目没有内置字体资源或 `@font-face`，不同机器实际字形可能不同；
- 缺少辅助色、装饰色、卡片 tone、图表色和插画色的语义约束；
- 缺少统一 motion token 和 `prefers-reduced-motion` 策略。

### 3.3 公共组件现状

现有高复用公共组件基础良好：

| 组件 | 覆盖情况 | 当前问题 |
| --- | --- | --- |
| `Button` | 23 个前端文件 | variant 完整，但圆角、阴影和按压反馈偏基础；loading spinner 需与 motion token 对齐 |
| `Input` | 19 个文件 | 输入框统一，但原生 select、textarea、搜索框仍有多套重复样式 |
| `Panel` | 16 个文件 | 所有场景基本同一白底、灰边框、12px 圆角，缺少层级与 tone |
| `PageHeader` | 17 个页面 | 结构统一，但只是分隔线式标题；首页仍使用自定义 header |
| `Tabs` | 11 个页面 | 只有一种视觉强度，无法区分一级 Tab 与二级筛选 |
| `EmptyState` | 15 个页面 | 统一但过于通用，只有 Inbox 图标，没有品牌插画/tone/CTA 规范 |
| `Loading/Error` | 多页面 | 结构稳定；骨架几何应随新卡片同步，不能造成布局塌陷 |
| `Dialog/Sheet` | 多业务流程 | Radix 交互基础可靠，视觉仍偏传统白框；应只改 surface/spacing，不改交互 |
| `DataTable` | 5 个页面 | 可读性与移动滚动已稳定，后续只做表头、行 hover、分隔线和圆角收口 |
| `StatusBadge` | 10 个文件 | tone 可用，但与未来辅助色体系尚未统一 |
| App Shell | 全站 | DOM 持久化、移动 Drawer、Bottom Nav 已通过 UAT；只允许视觉升级 |

同时仍存在以下页面内重复实现：

- 41 个原生 `<button>`、22 个原生 `<input>`、7 个 `<textarea>`、8 个 `<select>`；
- 成功/错误通知条在多个业务页重复相同 class；
- Analytics 时间范围、趋势指标、KPI 卡片均为页面内实现；
- Dashboard 经营指标、Knowledge 摘要、Team 摘要等各自实现 KPI/summary；
- Dreams 空状态、Dashboard 空内容和 Analytics 单周期状态没有复用统一 EmptyState 语言；
- 搜索 Overlay 和 Account Menu 的浮层视觉是独立实现，项目没有共享 Tooltip/Popover surface primitive；
- React Flow 节点色、边框、阴影直接写入 style 对象，尚未连接全局 token。

### 3.4 测试与稳定性约束

现有测试不只是业务断言，也固定了部分几何与视觉类名，例如：

- 首页两个滚动区 `h-[216px]`；
- Analytics toolbar `min-h-[76px]`；
- Tabs 的横向滚动和不收缩；
- Sidebar active 的 `bg-teal-50`；
- Table 最小宽度、Sheet 移动端宽度；
- 1440/1280/1024/768/390px 无横向溢出；
- App Shell DOM identity、Page Header 和 Page Container 路由稳定性。

视觉升级必须保留有业务或稳定性意义的几何约束；对只绑定旧颜色 class 的测试，应改为断言语义状态、ARIA 或设计系统 variant，而不是继续锁死具体颜色。

## 4. 新视觉语言

### 4.1 核心原则

1. 品牌青绿负责主操作、成长、当前状态和主导航。
2. 蓝、紫、珊瑚、暖黄只服务 KPI、图表、图标底和局部装饰。
3. 文字和数据始终以高对比深色为主，颜色不作为唯一语义。
4. 用留白、surface 和柔和阴影建立层级，减少边框堆叠。
5. 品牌装饰集中在 Page Header、空状态和少量关键卡片，不铺满全站。
6. 财务、设置、管理端保持克制；梦想、首页、统计允许更强的情绪表达。
7. 所有动效服务状态反馈，不用于页面切换或遮盖加载。

### 4.2 建议语义 Tokens

实际实施时在 Tailwind theme 与 CSS variables 中建立单一来源；下面是计划值，UI-A 截图验收后可微调。

#### 色彩

```text
brand-50       #ECFDF5
brand-100      #D1FAE5
brand-200      #A7F3D0
brand-400      #34D399
brand-500      #14B8A6
brand-600      #0F8F83
brand-700      #0F766E

canvas         #F7FAFC
canvas-cool    #F8FBFF
surface        #FFFFFF
surface-soft   #F6FAFC
ink            #0F172A
ink-muted      #64748B
border-soft    #E7EEF4

accent-blue    #60A5FA
accent-purple  #A78BFA
accent-coral   #FB7185
accent-orange  #FB923C
accent-yellow  #FACC15
accent-mint    #6EE7B7
accent-sky     #38BDF8
```

语义 success/warning/danger/info 与装饰色分开，避免把“紫色 KPI”误解为状态。

#### 圆角

```text
control        10px
button/input   12px
small-card     16px
major-card     20px
hero           24px
pill           9999px
```

#### 阴影

```text
hairline       0 1px 2px rgba(15, 23, 42, 0.04)
card           0 8px 24px -18px rgba(15, 23, 42, 0.22)
card-hover     0 16px 32px -20px rgba(15, 23, 42, 0.28)
overlay        0 24px 64px -24px rgba(15, 23, 42, 0.32)
brand-glow     0 10px 24px -14px rgba(20, 184, 166, 0.55)
```

#### 字体层级

```text
page-title     30–34px / 1.2 / 700–800
section-title  16–18px / 1.4 / 700
kpi-value      28–36px / 1.1 / 700–800 / tabular-nums
body           14px / 1.6
label          12–14px / 600
metadata       12px / 1.5
```

中文正文优先系统字体。若后续确需固定字体，应使用仓库内授权字体并评估体积、FOUT 与布局变化，不使用运行时远程字体。

#### Motion

```text
fast           120ms
normal         160ms
slow           200ms
easing         cubic-bezier(0.2, 0.8, 0.2, 1)
```

只允许 hover、press、disclosure、popover、tooltip、segmented active indicator 等局部反馈，并为 `prefers-reduced-motion` 降级。禁止 route/page fade。

## 5. 必须在全局组件层解决的问题

| 问题 | 全局解决位置 | 页面只提供什么 |
| --- | --- | --- |
| 背景、文字、边框、阴影、圆角不统一 | `tailwind.config.ts`、`index.css` | tone/variant |
| Page Header 缺少品牌感 | `PageHeader` 增加 `tone`、可选装饰区和 mobile 简化 | eyebrow、title、description、action、页面 tone |
| KPI 多套重复样式 | 新增 `MetricCard/MetricGrid` | icon、label、value、tone、真实辅助信息 |
| Tab 层级不清 | `Tabs` 增加 primary/subtle；新增轻量 `SegmentedControl` | value、label、层级 |
| Panel 全部相同 | `Panel` 增加 default/elevated/tinted/interactive 语义 variant | 内容和极少数 tone |
| Select/Textarea/SearchField 重复 | 新增共享 form primitives | label、error、业务属性 |
| 成功/错误提示重复 | 新增 `Notice/Alert` primitive | status、message、action |
| 空状态缺少情绪与行动 | `EmptyState` 增加 tone、illustration/icon slot、CTA 规则 | 业务标题、解释、真实 CTA |
| Dialog/Sheet/Menu 浮层不一致 | 统一 overlay、surface、radius、shadow、focus | 尺寸与业务内容 |
| Skeleton 与新布局不一致 | `LoadingState/PageLoadingState` | 页面标题和 label |
| Sidebar/Topbar 品牌弱 | App Shell、Brand、NavItem、AccountMenu | 现有路由和账户数据 |
| 图表颜色和 tooltip 各自定义 | 图表 palette、chart surface、tooltip contract | 数据与 metric tone |

共享 Tooltip/Popover 目前不存在。UI-A 可建立轻量统一 surface contract，供未来 Account Menu、图表 tooltip 和日历 hover 使用；不得为了统一视觉重写现有 FullCalendar hover 定位与边界算法。

## 6. App Shell 改造计划

保持现有 Persistent App Shell、Sidebar、Topbar、PageContainer DOM 生命周期和路由预加载逻辑不变。

### Sidebar

- 保留业务分组、独立展开、收起模式、移动 Drawer 与 Bottom Nav；
- 品牌区强化 JL mark、英文名和中文产品名层级，可增加 `Growth Together` 轻量短句；
- active nav 使用完整圆角浅青绿 surface、深青绿文字和稳定 icon，不再主要依赖左边框；
- group header 与 child item 拉开层级，但不使用多色导航；
- 底部可加入一块低频、低对比的原创成长主题品牌卡，仅桌面展开态显示；不承载新功能；
- 初期保留现有 220px/64px/1360px 等已验证尺寸，避免无必要的布局变化。

### Topbar

- 保留 breadcrumb、全局搜索、健康状态和账号菜单；
- 搜索入口升级为圆角搜索 surface，但不伪造不存在的快捷键或通知功能；
- 统一 Account Menu 与 Dialog/Popover 的圆角、阴影和 focus；
- 保持 sticky 高度和 DOM identity，不能引入 route transition。

### PageContainer

- 背景改为冷白/浅灰蓝 canvas，可使用固定、极淡、不可交互的 ambient glow；
- 保留最大宽度、scrollbar gutter 和 overflow 约束；
- decoration 不得参与内容高度计算，避免路由切换 layout shift。

## 7. 基础组件改造计划

### Button / Input / Form

- Button 保留 primary/secondary/ghost/danger/icon，统一 10–12px 圆角、focus ring、pressed 和 disabled；
- Primary 可使用克制的青绿渐变或品牌 shadow，但每个区域只保留一个主 CTA；
- 建立 Select、Textarea、SearchField，替换视觉重复，不改变 form name、value、validation 或 submit 行为；
- 触控目标保持至少 40px，mobile 高频操作优先 44px。

### Panel / Card

- 默认卡片使用极淡 border + 柔和 shadow；
- major card 使用 18–20px 圆角，small card 使用 14–16px；
- 只有可交互卡片有 hover elevation；静态卡片不能产生误导；
- header divider 降低对比，更多依靠间距建立区块。

### Tabs / Segmented Controls

- 一级页面 Tab：浅色轨道 + 白色 active surface + 轻 shadow/brand underline；
- 时间范围/局部筛选：更紧凑的 pill，active 可使用品牌实色；
- 趋势指标：最弱层级，使用 outline/chip；
- 保留 Radix keyboard semantics 和窄屏横向滚动。

### Metric Card

新增统一结构：icon、label、value、可选真实辅助信息。tone 映射只增强识别，不替代文字：

```text
开启对话  mint/teal
深入对话  blue
分享故事  coral
筛选      yellow/orange
会面      purple
```

不生成后端不存在的环比；没有比较数据时不显示“较上期 0%”。

### Empty / Loading / Error

- EmptyState 使用一套原创轻量 SVG 语言：叶片、路径、小山、太阳、图表；
- 插画为装饰时 `aria-hidden`，标题和说明仍是信息源；
- CTA 必须指向真实已有流程；
- Skeleton 保持 PageHeader 和主体最小几何稳定，不新增全屏 spinner；
- ErrorState 保持高对比和重试能力，不以装饰弱化错误。

### Dialog / Sheet / Table / Overlay

- 只升级 surface、圆角、阴影、header/footer 和 responsive spacing；
- 保留 focus trap、Escape、滚动、safe area 和既有宽度约束；
- Table 减弱网格线、增加轻量 row hover，保留移动端横向滚动；
- Search Overlay、Account Menu 与后续 tooltip 使用同一 overlay token。

## 8. UI-B 第一批样板页实施方案

UI-B 第一批严格只包含：首页、数据统计、梦想与目标。其他页面只会因 UI-A 共享组件升级获得基础视觉变化，不做页面特化。

### 8.1 首页 `/app`

- 将自定义 header 对齐 PageHeader/hero contract，但保留问候、日期与当前信息结构；
- 使用青绿 + 暖黄的轻量成长氛围，不新增数据字段；
- 今日计划、当前目标保留双列和 216px 内部滚动；
- 经营进度改用统一 MetricCard/MetricGrid；
- 经营摘要保持团队、学习、财务三个真实入口；
- 空内容使用统一小型 EmptyState，不扩大首屏高度；
- mobile 保持单列、Bottom Nav 和 CTA 可触达。

### 8.2 数据统计 `/app/analytics`

- PageHeader 使用最完整的“经营分析”成长主题 hero，是参考图的主验证页；
- 保留五个领域 Tab、五个时间范围和自定义日期逻辑；
- 将时间范围切换改为二级 SegmentedControl，保持 toolbar 稳定高度；
- KPI 使用五种受控 tone 和 Lucide icon，不显示不存在的趋势数据；
- 保留当前 KPI → 趋势 → 结构 → 明细布局，不改 analytics query 与统计口径；
- 现有轻量 CSS bar chart 先用统一 palette、圆角、弱 grid 和 tooltip 视觉增强，不为本轮引入重型图表库；
- 单周期和无数据状态使用统一 EmptyState + 真实 CTA（可指向今日工作）；
- 保持 `placeholderData` 只在本页筛选/范围切换中使用，不扩大到全局。

### 8.3 梦想与目标 `/app/goals`

- 主题使用紫 + 粉/珊瑚 + 青绿，但正文和表单保持中性；
- 保留目标地图、目标列表、梦想板三个 Tab 和原有业务流程；
- React Flow 节点样式改为读取设计 token，保留选中路径、缩放和点击逻辑；
- 梦想卡片使用更大圆角、图片渐变蒙层、关联目标 badge 和清晰操作区；
- 梦想空状态采用更有情绪但克制的原创插画；
- 目标进度条、状态 badge 和详情 Sheet 使用全局组件；
- 不改变目标树、parent_id、自动进度、图片排序、上传和删除行为。

## 9. 页面特化与全局边界

页面可以特化：

- PageHeader tone 和装饰主题；
- KPI 的业务 icon/tone；
- 图表 palette；
- 梦想图片卡片、React Flow 节点、日历 event 等领域视觉；
- 空状态文案和真实 CTA。

页面不得自行特化：

- 基础色值、圆角、阴影、focus ring；
- Button/Input/Select/Textarea/Dialog/Sheet 的基础状态；
- 一级 Tab、二级 segmented、通知条、通用 EmptyState 的结构；
- Shell、PageContainer、mobile navigation 的几何与生命周期；
- 页面切换、loading 或 route-level 动画。

## 10. 预计影响文件

### UI-A：Design System + App Shell

```text
frontend/tailwind.config.ts
frontend/src/index.css
frontend/src/components/layout/navigation.tsx
frontend/src/components/layout/account-menu.tsx
frontend/src/components/ui/button.tsx
frontend/src/components/ui/input.tsx
frontend/src/components/ui/badge.tsx
frontend/src/components/ui/panel.tsx
frontend/src/components/ui/tabs.tsx
frontend/src/components/ui/page-header.tsx
frontend/src/components/ui/state-block.tsx
frontend/src/components/ui/dialog.tsx
frontend/src/components/ui/sheet.tsx
frontend/src/components/ui/table.tsx
frontend/src/components/ui/ui-components.test.tsx
frontend/src/components/layout/navigation.test.tsx
```

可能新增：

```text
frontend/src/components/ui/select.tsx
frontend/src/components/ui/textarea.tsx
frontend/src/components/ui/segmented-control.tsx
frontend/src/components/ui/metric-card.tsx
frontend/src/components/ui/notice.tsx
frontend/src/components/brand/*
frontend/src/assets/brand/*.svg
```

### UI-B：三个样板页

```text
frontend/src/features/dashboard/dashboard-page.tsx
frontend/src/features/dashboard/dashboard-page.test.tsx
frontend/src/features/analytics/analytics-page.tsx
frontend/src/features/analytics/analytics-page.test.tsx
frontend/src/features/goals/goals-page.tsx
frontend/src/features/goals/goals-page.test.tsx
```

### UI-C：核心业务页

```text
frontend/src/features/worklog/*
frontend/src/features/calendar/*
frontend/src/features/team/*
frontend/src/features/knowledge/*
frontend/src/features/finance/*
frontend/src/features/income/*
frontend/src/features/reviews/*
```

### UI-D：工具与长尾页

```text
frontend/src/features/importexport/*
frontend/src/features/auth/*
frontend/src/features/search/*
frontend/src/features/admin/*
frontend/src/features/placeholder/*
frontend/src/layouts/auth-layout.tsx
frontend/e2e/*
```

任何实施批次都不应修改 `backend/`、migration、OpenAPI 生成代码或业务 API。

## 11. UI-A / UI-B / UI-C / UI-D 执行顺序

### UI-A：Design System + App Shell

1. 建立语义 tokens 和辅助色规则；
2. 改造 Button、Input、Select、Textarea、Badge、Panel、Tabs、SegmentedControl；
3. 建立 MetricCard、Notice、统一 Empty/Loading/Error；
4. 统一 Dialog、Sheet、Table、overlay surface；
5. 升级 Brand、Sidebar、Topbar、PageContainer；
6. 对共享组件做独立展示页或测试夹具检查；
7. 真实 Chromium 截图：App Shell 1440px 与 390px；
8. 产品负责人确认全局视觉语言后进入 UI-B。

UI-A 不逐页添加渐变或插画，不处理页面特有图表、梦想卡片、日历和团队节点。

### UI-B：代表页面视觉验证

第一批只做：

1. 首页；
2. 数据统计；
3. 梦想与目标。

每页完成 1440px desktop 与 390px mobile before/after 截图，同时检查 1280px、1024px 无溢出。产品负责人确认色彩、圆角、品牌装饰、KPI 和空状态方向后，才能扩散。

### UI-C：核心业务页面

按风险从高到低：

1. 日历：只换 toolbar/event/today/hover surface，不改时间与拖放逻辑；
2. 团队：只换节点、连线、背景和详情 surface，不改 React Flow 数据/交互；
3. 今日工作；
4. 学习中心；
5. 财务；
6. 收入模拟；
7. 复盘。

每个页面使用 UI-A primitives 和已确认的页面 tone，不新增页面私有设计系统。

### UI-D：工具、认证、管理端与最终收尾

1. 导入/导出、设置、搜索；
2. 登录/注册；
3. 管理员页面；
4. Placeholder、404/错误状态、全站 Loading/Empty/Error；
5. 清理仍存在的重复视觉 class；
6. 全视口、全路由、生产构建视觉回归。

管理端沿用同一设计系统，但降低装饰和彩色 KPI 强度。

## 12. 截图与验收方案

每批使用真实应用、真实 Chromium，不使用重新生成的设计稿代替产品截图。

### 截图矩阵

| 阶段 | 1440px | 390px | 补充视口 |
| --- | --- | --- | --- |
| UI-A | Shell、Sidebar、Topbar、Dialog/Sheet/Empty | Drawer、Bottom Nav、公共控件 | 1280、1024 |
| UI-B | 首页、数据统计、梦想与目标 | 同三页 | 1280、1024 |
| UI-C | 日历、团队、财务及其余核心页 | 日历、团队、财务重点 | 1280、1024 |
| UI-D | 工具、认证、管理端 | 同类关键页 | 768、1024、1280 |

### 视觉验收点

- 页面背景、surface、圆角、阴影和辅助色遵循 token；
- Page Header 有品牌感但不压缩业务首屏；
- 同页只有 1 个主要 CTA；
- KPI 数值清晰，颜色不是唯一语义；
- 空状态有标题、解释和真实可用 CTA；
- 文字、icon、focus 与状态颜色满足可读性；
- 390px 无横向溢出，Drawer/Bottom Nav/Sheet 不回归；
- 1440/1280/1024 下不因装饰造成布局跳动；
- Sidebar、Topbar、PageContainer 在路由切换时保持 DOM identity；
- 无 console error、pageerror 或新资源加载导致的闪动。

## 13. 自动化回归方案

每批至少执行：

```bash
make lint
make test
make build
make test-e2e
git diff --check
```

UI-A/B 需要补充或调整：

- token/variant 和可访问状态的组件测试；
- Sidebar active、展开/收起、Drawer、Bottom Nav；
- Tabs/Segmented keyboard 与窄屏横向滚动；
- PageHeader decoration 不改变标题可访问性；
- EmptyState CTA、Dialog/Sheet focus 和 safe area；
- 首页、统计、梦想目标在 1440/1280/1024/390px 无横向溢出；
- route stability、Shell DOM identity、Page Header 不消失；
- console/pageerror 为零。

最终 UI-D 完成后执行完整门禁：

```bash
make generate
make lint
make test
make build
make check
make test-integration
make test-e2e
make test-performance
git diff --check
make migrate-status
make migrate-test-status
```

## 14. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 全局 token 一次改变所有页面 | UI-A 先建立兼容层；按组件逐项替换并截图，不做全仓机械替换 |
| 装饰资源造成首屏抖动 | 使用内置、定尺寸、优化后的 SVG；不依赖远程字体或远程图片 |
| 彩色 KPI 造成可读性下降 | 数字保持深色；icon、label、辅助文案共同表达；检查对比度 |
| 圆角和 padding 降低信息密度 | 保留现有 grid/内容结构，只在关键卡片增加空间 |
| hover 动效引入闪动 | 只动画 transform/shadow/color，120–200ms；不动画页面高度和 route outlet |
| 公共组件改造破坏日历/团队 | UI-C 前保留其专用交互；只接入 surface/token，不重写第三方组件 |
| 测试绑死旧 Tailwind class | 改为语义 variant、ARIA 和几何稳定性断言 |
| 参考图诱导新增功能 | 只吸收视觉语言，不增加通知、趋势或不存在的 CTA |

## 15. 计划结论

现有代码具备稳定的 App Shell 和高复用公共组件，适合通过“UI-A 全局设计系统 → UI-B 三页样板 → UI-C 核心业务 → UI-D 长尾收口”推进。视觉升级的首要任务不是逐页增加彩色 CSS，而是先把色彩、surface、圆角、阴影、字体、motion、KPI、segmented control、notice 和空状态提升为可复用语义组件。

本阶段到此停止。等待产品负责人确认本计划后，再开始 UI-A 代码修改。
