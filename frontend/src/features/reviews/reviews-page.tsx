import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getReview, listReviews, listWorklogs, saveReview, type AuthResponse, type Review } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessDate, reviewPeriodEnd, reviewPeriodStart } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { errorMessage } from "@/lib/utils";

type ReviewType = "DAILY" | "WEEKLY" | "MONTHLY";
type TextFields = { good: string; problems: string; improvements: string; next_focus: string; summary: string };
const emptyFields: TextFields = { good: "", problems: "", improvements: "", next_focus: "", summary: "" };
const typeLabels: Record<ReviewType, string> = { DAILY: "每日", WEEKLY: "每周", MONTHLY: "每月" };
const fieldLabels: Record<ReviewType, { date: string; focus: string; summary: string }> = {
  DAILY: { date: "复盘日期", focus: "明日重点", summary: "今日总结" },
  WEEKLY: { date: "本周开始日期", focus: "下周重点", summary: "本周总结" },
  MONTHLY: { date: "复盘月份", focus: "下月重点", summary: "本月总结" },
};

export function ReviewsPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const timezone = authResponse.data.account.timezone;
  const queryClient = useQueryClient();
  const [type, setType] = useState<ReviewType>("DAILY");
  const [period, setPeriod] = useState(reviewPeriodStart(timezone, "DAILY"));
  const [form, setForm] = useState<TextFields>(emptyFields);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const periodEnd = reviewPeriodEnd(period, type);
  const reviewQuery = useQuery({ queryKey: ["user", accountId, "review", type, period], queryFn: () => getReview(type, period) });
  const historyQuery = useQuery({ queryKey: ["user", accountId, "reviews"], queryFn: () => listReviews("2000-01-01", businessDate(timezone)) });
  const funnelQuery = useQuery({ queryKey: ["user", accountId, "review-funnel", period, periodEnd], queryFn: () => listWorklogs(period, periodEnd), enabled: type !== "DAILY" });
  useEffect(() => { setForm(reviewQuery.data?.data ? reviewFields(reviewQuery.data.data) : emptyFields); }, [reviewQuery.data]);
  const mutation = useMutation({
    mutationFn: () => saveReview(authResponse.data.csrf_token, type, period, { ...form, summary: form.summary || null }),
    onSuccess: () => {
      setNotice("复盘已保存。");
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["user", accountId, "review"] });
      void queryClient.invalidateQueries({ queryKey: ["user", accountId, "reviews"] });
    },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const recents = useMemo(() => (historyQuery.data?.data.items ?? []).filter((item) => item.id && item.type === type).slice(0, 10), [historyQuery.data, type]);
  const funnel = useMemo(() => (funnelQuery.data?.data.items ?? []).reduce((sum, item) => ({
    open: sum.open + item.open_conversation_count,
    deep: sum.deep + item.deep_conversation_count,
    story: sum.story + item.story_share_count,
    screening: sum.screening + item.screening_count,
    meeting: sum.meeting + item.meeting_count,
  }), { open: 0, deep: 0, story: 0, screening: 0, meeting: 0 }), [funnelQuery.data]);
  const changeType = (value: ReviewType) => { setType(value); setPeriod(reviewPeriodStart(timezone, value)); setForm(emptyFields); setNotice(""); setError(""); };
  const labels = fieldLabels[type];

  return <div className="reviews-page space-y-6">
    <PageHeader eyebrow="复盘与调整" title="复盘" description="查看周期经营摘要，记录判断并明确下一步。" />
    <Tabs value={type} onValueChange={(value) => changeType(value as ReviewType)}><TabsList aria-label="复盘周期"><TabsTrigger value="DAILY">每日</TabsTrigger><TabsTrigger value="WEEKLY">每周</TabsTrigger><TabsTrigger value="MONTHLY">每月</TabsTrigger></TabsList></Tabs>
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <div data-testid="review-workspace" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <main className="min-h-[680px] rounded-[1.25rem] border border-violet-100/70 bg-surface shadow-panel">
        {reviewQuery.isPending ? <ReviewWorkspaceSkeleton /> : reviewQuery.isError ? <div className="p-5"><ErrorState message="复盘暂时无法加载" onRetry={() => void reviewQuery.refetch()} /></div> : <>
          <div className="border-b border-slate-200 p-5 sm:flex sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-teal-700">{typeLabels[type]}复盘</p><h2 className="mt-1 text-xl font-bold text-slate-950">{type === "MONTHLY" ? period.slice(0, 7) : period}</h2></div><div className="mt-4 w-full sm:mt-0 sm:w-44">{type === "MONTHLY" ? <Input label={labels.date} type="month" value={period.slice(0, 7)} onChange={(event) => setPeriod(`${event.target.value}-01`)} /> : <Input label={labels.date} type="date" value={period} onChange={(event) => setPeriod(event.target.value)} />}</div></div>
          <div className="grid gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-3"><Metric label="行动总数" value={String(reviewQuery.data.data.totals.worklog_action_count)} /><Metric label="营业额 PV" value={String(reviewQuery.data.data.totals.turnover_pv)} /><Metric label="净营业额" value={formatMoney(reviewQuery.data.data.totals.turnover_net_amount)} /></div>
          {type !== "DAILY" && <div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><p className="text-xs font-semibold text-slate-500">行动漏斗</p><p className="mt-1 text-sm font-semibold text-slate-800">{funnelQuery.isPending ? "正在汇总..." : `开启 ${funnel.open} · 深入 ${funnel.deep} · 分享 ${funnel.story} · 筛选 ${funnel.screening} · 会面 ${funnel.meeting}`}</p></div>}
          <div className="space-y-6 p-5"><ReviewField label="做得好的地方" value={form.good} onChange={(value) => setForm({ ...form, good: value })} placeholder="哪些行动值得继续保持？" /><ReviewField label="遇到的问题" value={form.problems} onChange={(value) => setForm({ ...form, problems: value })} placeholder="哪些阻碍影响了本周期？" /><ReviewField label="下一步改进" value={form.improvements} onChange={(value) => setForm({ ...form, improvements: value })} placeholder="下一步要具体改变什么？" /><ReviewField label={labels.focus} value={form.next_focus} onChange={(value) => setForm({ ...form, next_focus: value })} placeholder="下一周期最重要的一件事是什么？" /><ReviewField label={labels.summary} value={form.summary} onChange={(value) => setForm({ ...form, summary: value })} placeholder="用一段话概括本周期。" compact /><div className="flex justify-end"><Button onClick={() => mutation.mutate()} loading={mutation.isPending}><Check size={15} />{mutation.isPending ? "处理中..." : "保存复盘"}</Button></div></div>
        </>}
      </main>
      <aside className="min-h-[220px] rounded-xl border border-slate-200 bg-white p-4 shadow-panel lg:sticky lg:top-24"><h2 className="font-bold text-slate-950">最近保存</h2><p className="mt-1 text-sm text-slate-500">仅显示真正保存过的{typeLabels[type]}复盘。</p>{historyQuery.isPending ? <div className="mt-4"><LoadingState label="正在读取记录" /></div> : historyQuery.isError ? <div className="mt-4"><ErrorState message="历史记录暂时无法加载" onRetry={() => void historyQuery.refetch()} /></div> : recents.length ? <div className="mt-4 space-y-1">{recents.map((item) => <button key={item.id ?? `${item.type}-${item.period_start}`} type="button" onClick={() => setPeriod(item.period_start)} className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${period === item.period_start ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-600 hover:bg-slate-50"}`}><span>{type === "MONTHLY" ? item.period_start.slice(0, 7) : item.period_start}</span><ChevronRight size={15} /></button>)}</div> : <div className="mt-4"><EmptyState compact title="还没有已保存复盘" description="保存当前复盘后会显示在这里。" /></div>}</aside>
    </div>
  </div>;
}

function reviewFields(review: Review): TextFields { return { good: review.good, problems: review.problems, improvements: review.improvements, next_focus: review.next_focus, summary: review.summary ?? "" }; }
function ReviewWorkspaceSkeleton() { return <div aria-label="正在加载复盘" className="min-h-[680px] animate-pulse space-y-6 p-5"><div className="h-6 w-40 rounded bg-slate-200" /><div className="grid gap-px sm:grid-cols-3"><div className="h-20 rounded bg-slate-100" /><div className="h-20 rounded bg-slate-100" /><div className="h-20 rounded bg-slate-100" /></div><div className="space-y-4"><div className="h-28 rounded bg-slate-100" /><div className="h-28 rounded bg-slate-100" /><div className="h-28 rounded bg-slate-100" /><div className="h-10 w-28 self-end rounded bg-slate-200" /></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="bg-gradient-to-br from-violet-50/65 to-brand-50/35 p-4"><p className="text-xs font-semibold text-ink-faint">{label}</p><p className="mt-2 text-xl font-black tabular-nums text-ink">{value}</p></div>; }
function ReviewField({ label, value, onChange, placeholder, compact = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; compact?: boolean }) { return <label className="block space-y-2"><span className="text-sm font-semibold text-slate-800">{label}</span><textarea className={`${compact ? "min-h-24" : "min-h-28"} w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }
