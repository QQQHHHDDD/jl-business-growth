import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, Goal as GoalIcon, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Account, AuthResponse, DashboardResponse, Goal } from "@/api/client";
import { getDashboard } from "@/api/client";
import { AccountSwitcher } from "@/features/dashboard/account-switcher";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { businessDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";

const quickLinks = [
  { href: "/app/worklog", title: "记录今日工作", description: "用一分钟沉淀今天的关键行动", icon: FileText },
  { href: "/app/turnover", title: "登记营业额", description: "同步记录 PV 和净营业额", icon: ArrowRight },
  { href: "/app/goals", title: "查看目标地图", description: "确认今天要推进的方向", icon: GoalIcon },
];

function worklogTotal(period: DashboardResponse["data"]["today"]): number {
  const values = period.worklogs;
  return values.open_conversation_count + values.deep_conversation_count + values.buffer_count + values.story_share_count + values.screening_count + values.opportunity_count + values.meeting_count + values.customer_followup_count;
}

function GoalProgress({ goal }: { goal: Goal }) {
  return <div className="space-y-2 border-b border-slate-100 pb-4 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{goal.title}</p><p className="mt-0.5 text-xs text-slate-500">{goal.metrics.length ? `${goal.metrics.length} 个量化指标` : "未设置量化指标"}</p></div><span className="shrink-0 text-sm font-bold text-teal-700">{Math.round(goal.progress * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, goal.progress * 100))}%` }} /></div></div>;
}

export function DashboardPage({ account, authResponse }: { account: Account; authResponse: AuthResponse }) {
  const date = businessDate(account.timezone);
  const dashboardQuery = useQuery({ queryKey: ["user", account.id, "dashboard", date], queryFn: () => getDashboard(date) });
  return <div className="space-y-7"><PageHeader eyebrow="今日工作台" title={account.username} description={`你好，${account.username}。这里汇总你的真实经营记录，业务日期按 ${account.timezone} 计算。`} action={<Button asChild variant="secondary"><Link to="/app/settings"><Settings2 size={16} />账号设置</Link></Button>} />
    {dashboardQuery.isPending && <LoadingState label="正在加载今日工作台" />}
    {dashboardQuery.isError && <ErrorState message="工作台数据暂时无法加载" onRetry={() => void dashboardQuery.refetch()} />}
    {dashboardQuery.data && <DashboardContent data={dashboardQuery.data} />}
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-950">快速入口</h2><span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Today</span></div><div className="grid gap-3 md:grid-cols-3">{quickLinks.map(({ href, title, description, icon: Icon }) => <Link key={href} to={href} className="group rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-md bg-teal-50 text-teal-700"><Icon size={18} /></span><ArrowRight size={17} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-teal-700" /></div><h3 className="mt-5 font-bold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></Link>)}</div></section>
    <AccountSwitcher authResponse={authResponse} />
  </div>;
}

function DashboardContent({ data }: { data: DashboardResponse }) {
  const { today, week, month } = data.data;
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Panel title="今日工作量"><p className="text-2xl font-bold text-slate-950">{worklogTotal(today)}</p><p className="mt-1 text-sm text-slate-500">个行动记录</p></Panel><Panel title="本周工作量"><p className="text-2xl font-bold text-slate-950">{worklogTotal(week)}</p><p className="mt-1 text-sm text-slate-500">个行动记录</p></Panel><Panel title="本月 PV"><p className="text-2xl font-bold text-slate-950">{month.turnover.pv.toLocaleString("zh-CN")}</p><p className="mt-1 text-sm text-slate-500">净营业额 {formatMoney(month.turnover.net_amount)}</p></Panel><Panel title="梦想数量"><p className="text-2xl font-bold text-slate-950">{data.data.dreams_count}</p><p className="mt-1 text-sm text-slate-500">已保存的方向</p></Panel></div><div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><Panel title="营业额节奏" description="营业额来自每日营业额唯一事实源。"><div className="grid gap-4 sm:grid-cols-3"><PeriodValue label="今日" pv={today.turnover.pv} amount={today.turnover.net_amount} /><PeriodValue label="本周" pv={week.turnover.pv} amount={week.turnover.net_amount} /><PeriodValue label="本月" pv={month.turnover.pv} amount={month.turnover.net_amount} /></div></Panel><Panel title="当前目标" description="进度由目标日期范围内的真实记录实时计算。">{data.data.active_goals.length ? <div className="space-y-4">{data.data.active_goals.map((goal) => <GoalProgress key={goal.id} goal={goal} />)}</div> : <EmptyState title="还没有进行中的目标" description="建立一个目标后，工作台会显示真实进度。" action={<Button asChild variant="secondary" size="sm"><Link to="/app/goals"><GoalIcon size={15} />建立目标</Link></Button>} />}</Panel></div><div className="grid gap-5 lg:grid-cols-2"><Panel title="接下来 7 天" description="来自日历中的真实安排。">{data.data.upcoming_events.length ? <div className="space-y-3">{data.data.upcoming_events.map((event) => <div key={event.id} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><div><p className="font-semibold text-slate-900">{event.title}</p><p className="mt-1 text-xs text-slate-500">{new Date(event.start_at).toLocaleString("zh-CN")} - {new Date(event.end_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p></div><Link className="text-sm font-semibold text-teal-700 hover:underline" to="/app/calendar">查看日历</Link></div>)}</div> : <EmptyState title="未来 7 天没有日程" description="创建一条日程后，这里会显示真实安排。" action={<Button asChild variant="secondary" size="sm"><Link to="/app/calendar">添加日程</Link></Button>} />}</Panel><Panel title="真实经营摘要" description="仅汇总当前账号已经保存的数据。"><div className="grid gap-3 sm:grid-cols-3"><SummaryValue label="团队成员" value={`${data.data.team_summary.active_members} / ${data.data.team_summary.total_members}`} /><SummaryValue label="学习时长" value={`${data.data.learning_summary.reading_minutes + data.data.learning_summary.audio_minutes} 分钟`} /><SummaryValue label="本月净现金流" value={formatMoney(data.data.finance_summary.net_cash_flow)} /></div><div className="mt-4 text-xs text-slate-500">本月收入 {formatMoney(data.data.finance_summary.income)}，支出 {formatMoney(data.data.finance_summary.expense)}。</div></Panel></div></>;
}

function PeriodValue({ label, pv, amount }: { label: string; pv: number; amount: string }) {
  return <div className="rounded-md bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-lg font-bold text-slate-950">{pv.toLocaleString("zh-CN")} PV</p><p className="mt-1 text-xs text-slate-500">{formatMoney(amount)}</p></div>;
}

function SummaryValue({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-lg font-bold text-slate-950">{value}</p></div>; }
