import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getAnalytics, getFinanceAnalytics, getTeamAnalytics, type AnalyticsResponse, type AuthResponse } from "@/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { DataTable, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessRange, type BusinessRangePreset } from "@/lib/date";
import { formatMoney } from "@/lib/money";

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
  });

  return <div className="space-y-6">
    <PageHeader eyebrow="经营分析" title="数据统计" description="按业务领域和时间范围查看当前账号已记录的数据。" />
    <Tabs value={metric} onValueChange={(value) => setMetric(value as Metric)}><TabsList aria-label="统计领域"><TabsTrigger value="worklogs">工作量</TabsTrigger><TabsTrigger value="turnover">营业额</TabsTrigger><TabsTrigger value="goals">目标</TabsTrigger><TabsTrigger value="team">团队</TabsTrigger><TabsTrigger value="finance">财务</TabsTrigger></TabsList></Tabs>
    <div data-testid="analytics-range-toolbar" className="grid min-h-[76px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 lg:grid-cols-[auto_minmax(320px,1fr)_auto]">
      <div className="inline-flex flex-wrap gap-1" role="group" aria-label="统计时间范围">{([['week', '本周'], ['month', '本月'], ['calendarYear', '自然年'], ['fiscalYear', '财年'], ['custom', '自定义']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)} className={`min-h-9 rounded-md px-3 text-sm font-semibold ${range === value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}</div>
      <div data-testid="analytics-range-condition" className="flex min-h-10 items-center justify-start">{range === "custom" && <div className="flex flex-col gap-2 sm:flex-row"><DateField label="开始日期" value={customFrom} onChange={setCustomFrom} /><DateField label="结束日期" value={customTo} onChange={setCustomTo} /></div>}</div>
      <p className="whitespace-nowrap text-xs text-slate-500 lg:text-right">{selected.from} 至 {selected.to}</p>
    </div>
    {query.isPending ? <LoadingState label="正在计算统计" /> : query.isError ? <ErrorState message="统计暂时无法加载" onRetry={() => void query.refetch()} /> : query.data.data.buckets.length || metric === "team" ? <AnalyticsWorkspace metric={metric} data={query.data} /> : <div className="min-h-[240px] rounded-lg border border-slate-200 bg-white"><EmptyState title={`${metricLabels[metric]}暂无统计记录`} description="在当前时间范围保存记录后，这里会显示统计结果。" /></div>}
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
  const kpis = metric === "worklogs"
    ? [["开启对话", totals.open], ["深入对话", totals.deep], ["分享故事", totals.story], ["筛选", totals.screening], ["会面", totals.meeting]]
    : metric === "turnover"
      ? [["累计 PV", totals.pv], ["净营业额", formatMoney(totals.net.toFixed(2))], ["有记录周期", buckets.length]]
      : metric === "goals"
        ? [["目标数", totals.goals], ["已完成", totals.completed], ["完成率", totals.goals ? `${Math.round((totals.completed / totals.goals) * 100)}%` : "0%"]]
        : metric === "team"
          ? [["当前成员数", data.data.current_member_count], ["当前启用成员", data.data.current_active_member_count], ["所选周期快照数", data.data.snapshot_count]]
          : [["收入", formatMoney(totals.income.toFixed(2))], ["支出", formatMoney(totals.expense.toFixed(2))], ["净现金流", formatMoney((totals.income - totals.expense).toFixed(2))]];

  return <div className="space-y-5">
    <div className={`grid gap-3 ${metric === "worklogs" ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-3"}`}>{kpis.map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div>)}</div>
    {metric === "team" && buckets.length === 0 ? <div className="min-h-[240px] rounded-lg border border-slate-200 bg-white"><EmptyState title="所选周期暂无团队快照" description="创建团队快照后，这里会按快照展示成员规模变化。" /></div> : <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <Panel title={`${metricLabels[metric]}趋势`} description={buckets.length > 1 ? "按所选时间范围连续展示变化。" : "保留当前周期数值，积累更多周期后可查看趋势。"}>
        {metric === "worklogs" && <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="趋势指标">{Object.entries(actionLabels).map(([value, label]) => <button key={value} type="button" aria-pressed={actionField === value} onClick={() => setActionField(value as ActionField)} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${actionField === value ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}>{label}</button>)}</div>}
        <Chart buckets={buckets} metric={metric} actionField={actionField} />
      </Panel>
      <Panel title="结构摘要" description="汇总所选范围内的关键结果。"><Structure metric={metric} totals={totals} data={data.data} /></Panel>
    </div>}
    {buckets.length > 0 && <Panel title="统计明细" description="查看各周期的具体数值。"><Details metric={metric} buckets={buckets} /></Panel>}
  </div>;
}

function chartValue(bucket: Bucket, metric: Metric, actionField: ActionField) {
  if (metric === "finance") return Math.max(Math.abs(Number(bucket.net_cash_flow ?? 0)), Number(bucket.income_amount ?? 0), Number(bucket.expense_amount ?? 0));
  if (metric === "team") return bucket.member_count ?? 0;
  if (metric === "turnover") return Number(bucket.net_amount);
  if (metric === "goals") return bucket.goal_count;
  return bucket[actionField];
}

function Chart({ buckets, metric, actionField }: { buckets: Bucket[]; metric: Metric; actionField: ActionField }) {
  if (buckets.length === 0) return <EmptyState title="当前范围没有趋势数据" description="调整时间范围或先保存相关记录。" />;
  const values = buckets.map((bucket) => chartValue(bucket, metric, actionField));
  if (buckets.length === 1) return <div className="grid min-h-[220px] place-items-center text-center"><div><p className="text-3xl font-bold text-slate-950">{values[0]}</p><p className="mt-2 text-sm font-semibold text-slate-700">{buckets[0].period}</p><p className="mt-3 text-sm text-slate-500">当前只有 1 个统计周期，数据不足以形成趋势。</p></div></div>;
  const max = Math.max(...values, 1);
  return <div className="relative min-h-[260px] pl-10" aria-label={`${metricLabels[metric]}趋势图`}><div className="absolute bottom-8 left-0 top-0 flex flex-col justify-between text-[10px] text-slate-400"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div><div className="grid min-h-[228px] grid-cols-[repeat(auto-fit,minmax(42px,1fr))] items-end gap-2 border-b border-l border-slate-200 px-2 pb-2">{buckets.map((bucket, index) => <div key={bucket.period} className="flex min-w-0 flex-col items-center gap-2"><span className="text-[10px] font-semibold text-slate-600">{values[index]}</span><div className="w-full max-w-12 rounded-t bg-teal-600" style={{ height: `${Math.max(4, (values[index] / max) * 160)}px` }} title={`${bucket.period}: ${values[index]}`} /><span className="w-full truncate text-center text-[10px] text-slate-500">{bucket.period}</span></div>)}</div></div>;
}

type Totals = { actions: number; open: number; deep: number; buffer: number; story: number; screening: number; opportunity: number; meeting: number; followup: number; reading: number; audio: number; pv: number; net: number; goals: number; completed: number; income: number; expense: number };

function Structure({ metric, totals, data }: { metric: Metric; totals: Totals; data: AnalyticsResponse["data"] }) {
  const rows = metric === "worklogs" ? [["Buffer", totals.buffer], ["提供机会", totals.opportunity], ["顾客跟进", totals.followup], ["阅读分钟", totals.reading], ["音频分钟", totals.audio]] : metric === "turnover" ? [["PV", totals.pv], ["净营业额", formatMoney(totals.net.toFixed(2))]] : metric === "goals" ? [["目标", totals.goals], ["完成", totals.completed]] : metric === "team" ? [["当前成员", data.current_member_count], ["当前启用", data.current_active_member_count], ["快照", data.snapshot_count]] : [["收入", formatMoney(totals.income.toFixed(2))], ["支出", formatMoney(totals.expense.toFixed(2))]];
  return <div className="space-y-3">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0"><span className="text-slate-600">{label}</span><strong>{value}</strong></div>)}</div>;
}

function Details({ metric, buckets }: { metric: Metric; buckets: Bucket[] }) {
  if (metric === "worklogs") return <DataTable><TableHead><TableRow><TableCell asHeader>周期</TableCell><TableCell asHeader>开启 / 深入</TableCell><TableCell asHeader>Buffer / 分享</TableCell><TableCell asHeader>筛选 / 机会</TableCell><TableCell asHeader>会面 / 跟进</TableCell><TableCell asHeader>阅读 / 音频</TableCell></TableRow></TableHead><TableBody>{buckets.map((bucket) => <TableRow key={bucket.period}><TableCell className="font-semibold">{bucket.period}</TableCell><TableCell>{bucket.open_conversation_count} / {bucket.deep_conversation_count}</TableCell><TableCell>{bucket.buffer_count} / {bucket.story_share_count}</TableCell><TableCell>{bucket.screening_count} / {bucket.opportunity_count}</TableCell><TableCell>{bucket.meeting_count} / {bucket.customer_followup_count}</TableCell><TableCell>{bucket.reading_minutes} / {bucket.audio_minutes}</TableCell></TableRow>)}</TableBody></DataTable>;
  return <DataTable><TableHead><TableRow><TableCell asHeader>周期</TableCell><TableCell asHeader>{metric === "finance" ? "收入" : metric === "team" ? "快照成员" : metric === "goals" ? "目标数" : "PV"}</TableCell><TableCell asHeader>{metric === "finance" ? "支出" : metric === "team" ? "快照启用成员" : metric === "goals" ? "已完成" : "净营业额"}</TableCell>{metric === "finance" && <TableCell asHeader>净现金流</TableCell>}</TableRow></TableHead><TableBody>{buckets.map((bucket) => <TableRow key={bucket.period}><TableCell className="font-semibold">{bucket.period}</TableCell><TableCell>{metric === "finance" ? formatMoney(bucket.income_amount) : metric === "team" ? bucket.member_count ?? 0 : metric === "goals" ? bucket.goal_count : bucket.pv}</TableCell><TableCell>{metric === "finance" ? formatMoney(bucket.expense_amount) : metric === "team" ? bucket.active_member_count ?? 0 : metric === "goals" ? bucket.completed_count : formatMoney(bucket.net_amount)}</TableCell>{metric === "finance" && <TableCell>{formatMoney(bucket.net_cash_flow)}</TableCell>}</TableRow>)}</TableBody></DataTable>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span>{label}</span><input aria-label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" /></label>;
}
