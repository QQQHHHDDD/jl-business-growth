import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  Filter,
  Handshake,
  Leaf,
  MessageCircleMore,
  MessagesSquare,
  Sparkles,
  Star,
  Target,
  UsersRound,
  Volume2,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { getAnalytics, getFinanceAnalytics, getTeamAnalytics, type AnalyticsResponse, type AuthResponse } from "@/api/client";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DataTable, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessRange, type BusinessRangePreset } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Metric = "worklogs" | "turnover" | "goals" | "team" | "finance";
type Range = BusinessRangePreset | "custom";
type Bucket = AnalyticsResponse["data"]["buckets"][number];
type ActionField = "open_conversation_count" | "deep_conversation_count" | "story_share_count" | "screening_count" | "meeting_count";

const metricLabels: Record<Metric, string> = { worklogs: "工作量", turnover: "营业额", goals: "目标", team: "团队", finance: "财务" };
const actionLabels: Record<ActionField, string> = {
  open_conversation_count: "开启对话",
  deep_conversation_count: "深入对话",
  story_share_count: "分享故事",
  screening_count: "筛选",
  meeting_count: "会面",
};

const rangeItems = [
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "calendarYear", label: "自然年" },
  { value: "fiscalYear", label: "财年" },
  { value: "custom", label: "自定义" },
] as const;

type KpiTone = "brand" | "blue" | "purple" | "coral" | "amber" | "neutral";
type KpiSpec = { label: string; value: ReactNode; tone: KpiTone; icon: ReactNode };

function AnalyticsHero() {
  return (
    <section className="relative isolate overflow-hidden rounded-hero border border-white/80 bg-gradient-to-r from-brand-50/90 via-sky-50/65 to-brand-50/80 px-5 py-5 shadow-card ring-1 ring-brand-100/70 sm:px-7 sm:py-6">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] opacity-75 [mask-image:linear-gradient(to_right,transparent,black_28%)] sm:block" aria-hidden="true">
        <svg viewBox="0 0 620 180" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <path d="M0 146C74 122 98 132 158 102C211 75 248 91 302 112C354 132 379 87 433 78C485 69 504 105 620 34V180H0V146Z" fill="url(#analytics-hero-fill)" />
          <path d="M66 144C122 122 168 122 211 102C259 80 291 102 330 116C376 132 410 88 453 82C504 75 548 99 608 54" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" />
          <circle cx="502" cy="31" r="11" fill="url(#analytics-sun-fill)" stroke="#F59E0B" strokeWidth="1.5" />
          <g stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" opacity=".86">
            <path d="M502 10V4" /><path d="M502 52V58" />
            <path d="M481 31H475" /><path d="M523 31H529" />
            <path d="M488 17L483 12" /><path d="M516 45L521 50" />
            <path d="M516 17L521 12" /><path d="M488 45L483 50" />
            <path d="M494 11L492 7" /><path d="M510 51L512 55" />
          </g>
          <path d="M390 146C399 130 408 117 418 106C425 119 430 130 434 146" fill="#0F766E" fillOpacity=".6" />
          <path d="M418 106C412 95 402 91 392 93C400 105 409 110 418 110M419 100C427 88 438 85 448 89C440 101 430 106 419 106" fill="#34D399" fillOpacity=".72" />
          <defs>
            <linearGradient id="analytics-hero-fill" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#CCFBF1" stopOpacity=".78" />
              <stop offset="1" stopColor="#DBEAFE" stopOpacity=".28" />
            </linearGradient>
            <radialGradient id="analytics-sun-fill" cx="0" cy="0" r="1" gradientTransform="translate(502 31) rotate(90) scale(11)">
              <stop stopColor="#FDE68A" />
              <stop offset="1" stopColor="#FACC15" stopOpacity=".82" />
            </radialGradient>
          </defs>
        </svg>
      </div>
      <PageHeader
        className="relative z-[1] max-w-2xl border-0 pb-0 sm:min-h-[132px] sm:items-center"
        eyebrow="经营分析"
        title="数据统计"
        description="按业务领域和时间范围查看当前账号已记录的数据。"
      />
      <div className="relative z-[1] mt-3 flex items-center gap-2 text-xs font-semibold text-brand-700 sm:mt-0" aria-hidden="true">
        <Leaf size={14} />
        <span>每一次记录，都会成为下一步行动的线索</span>
      </div>
    </section>
  );
}

