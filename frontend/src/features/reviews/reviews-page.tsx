import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getReview, saveReview, type AuthResponse, type Review } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type ReviewType = "DAILY" | "WEEKLY" | "MONTHLY";
type TextFields = { good: string; problems: string; improvements: string; next_focus: string; summary: string };
const emptyFields: TextFields = { good: "", problems: "", improvements: "", next_focus: "", summary: "" };
const typeLabels: Record<ReviewType, string> = { DAILY: "每日", WEEKLY: "每周", MONTHLY: "每月" };

function periodDate(type: ReviewType, date = new Date()) { const value = new Date(date); if (type === "WEEKLY") { const day = (value.getDay() + 6) % 7; value.setDate(value.getDate() - day); } if (type === "MONTHLY") value.setDate(1); return value.toISOString().slice(0, 10); }
function recentPeriods(type: ReviewType) { return Array.from({ length: 5 }, (_, index) => { const value = new Date(); if (type === "DAILY") value.setDate(value.getDate() - index); if (type === "WEEKLY") value.setDate(value.getDate() - index * 7); if (type === "MONTHLY") value.setMonth(value.getMonth() - index); return periodDate(type, value); }); }

export function ReviewsPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const queryClient = useQueryClient();
  const [type, setType] = useState<ReviewType>("DAILY");
  const [period, setPeriod] = useState(periodDate("DAILY"));
  const [form, setForm] = useState<TextFields>(emptyFields);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const reviewQuery = useQuery({ queryKey: ["user", accountId, "review", type, period], queryFn: () => getReview(type, period) });
  useEffect(() => { setForm(reviewQuery.data?.data ? reviewFields(reviewQuery.data.data) : emptyFields); }, [reviewQuery.data]);
  const mutation = useMutation({ mutationFn: () => saveReview(authResponse.data.csrf_token, type, period, { ...form, summary: form.summary || null }), onSuccess: () => { setNotice("复盘已保存。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", accountId, "review"] }); }, onError: (value) => { setError(errorMessage(value)); setNotice(""); } });
  const recents = useMemo(() => recentPeriods(type), [type]);
  const changeType = (value: ReviewType) => { setType(value); setPeriod(periodDate(value)); setNotice(""); setError(""); };
  return <div className="space-y-6">
    <PageHeader eyebrow="复盘与调整" title="复盘" description="在同一工作区查看周期经营摘要、记录判断并明确下一步。" />
    <Tabs value={type} onValueChange={(value) => changeType(value as ReviewType)}><TabsList aria-label="复盘周期"><TabsTrigger value="DAILY">每日</TabsTrigger><TabsTrigger value="WEEKLY">每周</TabsTrigger><TabsTrigger value="MONTHLY">每月</TabsTrigger></TabsList></Tabs>
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    {reviewQuery.isPending ? <LoadingState label="正在加载复盘" /> : reviewQuery.isError ? <ErrorState message="复盘暂时无法加载" onRetry={() => void reviewQuery.refetch()} /> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]"><main className="rounded-xl border border-slate-200 bg-white shadow-panel"><div className="border-b border-slate-200 p-5 sm:flex sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-teal-700">{typeLabels[type]}复盘</p><h2 className="mt-1 text-xl font-bold text-slate-950">{period}</h2></div><div className="mt-4 w-full sm:mt-0 sm:w-44"><Input label="周期开始" type="date" value={period} onChange={(event) => setPeriod(event.target.value)} /></div></div><div className="grid gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-3"><Metric label="行动总数" value={String(reviewQuery.data.data.totals.worklog_action_count)} /><Metric label="营业额 PV" value={String(reviewQuery.data.data.totals.turnover_pv)} /><Metric label="净营业额" value={formatMoney(reviewQuery.data.data.totals.turnover_net_amount)} /></div><div className="space-y-6 p-5"><ReviewField label="做得好的地方" value={form.good} onChange={(value) => setForm({ ...form, good: value })} placeholder="哪些行动值得继续保持？" /><ReviewField label="遇到的问题" value={form.problems} onChange={(value) => setForm({ ...form, problems: value })} placeholder="哪些阻碍影响了本周期？" /><ReviewField label="下一步改进" value={form.improvements} onChange={(value) => setForm({ ...form, improvements: value })} placeholder="下一步要具体改变什么？" /><ReviewField label="下一周期聚焦" value={form.next_focus} onChange={(value) => setForm({ ...form, next_focus: value })} placeholder="下一周期最重要的一件事是什么？" /><ReviewField label="周期摘要" value={form.summary} onChange={(value) => setForm({ ...form, summary: value })} placeholder="用一段话概括本周期。" compact /><div className="flex justify-end"><Button onClick={() => mutation.mutate()} loading={mutation.isPending}><Check size={15} />{mutation.isPending ? "处理中..." : "保存复盘"}</Button></div></div></main><aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel lg:sticky lg:top-24"><h2 className="font-bold text-slate-950">最近周期</h2><p className="mt-1 text-sm text-slate-500">快速切换并读取已保存内容。</p><div className="mt-4 space-y-1">{recents.map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm ${period === value ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-600 hover:bg-slate-50"}`}><span>{value}</span><ChevronRight size={15} /></button>)}</div></aside></div>}
  </div>;
}

function reviewFields(review: Review): TextFields { return { good: review.good, problems: review.problems, improvements: review.improvements, next_focus: review.next_focus, summary: review.summary ?? "" }; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-950">{value}</p></div>; }
function ReviewField({ label, value, onChange, placeholder, compact = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; compact?: boolean }) { return <label className="block space-y-2"><span className="text-sm font-semibold text-slate-800">{label}</span><textarea className={`${compact ? "min-h-24" : "min-h-28"} w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }
