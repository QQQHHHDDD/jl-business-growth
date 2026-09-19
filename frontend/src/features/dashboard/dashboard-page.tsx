import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CircleDollarSign,
  Goal as GoalIcon,
  Layers3,
  Leaf,
  Plus,
  Send,
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

function GrowthHeroArt() {
  return (
    <svg
      className="pointer-events-none absolute bottom-0 right-0 h-full w-[58%] max-w-[600px] opacity-90 sm:w-[52%]"
      viewBox="0 0 620 190"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 150C83 139 113 92 192 99c67 6 81 46 141 43 72-4 93-74 166-66 55 6 63 44 121 25v89H0v-40Z"
        fill="url(#hero-hill)"
      />
      <path
        d="M96 166c84-40 137-55 222-50 76 4 133-20 210-58 27-13 51-28 76-44"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        opacity=".88"
      />
      <path
        d="M96 166c84-40 137-55 222-50 76 4 133-20 210-58"
        stroke="#a7f3d0"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g transform="translate(470 22)">
        <circle cx="44" cy="44" r="23" fill="#FCD34D" opacity=".95" />
        <circle cx="44" cy="44" r="35" stroke="#FBBF24" strokeWidth="2" opacity=".5" />
        <path d="M44 0v10M44 78v10M0 44h10M78 44H88M13 13l7 7M68 68l7 7M75 13l-7 7M20 68l-7 7" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(392 96) rotate(-8)">
        <path d="M16 66c4-27 7-47 22-66" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" />
        <path d="M35 25C56 7 71 10 79 14c-9 17-25 23-44 11Z" fill="#34d399" opacity=".85" />
        <path d="M25 43C5 27-8 32-16 39c11 15 24 17 41 12Z" fill="#6ee7b7" opacity=".8" />
      </g>
      <defs>
        <linearGradient id="hero-hill" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#99F6E4" stopOpacity=".8" />
          <stop offset="1" stopColor="#BAE6FD" stopOpacity=".55" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PlanEmptyIllustration() {
  return (
    <svg className="h-28 w-40" viewBox="0 0 160 112" fill="none" aria-hidden="true">
      <path d="M30 83c14-14 36-19 56-12 18 6 28 6 45-4 9-5 18-6 24-3v32H30V83Z" fill="#DBEAFE" opacity=".7" />
      <rect x="43" y="23" width="70" height="62" rx="9" transform="rotate(-6 43 23)" fill="#fff" stroke="#93C5FD" strokeWidth="3" />
      <path d="m58 39 38-4M59 52l32-3M60 65l18-2" stroke="#60A5FA" strokeWidth="4" strokeLinecap="round" />
      <path d="m50 20 3-10M71 18l1-11M92 17l-1-10" stroke="#0EA5E9" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 82c-7-16-17-20-27-18 3 15 12 22 27 23M118 78c10-13 20-14 29-8-7 13-16 17-29 15" fill="#6EE7B7" opacity=".8" />
    </svg>
  );
}

function GoalEmptyIllustration() {
  return (
    <svg className="h-28 w-40" viewBox="0 0 160 112" fill="none" aria-hidden="true">
      <path d="M19 86c26-16 44-15 65-8 19 6 42 4 58-8v30H19V86Z" fill="#EDE9FE" opacity=".85" />
      <circle cx="82" cy="52" r="28" fill="#EDE9FE" stroke="#A78BFA" strokeWidth="3" />
      <circle cx="82" cy="52" r="16" fill="#fff" stroke="#8B5CF6" strokeWidth="3" />
      <circle cx="82" cy="52" r="5" fill="#7C3AED" />
      <path d="M96 38 129 19l-11 29" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 86c-4-16-1-29 9-40M46 63c-11-6-18-5-25-1 8 10 16 12 26 10M51 53c4-11 11-16 19-17-1 11-8 18-18 21" stroke="#34D399" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
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
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon: typeof Send;
  tone: string;
}) {
  return (
    <div className={`min-w-0 rounded-card border px-3 py-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/75">
          <Icon size={16} />
        </span>
        <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums text-slate-950">
        {value}
        <span className="ml-1 text-xs font-medium text-slate-400">{suffix}</span>
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
  tone,
  iconTone,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
  tone: string;
  iconTone: string;
}) {
  return (
    <Link
      to={href}
      className={`group flex items-start gap-3 rounded-card border px-3 py-3 shadow-hairline transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${tone}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconTone}`}>
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
      <header className="relative isolate min-h-[190px] overflow-hidden rounded-hero border border-brand-100/70 bg-gradient-to-r from-brand-100/70 via-sky-50/75 to-amber-50/70 px-5 py-5 shadow-card sm:px-7 sm:py-6">
        <span className="pointer-events-none absolute -left-8 -top-10 h-36 w-36 rounded-full bg-white/60 blur-2xl" aria-hidden="true" />
        <GrowthHeroArt />
        <div className="relative z-10 max-w-[52%] sm:max-w-[46%]">
          <h1 className="text-[28px] font-bold leading-tight text-slate-950">
            {greeting(account.timezone)}，{account.username}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            今天优先看计划、目标和经营进度。
          </p>
          <time className="mt-1 block text-sm font-semibold text-slate-500" dateTime={date}>
            {dashboardDateLabel(date)}
          </time>
          <p className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-brand-800">
            <Leaf size={15} />持续行动，遇见更好的自己
          </p>
        </div>
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
    .filter((event) => dateInTimezone(event.start_at, timezone) === date);
  const activeGoals = data.data.active_goals;
  const learningMinutes =
    data.data.learning_summary.reading_minutes +
    data.data.learning_summary.audio_minutes;
  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          className="border-sky-200/75 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/75 shadow-card [&>header]:border-sky-200/65"
          title="今日计划"
          description={
            todayEvents.length
              ? `${todayEvents.length} 项安排`
              : "今天还没有安排"
          }
          action={<><Button asChild variant="ghost" size="sm"><Link to="/app/calendar">查看全部<ArrowRight size={15} /></Link></Button><Button asChild variant="secondary" size="sm"><Link to="/app/calendar"><Plus size={15} />添加日程</Link></Button></>}
        >
          {todayEvents.length ? (
            <div data-testid="dashboard-today-scroll" className="h-[216px] overflow-y-auto pr-2">
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
            <div data-testid="dashboard-today-scroll" className="flex h-[216px] flex-col items-center justify-center overflow-y-auto text-center text-sm text-slate-500">
              <PlanEmptyIllustration />
              <p className="mt-1 flex items-center gap-2">
                <CalendarDays size={17} className="text-sky-600" />
                今天暂无日程，可以留出时间推进最重要的目标。
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-4 border-sky-200 bg-white/80 text-sky-800 hover:border-sky-300 hover:bg-sky-50">
                <Link to="/app/calendar"><Plus size={15} />安排今天</Link>
              </Button>
            </div>
          )}
        </Panel>
        <Panel
          className="border-violet-200/70 bg-gradient-to-br from-white via-violet-50/55 to-brand-50/65 shadow-card [&>header]:border-violet-200/60"
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
            <div data-testid="dashboard-goals-scroll" className="h-[216px] overflow-y-auto pr-2">
              {activeGoals.map((goal) => (
                <GoalProgress key={goal.id} goal={goal} />
              ))}
            </div>
          ) : (
            <div data-testid="dashboard-goals-scroll" className="flex h-[216px] flex-col items-center justify-center overflow-y-auto text-center text-sm text-slate-500">
              <GoalEmptyIllustration />
              <p className="mt-1 flex items-center gap-2">
                <GoalIcon size={17} className="text-violet-600" />
                建立目标后，这里会显示真实完成进度。
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-4 border-violet-200 bg-white/80 text-violet-800 hover:border-violet-300 hover:bg-violet-50">
                <Link to="/app/goals"><Plus size={15} />建立目标</Link>
              </Button>
            </div>
          )}
        </Panel>
      </div>

      <section
        className="rounded-panel border border-brand-200/65 bg-gradient-to-br from-white via-brand-50/35 to-sky-50/45 px-5 py-5 shadow-card"
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
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <OperatingMetric
            label="开启"
            value={week.worklogs.open_conversation_count}
            suffix="次"
            icon={Send}
            tone="border-brand-100/70 bg-brand-50/70"
          />
          <OperatingMetric
            label="深入"
            value={week.worklogs.deep_conversation_count}
            suffix="次"
            icon={BarChart3}
            tone="border-sky-100/80 bg-sky-50/75"
          />
          <OperatingMetric
            label="Buffer"
            value={week.worklogs.buffer_count}
            suffix="次"
            icon={Layers3}
            tone="border-rose-100/80 bg-rose-50/65"
          />
          <OperatingMetric
            label="会面"
            value={week.worklogs.meeting_count}
            suffix="次"
            icon={Users}
            tone="border-amber-100/80 bg-amber-50/70"
          />
          <OperatingMetric
            label="本周 PV"
            value={week.turnover.pv.toLocaleString("zh-CN")}
            icon={GoalIcon}
            tone="border-violet-100/80 bg-violet-50/70"
          />
          <OperatingMetric
            label="本月 PV"
            value={month.turnover.pv.toLocaleString("zh-CN")}
            icon={Check}
            tone="border-cyan-100/80 bg-cyan-50/70"
          />
        </div>
      </section>

      <section
        className="rounded-panel border border-brand-200/65 bg-gradient-to-br from-white via-brand-50/30 to-amber-50/40 px-5 py-4 shadow-card"
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
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <SummaryLink
              href="/app/team"
              icon={Users}
              label="团队"
              value={`${data.data.team_summary.active_members} 位活跃`}
              detail={`共 ${data.data.team_summary.total_members} 位成员`}
              tone="border-brand-100/70 bg-brand-50/55"
              iconTone="bg-brand-100/80 text-brand-700"
            />
          </div>
          <div>
            <SummaryLink
              href="/app/knowledge"
              icon={BookOpen}
              label="学习"
              value={`${learningMinutes} 分钟`}
              detail={`阅读 ${data.data.learning_summary.reading_minutes} / 音频 ${data.data.learning_summary.audio_minutes}`}
              tone="border-sky-100/80 bg-sky-50/55"
              iconTone="bg-sky-100/80 text-sky-700"
            />
          </div>
          <div>
            <SummaryLink
              href="/app/finance"
              icon={CircleDollarSign}
              label="财务"
              value={formatMoney(data.data.finance_summary.net_cash_flow)}
              detail={`收入 ${formatMoney(data.data.finance_summary.income)} · 支出 ${formatMoney(data.data.finance_summary.expense)}`}
              tone="border-amber-100/80 bg-amber-50/55"
              iconTone="bg-amber-100/80 text-amber-700"
            />
          </div>
        </div>
      </section>
    </>
  );
}