export function AnalyticsPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const timezone = authResponse.data.account.timezone;
  const [metric, setMetric] = useState<Metric>("worklogs");
  const [range, setRange] = useState<Range>("week");
  const month = businessRange(timezone, "month");
  const [customFrom, setCustomFrom] = useState(month.from);
  const [customTo, setCustomTo] = useState(month.to);
  const selected = range === "custom"
    ? { from: customFrom, to: customTo, granularity: "day" as const }
    : businessRange(timezone, range);
  const query = useQuery({
    queryKey: ["user", accountId, "analytics", metric, selected.from, selected.to, selected.granularity],
    queryFn: () => metric === "finance"
      ? getFinanceAnalytics(selected.from, selected.to, selected.granularity)
      : metric === "team"
        ? getTeamAnalytics(selected.from, selected.to, selected.granularity)
        : getAnalytics(metric, selected.from, selected.to, selected.granularity),
    placeholderData: (previousData) => previousData,
  });

  return <div className="space-y-6">
    <AnalyticsHero />
    <Tabs value={metric} onValueChange={(value) => setMetric(value as Metric)}>
      <TabsList aria-label="统计领域" className="w-fit rounded-card border border-outline/55 bg-surface-muted/80 p-1.5 shadow-hairline">
        <TabsTrigger value="worklogs" className="min-h-10 rounded-control px-4 data-[state=active]:shadow-card">工作量</TabsTrigger>
        <TabsTrigger value="turnover" className="min-h-10 rounded-control px-4 data-[state=active]:shadow-card">营业额</TabsTrigger>
        <TabsTrigger value="goals" className="min-h-10 rounded-control px-4 data-[state=active]:shadow-card">目标</TabsTrigger>
        <TabsTrigger value="team" className="min-h-10 rounded-control px-4 data-[state=active]:shadow-card">团队</TabsTrigger>
        <TabsTrigger value="finance" className="min-h-10 rounded-control px-4 data-[state=active]:shadow-card">财务</TabsTrigger>
      </TabsList>
    </Tabs>
    <div data-testid="analytics-range-toolbar" className="grid min-h-[76px] items-center gap-3 rounded-card border border-outline/55 bg-surface/85 p-3 shadow-hairline lg:h-[88px] lg:grid-cols-[auto_minmax(320px,1fr)_auto]">
      <SegmentedControl
        ariaLabel="统计时间范围"
        value={range}
        items={rangeItems}
        onValueChange={setRange}
        className="w-fit max-w-full rounded-full bg-surface-muted/70 p-1"
        variant="brand"
        buttonClassName="min-h-10 rounded-full px-4"
      />
      <div data-testid="analytics-range-condition" className="flex min-h-10 items-center justify-start">
        {range === "custom" && <div className="flex flex-col gap-2 sm:flex-row"><DateField label="开始日期" value={customFrom} onChange={setCustomFrom} /><DateField label="结束日期" value={customTo} onChange={setCustomTo} /></div>}
      </div>
      <p className="whitespace-nowrap text-xs font-medium text-ink-faint lg:text-right"><CalendarDays size={13} className="mr-1 inline-block" aria-hidden="true" />{selected.from} 至 {selected.to}</p>
    </div>
    {query.isPending ? <LoadingState label="正在计算统计" /> : query.isError ? <ErrorState message="统计暂时无法加载" onRetry={() => void query.refetch()} /> : query.data.data.buckets.length || metric === "team" ? <AnalyticsWorkspace metric={metric} data={query.data} /> : <div className="rounded-[1.25rem] border border-brand-100/70 bg-brand-50/25 p-2 shadow-hairline"><EmptyState className="border-brand-100/70 bg-surface/70 shadow-none" title={`${metricLabels[metric]}暂无统计记录`} description="在当前时间范围保存记录后，这里会显示统计结果。" /></div>}
  </div>;
}

function AnalyticsWorkspace({ metric, data }: { metric: Metric; data: AnalyticsResponse }) {
  const buckets = data.data.buckets;
  const [actionField, setActionField] = useState<ActionField>("open_conversation_count");
  const totals = useMemo(() => buckets.reduce((sum, bucket) => ({
    actions: sum.actions + bucket.action_count,
    open: sum.open + bucket.open_conversation_count,
    deep: sum.deep + bucket.deep_conversation_count,
    buffer: sum.buffer + bucket.buffer_count,
    story: sum.story + bucket.story_share_count,
    screening: sum.screening + bucket.screening_count,
    opportunity: sum.opportunity + bucket.opportunity_count,
    meeting: sum.meeting + bucket.meeting_count,
    followup: sum.followup + bucket.customer_followup_count,
    reading: sum.reading + bucket.reading_minutes,
    audio: sum.audio + bucket.audio_minutes,
    pv: sum.pv + Number(bucket.pv),
    net: sum.net + Number(bucket.net_amount),
    goals: sum.goals + bucket.goal_count,
    completed: sum.completed + bucket.completed_count,
    income: sum.income + Number(bucket.income_amount ?? 0),
    expense: sum.expense + Number(bucket.expense_amount ?? 0),
  }), { actions: 0, open: 0, deep: 0, buffer: 0, story: 0, screening: 0, opportunity: 0, meeting: 0, followup: 0, reading: 0, audio: 0, pv: 0, net: 0, goals: 0, completed: 0, income: 0, expense: 0 }), [buckets]);
  const kpis: KpiSpec[] = metric === "worklogs"
    ? [
        { label: "开启对话", value: totals.open, tone: "brand", icon: <MessagesSquare size={20} /> },
        { label: "深入对话", value: totals.deep, tone: "blue", icon: <MessageCircleMore size={20} /> },
        { label: "分享故事", value: totals.story, tone: "coral", icon: <Star size={20} /> },
        { label: "筛选", value: totals.screening, tone: "amber", icon: <Filter size={20} /> },
        { label: "会面", value: totals.meeting, tone: "purple", icon: <Handshake size={20} /> },
      ]
    : metric === "turnover"
      ? [
          { label: "累计 PV", value: totals.pv, tone: "brand", icon: <ChartNoAxesColumnIncreasing size={20} /> },
          { label: "净营业额", value: formatMoney(totals.net.toFixed(2)), tone: "blue", icon: <CircleDollarSign size={20} /> },
          { label: "有记录周期", value: buckets.length, tone: "neutral", icon: <CalendarDays size={20} /> },
        ]
      : metric === "goals"
        ? [
            { label: "目标数", value: totals.goals, tone: "purple", icon: <Target size={20} /> },
            { label: "已完成", value: totals.completed, tone: "brand", icon: <Sparkles size={20} /> },
            { label: "完成率", value: totals.goals ? `${Math.round((totals.completed / totals.goals) * 100)}%` : "0%", tone: "blue", icon: <BarChart3 size={20} /> },
          ]
        : metric === "team"
          ? [
              { label: "当前成员数", value: data.data.current_member_count, tone: "blue", icon: <UsersRound size={20} /> },
              { label: "当前启用成员", value: data.data.current_active_member_count, tone: "brand", icon: <Leaf size={20} /> },
              { label: "所选周期快照数", value: data.data.snapshot_count, tone: "neutral", icon: <CalendarDays size={20} /> },
            ]
          : [
              { label: "收入", value: formatMoney(totals.income.toFixed(2)), tone: "brand", icon: <WalletCards size={20} /> },
              { label: "支出", value: formatMoney(totals.expense.toFixed(2)), tone: "coral", icon: <CircleDollarSign size={20} /> },
              { label: "净现金流", value: formatMoney((totals.income - totals.expense).toFixed(2)), tone: "blue", icon: <ChartNoAxesColumnIncreasing size={20} /> },
            ];

  return <div className="space-y-5">
    <div className={`grid gap-3 ${metric === "worklogs" ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
      {kpis.map((kpi) => <MetricCard key={kpi.label} {...kpi} className="relative overflow-hidden rounded-[1.25rem] border-outline/45 bg-gradient-to-br from-white/35 to-transparent shadow-[0_18px_38px_-28px_rgba(15,23,42,0.4)] before:pointer-events-none before:absolute before:-right-6 before:-top-7 before:h-24 before:w-24 before:rounded-full before:bg-white/35" iconClassName="h-11 w-11 rounded-[0.95rem] shadow-hairline ring-1 ring-white/60" valueClassName="text-[2.15rem] font-black" />)}
    </div>
    {metric === "team" && buckets.length === 0 ? <div className="rounded-[1.25rem] border border-brand-100/70 bg-brand-50/25 p-2 shadow-hairline"><EmptyState className="border-brand-100/70 bg-surface/70 shadow-none" title="所选周期暂无团队快照" description="创建团队快照后，这里会按快照展示成员规模变化。" /></div> : <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <Panel className="rounded-[1.25rem] border-outline/55 bg-surface/95 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.42)] [&>header]:border-b-0 [&>header]:pb-1 [&>div]:pt-3" title={`${metricLabels[metric]}趋势`} description={buckets.length > 1 ? "按所选时间范围连续展示变化。" : "保留当前周期数值，积累更多周期后可查看趋势。"}>
        {metric === "worklogs" && <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="趋势指标">{Object.entries(actionLabels).map(([value, label]) => <button key={value} type="button" aria-pressed={actionField === value} onClick={() => setActionField(value as ActionField)} className={cn("min-h-10 rounded-control border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", actionField === value ? "border-brand-300 bg-brand-50 text-brand-800" : "border-outline bg-surface text-ink-muted hover:bg-surface-muted")}>{label}</button>)}</div>}
        <Chart buckets={buckets} metric={metric} actionField={actionField} />
      </Panel>
      <Panel className="rounded-[1.25rem] border-outline/55 bg-surface/95 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.42)] [&>header]:border-b-0 [&>header]:pb-1 [&>div]:pt-3" title="结构摘要" description="汇总所选范围内的关键结果。"><Structure metric={metric} totals={totals} data={data.data} /></Panel>
    </div>}
    {buckets.length > 0 && <Panel className="rounded-[1.125rem] border-outline/50 bg-surface/90 shadow-hairline [&>header]:border-b-0 [&>header]:pb-1 [&>div]:pt-3" title="统计明细" description="查看各周期的具体数值。"><Details metric={metric} buckets={buckets} /></Panel>}
  </div>;
}

function chartValue(bucket: Bucket, metric: Metric, actionField: ActionField) {
  if (metric === "finance") return Math.max(Math.abs(Number(bucket.net_cash_flow ?? 0)), Number(bucket.income_amount ?? 0), Number(bucket.expense_amount ?? 0));
  if (metric === "team") return bucket.member_count ?? 0;
  if (metric === "turnover") return Number(bucket.net_amount);
  if (metric === "goals") return bucket.goal_count;
  return bucket[actionField];
}

function GrowthEmptyState({ description = "再记录几个周期后，这里会逐渐形成你的成长轨迹。" }: { description?: string }) {
  return (
    <div className="flex min-h-[268px] flex-col items-center justify-center px-4 py-8 text-center">
      <svg width="120" height="94" viewBox="0 0 104 82" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M7 68C25 56 31 45 47 51C61 56 66 32 78 35C90 38 93 26 98 18" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" />
        <path d="M7 68H98" stroke="#CCFBF1" strokeWidth="6" strokeLinecap="round" />
        <path d="M44 48C41 39 35 35 28 35C31 44 37 50 44 53M45 45C49 35 57 31 64 33C60 42 53 47 45 49" fill="#6EE7B7" fillOpacity=".78" />
        <path d="M78 35V20" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" />
        <path d="M78 21C84 17 90 18 94 22C88 26 83 26 78 24" fill="#A7F3D0" />
        <circle cx="22" cy="20" r="8" fill="#FEF3C7" />
        <path d="M22 8V4M22 36V32M10 20H6M38 20H34M13.5 11.5L10.5 8.5M30.5 28.5L27.5 25.5M30.5 11.5L33.5 8.5M13.5 28.5L16.5 25.5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h3 className="mt-3 text-base font-bold text-ink">暂无趋势</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-ink-muted">{description}</p>
      <Button asChild size="md" className="mt-5 min-h-11 px-5 shadow-brand-glow">
        <Link to="/app/worklog">去记录工作量 <ArrowRight size={15} /></Link>
      </Button>
    </div>
  );
}

function Chart({ buckets, metric, actionField }: { buckets: Bucket[]; metric: Metric; actionField: ActionField }) {
  if (buckets.length === 0) return <GrowthEmptyState description="调整时间范围，或先记录一些工作量，成长轨迹会从这里开始。" />;
  const values = buckets.map((bucket) => chartValue(bucket, metric, actionField));
  if (buckets.length === 1) return <GrowthEmptyState />;
  const max = Math.max(...values, 1);
  return <div className="relative min-h-[260px] pl-10" aria-label={`${metricLabels[metric]}趋势图`}><div className="absolute bottom-8 left-0 top-0 flex flex-col justify-between text-[10px] text-ink-faint"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div><div className="relative grid min-h-[228px] grid-cols-[repeat(auto-fit,minmax(42px,1fr))] items-end gap-2 border-b border-l border-outline px-2 pb-2 before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-dashed before:border-outline/70">{buckets.map((bucket, index) => <div key={bucket.period} className="relative z-[1] flex min-w-0 flex-col items-center gap-2"><span className="text-[10px] font-semibold text-ink-muted">{values[index]}</span><div className="w-full max-w-12 rounded-t bg-brand-500 shadow-brand-glow" style={{ height: `${Math.max(4, (values[index] / max) * 160)}px` }} title={`${bucket.period}: ${values[index]}`} /><span className="w-full truncate text-center text-[10px] text-ink-faint">{bucket.period}</span></div>)}</div></div>;
}

type Totals = { actions: number; open: number; deep: number; buffer: number; story: number; screening: number; opportunity: number; meeting: number; followup: number; reading: number; audio: number; pv: number; net: number; goals: number; completed: number; income: number; expense: number };

function Structure({ metric, totals, data }: { metric: Metric; totals: Totals; data: AnalyticsResponse["data"] }) {
  const rows: Array<{ label: string; value: ReactNode; icon: ReactNode; tone: string }> = metric === "worklogs"
    ? [
        { label: "Buffer", value: totals.buffer, icon: <Leaf size={16} />, tone: "bg-brand-50/75 text-brand-700" },
        { label: "提供机会", value: totals.opportunity, icon: <Sparkles size={16} />, tone: "bg-amber-50/75 text-amber-600" },
        { label: "顾客跟进", value: totals.followup, icon: <UsersRound size={16} />, tone: "bg-blue-50/75 text-blue-600" },
        { label: "阅读分钟", value: totals.reading, icon: <BookOpen size={16} />, tone: "bg-violet-50/75 text-violet-600" },
        { label: "音频分钟", value: totals.audio, icon: <Volume2 size={16} />, tone: "bg-rose-50/75 text-rose-600" },
      ]
    : metric === "turnover"
      ? [
          { label: "PV", value: totals.pv, icon: <ChartNoAxesColumnIncreasing size={16} />, tone: "bg-brand-50/75 text-brand-700" },
          { label: "净营业额", value: formatMoney(totals.net.toFixed(2)), icon: <CircleDollarSign size={16} />, tone: "bg-blue-50/75 text-blue-600" },
        ]
      : metric === "goals"
        ? [
            { label: "目标", value: totals.goals, icon: <Target size={16} />, tone: "bg-violet-50/75 text-violet-600" },
            { label: "完成", value: totals.completed, icon: <Sparkles size={16} />, tone: "bg-brand-50/75 text-brand-700" },
          ]
        : metric === "team"
          ? [
              { label: "当前成员", value: data.current_member_count, icon: <UsersRound size={16} />, tone: "bg-blue-50/75 text-blue-600" },
              { label: "当前启用", value: data.current_active_member_count, icon: <Leaf size={16} />, tone: "bg-brand-50/75 text-brand-700" },
              { label: "快照", value: data.snapshot_count, icon: <CalendarDays size={16} />, tone: "bg-amber-50/75 text-amber-600" },
            ]
          : [
              { label: "收入", value: formatMoney(totals.income.toFixed(2)), icon: <WalletCards size={16} />, tone: "bg-brand-50/75 text-brand-700" },
              { label: "支出", value: formatMoney(totals.expense.toFixed(2)), icon: <CircleDollarSign size={16} />, tone: "bg-rose-50/75 text-rose-600" },
            ];
  return <div className="space-y-2">{rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-3 rounded-control bg-surface-soft/55 px-3 py-2.5"><span className="flex min-w-0 items-center gap-3 text-sm font-medium text-ink-muted"><span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[0.875rem]", row.tone)} aria-hidden="true">{row.icon}</span><span className="truncate">{row.label}</span></span><strong className="shrink-0 tabular-nums text-lg font-black tracking-[-0.02em] text-ink">{row.value}</strong></div>)}</div>;
}

function Details({ metric, buckets }: { metric: Metric; buckets: Bucket[] }) {
  if (metric === "worklogs") return <DataTable><TableHead><TableRow><TableCell asHeader>周期</TableCell><TableCell asHeader>开启 / 深入</TableCell><TableCell asHeader>Buffer / 分享</TableCell><TableCell asHeader>筛选 / 机会</TableCell><TableCell asHeader>会面 / 跟进</TableCell><TableCell asHeader>阅读 / 音频</TableCell></TableRow></TableHead><TableBody>{buckets.map((bucket) => <TableRow key={bucket.period}><TableCell className="font-semibold">{bucket.period}</TableCell><TableCell className="tabular-nums">{bucket.open_conversation_count} / {bucket.deep_conversation_count}</TableCell><TableCell className="tabular-nums">{bucket.buffer_count} / {bucket.story_share_count}</TableCell><TableCell className="tabular-nums">{bucket.screening_count} / {bucket.opportunity_count}</TableCell><TableCell className="tabular-nums">{bucket.meeting_count} / {bucket.customer_followup_count}</TableCell><TableCell className="tabular-nums">{bucket.reading_minutes} / {bucket.audio_minutes}</TableCell></TableRow>)}</TableBody></DataTable>;
  return <DataTable><TableHead><TableRow><TableCell asHeader>周期</TableCell><TableCell asHeader>{metric === "finance" ? "收入" : metric === "team" ? "快照成员" : metric === "goals" ? "目标数" : "PV"}</TableCell><TableCell asHeader>{metric === "finance" ? "支出" : metric === "team" ? "快照启用成员" : metric === "goals" ? "已完成" : "净营业额"}</TableCell>{metric === "finance" && <TableCell asHeader>净现金流</TableCell>}</TableRow></TableHead><TableBody>{buckets.map((bucket) => <TableRow key={bucket.period}><TableCell className="font-semibold">{bucket.period}</TableCell><TableCell className="tabular-nums">{metric === "finance" ? formatMoney(bucket.income_amount) : metric === "team" ? bucket.member_count ?? 0 : metric === "goals" ? bucket.goal_count : bucket.pv}</TableCell><TableCell className="tabular-nums">{metric === "finance" ? formatMoney(bucket.expense_amount) : metric === "team" ? bucket.active_member_count ?? 0 : metric === "goals" ? bucket.completed_count : formatMoney(bucket.net_amount)}</TableCell>{metric === "finance" && <TableCell className="tabular-nums">{formatMoney(bucket.net_cash_flow)}</TableCell>}</TableRow>)}</TableBody></DataTable>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted"><span>{label}</span><input aria-label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-10 rounded-full border border-outline/70 bg-surface-soft px-3 text-sm text-ink shadow-hairline" /></label>;
}
