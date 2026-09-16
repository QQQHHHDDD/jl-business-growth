import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  Goal as GoalIcon,
  Plus,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  Account,
  AuthResponse,
  DashboardResponse,
  Goal,
} from "@/api/client";
import { getDashboard } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ErrorState, LoadingState } from "@/components/ui/state-block";
import { businessDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";

function dateInTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dashboardDateLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function greeting(timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(new Date()),
  );
  if (hour < 11) return "上午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function eventTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(new Date(value));
}

function GoalProgress({ goal }: { goal: Goal }) {
  const progress = Math.max(0, Math.min(100, Math.round(goal.progress * 100)));
  return (
    <div className="border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {goal.title}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {goal.metrics.length
              ? `${goal.metrics.length} 个量化指标`
              : "未设置量化指标"}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-teal-800">
          {progress}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-600"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function OperatingMetric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
        {value}
        <span className="ml-1 text-xs font-medium text-slate-400">
          {suffix}
        </span>
      </p>
    </div>
  );
}

function SummaryLink({
  href,
  icon: Icon,
  label,
  value,
  detail,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      to={href}
      className="group flex items-start gap-3 rounded-lg px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-500">
          {label}
        </span>
        <strong className="mt-1 block truncate text-lg font-bold tabular-nums text-slate-950">
          {value}
        </strong>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {detail}
        </span>
      </span>
      <ArrowRight
        size={16}
        className="mt-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-700"
      />
    </Link>
  );
}

export function DashboardPage({
  account,
}: {
  account: Account;
  authResponse: AuthResponse;
}) {
  const date = businessDate(account.timezone);
  const dashboardQuery = useQuery({
    queryKey: ["user", account.id, "dashboard", date],
    queryFn: () => getDashboard(date),
  });
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-slate-950">
            {greeting(account.timezone)}，{account.username}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            今天优先看计划、目标和经营进度。
          </p>
        </div>
        <time className="text-sm font-semibold text-slate-500" dateTime={date}>
          {dashboardDateLabel(date)}
        </time>
      </header>
      {dashboardQuery.isPending && <LoadingState label="正在加载今日工作台" />}
      {dashboardQuery.isError && (
        <ErrorState
          message="工作台数据暂时无法加载"
          onRetry={() => void dashboardQuery.refetch()}
        />
      )}
      {dashboardQuery.data && (
        <DashboardContent
          data={dashboardQuery.data}
          timezone={account.timezone}
        />
      )}
    </div>
  );
}

function DashboardContent({
  data,
  timezone,
}: {
  data: DashboardResponse;
  timezone: string;
}) {
  const { date, week, month } = data.data;
  const todayEvents = data.data.upcoming_events
    .filter((event) => dateInTimezone(event.start_at, timezone) === date)
    .slice(0, 4);
  const activeGoals = data.data.active_goals.slice(0, 3);
  const learningMinutes =
    data.data.learning_summary.reading_minutes +
    data.data.learning_summary.audio_minutes;
  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          title="今日计划"
          description={
            todayEvents.length
              ? `${todayEvents.length} 项安排`
              : "今天还没有安排"
          }
          action={
            <Button asChild variant="secondary" size="sm">
              <Link to="/app/calendar">
                <Plus size={15} />
                添加日程
              </Link>
            </Button>
          }
        >
          {todayEvents.length ? (
            <div>
              {todayEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-4 border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0"
                >
                  <time className="w-12 shrink-0 text-sm font-bold tabular-nums text-teal-800">
                    {eventTime(event.start_at, timezone)}
                  </time>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {event.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      至 {eventTime(event.end_at, timezone)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-5 text-sm text-slate-500">
              <CalendarDays size={18} className="text-teal-700" />
              今天暂无日程，可以留出时间推进最重要的目标。
            </div>
          )}
        </Panel>
        <Panel
          title="当前目标"
          description={
            activeGoals.length ? "优先推进的进行中目标" : "还没有进行中的目标"
          }
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/goals">
                查看全部
                <ArrowRight size={15} />
              </Link>
            </Button>
          }
        >
          {activeGoals.length ? (
            <div>
              {activeGoals.map((goal) => (
                <GoalProgress key={goal.id} goal={goal} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-5 text-sm text-slate-500">
              <GoalIcon size={18} className="text-teal-700" />
              建立目标后，这里会显示真实完成进度。
            </div>
          )}
        </Panel>
      </div>

      <section
        className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-panel"
        aria-labelledby="weekly-operations-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="weekly-operations-title"
              className="text-base font-bold text-slate-950"
            >
              经营进度
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              分别查看本周行动、本周 PV 和本月 PV。
            </p>
          </div>
          <Link
            to="/app/analytics"
            className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900"
          >
            查看统计
            <ArrowRight size={15} />
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <OperatingMetric
            label="开启"
            value={week.worklogs.open_conversation_count}
            suffix="次"
          />
          <OperatingMetric
            label="深入"
            value={week.worklogs.deep_conversation_count}
            suffix="次"
          />
          <OperatingMetric
            label="Buffer"
            value={week.worklogs.buffer_count}
            suffix="次"
          />
          <OperatingMetric
            label="会面"
            value={week.worklogs.meeting_count}
            suffix="次"
          />
          <OperatingMetric
            label="本周 PV"
            value={week.turnover.pv.toLocaleString("zh-CN")}
          />
          <OperatingMetric
            label="本月 PV"
            value={month.turnover.pv.toLocaleString("zh-CN")}
          />
        </div>
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-panel"
        aria-labelledby="business-summary-title"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2
            id="business-summary-title"
            className="text-base font-bold text-slate-950"
          >
            经营摘要
          </h2>
          <span className="text-xs text-slate-400">本月与当前状态</span>
        </div>
        <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="py-2 md:pr-5">
            <SummaryLink
              href="/app/team"
              icon={Users}
              label="团队"
              value={`${data.data.team_summary.active_members} 位活跃`}
              detail={`共 ${data.data.team_summary.total_members} 位成员`}
            />
          </div>
          <div className="py-2 md:px-5">
            <SummaryLink
              href="/app/knowledge"
              icon={BookOpen}
              label="学习"
              value={`${learningMinutes} 分钟`}
              detail={`阅读 ${data.data.learning_summary.reading_minutes} / 音频 ${data.data.learning_summary.audio_minutes}`}
            />
          </div>
          <div className="py-2 md:pl-5">
            <SummaryLink
              href="/app/finance"
              icon={CircleDollarSign}
              label="财务"
              value={formatMoney(data.data.finance_summary.net_cash_flow)}
              detail={`收入 ${formatMoney(data.data.finance_summary.income)} · 支出 ${formatMoney(data.data.finance_summary.expense)}`}
            />
          </div>
        </div>
      </section>
    </>
  );
}
