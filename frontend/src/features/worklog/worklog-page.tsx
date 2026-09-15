import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AuthResponse, Worklog, WorklogRequest } from "@/api/client";
import { listWorklogs, saveWorklog } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { businessDate, businessDateDaysAgo } from "@/lib/date";
import { errorMessage } from "@/lib/utils";

const countFields = [
  ["open_conversation_count", "开启对话"],
  ["deep_conversation_count", "深入对话"],
  ["buffer_count", "Buffer"],
  ["story_share_count", "分享故事"],
  ["screening_count", "筛选"],
  ["opportunity_count", "提供机会"],
  ["meeting_count", "会面"],
  ["customer_followup_count", "顾客跟进"],
] as const;

const worklogSchema = z.object({
  work_date: z.string().min(1),
  open_conversation_count: z.number().int().min(0),
  deep_conversation_count: z.number().int().min(0),
  buffer_count: z.number().int().min(0),
  story_share_count: z.number().int().min(0),
  screening_count: z.number().int().min(0),
  opportunity_count: z.number().int().min(0),
  meeting_count: z.number().int().min(0),
  customer_followup_count: z.number().int().min(0),
  reading_minutes: z.number().int().min(0),
  audio_minutes: z.number().int().min(0),
  turnover_pv: z.string(),
  turnover_net_amount: z.string(),
  note: z.string(),
});

type WorklogForm = z.infer<typeof worklogSchema>;

function formDefaults(date: string): WorklogForm {
  return { work_date: date, open_conversation_count: 0, deep_conversation_count: 0, buffer_count: 0, story_share_count: 0, screening_count: 0, opportunity_count: 0, meeting_count: 0, customer_followup_count: 0, reading_minutes: 0, audio_minutes: 0, turnover_pv: "", turnover_net_amount: "", note: "" };
}

function fromWorklog(value: Worklog): WorklogForm {
  return { work_date: value.work_date, open_conversation_count: value.open_conversation_count, deep_conversation_count: value.deep_conversation_count, buffer_count: value.buffer_count, story_share_count: value.story_share_count, screening_count: value.screening_count, opportunity_count: value.opportunity_count, meeting_count: value.meeting_count, customer_followup_count: value.customer_followup_count, reading_minutes: value.reading_minutes, audio_minutes: value.audio_minutes, turnover_pv: value.turnover_pv?.toString() ?? "", turnover_net_amount: value.turnover_net_amount?.toString() ?? "", note: value.note ?? "" };
}

function actionTotal(value: Worklog): number {
  return countFields.reduce((total, [field]) => total + value[field], 0);
}

export function WorklogPage({ authResponse }: { authResponse: AuthResponse }) {
  const queryClient = useQueryClient();
  const timezone = authResponse.data.account.timezone;
  const currentDate = businessDate(timezone);
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const rangeStart = useMemo(() => businessDateDaysAgo(timezone, 90), [timezone]);
  const worklogsQuery = useQuery({ queryKey: ["user", authResponse.data.account.id, "worklogs", rangeStart, currentDate, selectedDate], queryFn: () => listWorklogs(rangeStart, currentDate) });
  const form = useForm<WorklogForm>({ resolver: zodResolver(worklogSchema), defaultValues: formDefaults(selectedDate) });
  const existing = worklogsQuery.data?.data.items.find((item) => item.work_date === selectedDate);
  useEffect(() => { form.reset(existing ? fromWorklog(existing) : formDefaults(selectedDate)); }, [existing, form, selectedDate]);
  const mutation = useMutation({ mutationFn: (value: WorklogRequest) => saveWorklog(authResponse.data.csrf_token, value, Boolean(existing)), onSuccess: () => { setNotice("今日工作已保存，目标进度已更新。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", authResponse.data.account.id] }); }, onError: (value) => { setError(errorMessage(value)); setNotice(""); } });
  const onSubmit = form.handleSubmit((value) => {
    const input: WorklogRequest = { work_date: value.work_date, open_conversation_count: value.open_conversation_count, deep_conversation_count: value.deep_conversation_count, buffer_count: value.buffer_count, story_share_count: value.story_share_count, screening_count: value.screening_count, opportunity_count: value.opportunity_count, meeting_count: value.meeting_count, customer_followup_count: value.customer_followup_count, reading_minutes: value.reading_minutes, audio_minutes: value.audio_minutes, turnover_pv: value.turnover_pv.trim() ? Number(value.turnover_pv) : null, turnover_net_amount: value.turnover_net_amount.trim() ? value.turnover_net_amount : null, note: value.note.trim() || null };
    mutation.mutate(input);
  });
  return <div className="space-y-7"><PageHeader eyebrow="每日行动" title="今日工作量" description="记录真实发生的行动；读书、听音频和营业额会进入各自的唯一事实源。" />{(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><Panel title="一屏记录" description="数字字段可以直接使用键盘快速录入"><form className="space-y-5" onSubmit={onSubmit}><div className="max-w-xs"><Input label="业务日期" type="date" {...form.register("work_date")} /></div><div className="grid gap-3 sm:grid-cols-2">{countFields.map(([field, label]) => <Input key={field} label={label} type="number" min={0} {...form.register(field, { valueAsNumber: true })} />)}</div><div className="grid gap-3 sm:grid-cols-2"><Input label="读书分钟" type="number" min={0} {...form.register("reading_minutes", { valueAsNumber: true })} /><Input label="听音频分钟" type="number" min={0} {...form.register("audio_minutes", { valueAsNumber: true })} /></div><div className="grid gap-3 sm:grid-cols-2"><Input label="营业额 PV（可选）" type="number" min={0} step="0.01" {...form.register("turnover_pv")} /><Input label="净营业额（可选）" type="number" min={0} step="0.01" {...form.register("turnover_net_amount")} /></div><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">备注</span><textarea className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" {...form.register("note")} /></label><Button type="submit" loading={mutation.isPending}><Check size={16} />{mutation.isPending ? "处理中..." : "保存今日记录"}</Button></form></Panel><Panel title="记录说明"><div className="space-y-4 text-sm leading-6 text-slate-600"><p><CalendarDays size={16} className="mr-2 inline text-teal-700" />当前选择：{selectedDate}</p><p>营业额固定按 1 PV = ¥12.5 换算。两项同时填写时，系统会校验舍入误差。</p><p>目标实际进度根据目标日期范围内的工作量和营业额实时计算，不需要手动维护。</p></div></Panel></div><Panel title="最近记录" description="点击任一日期编辑，不会创建重复日期记录。">{worklogsQuery.isPending ? <LoadingState label="正在加载工作量记录" /> : worklogsQuery.isError ? <ErrorState message="工作量记录暂时无法加载" onRetry={() => void worklogsQuery.refetch()} /> : worklogsQuery.data.data.items.length ? <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold text-slate-500"><tr><th className="px-3 py-3">日期</th><th className="px-3 py-3">行动总数</th><th className="px-3 py-3">读书 / 音频</th><th className="px-3 py-3">营业额</th><th className="px-3 py-3">备注</th></tr></thead><tbody>{worklogsQuery.data.data.items.map((item) => <tr key={item.id} className={`border-b border-slate-100 ${item.work_date === selectedDate ? "bg-teal-50/60" : ""}`}><td className="px-3 py-3"><button type="button" className="font-semibold text-teal-800 hover:underline" onClick={() => setSelectedDate(item.work_date)}>{item.work_date}</button></td><td className="px-3 py-3 font-semibold text-slate-900">{actionTotal(item)}</td><td className="px-3 py-3 text-slate-600">{item.reading_minutes} / {item.audio_minutes} 分钟</td><td className="px-3 py-3 text-slate-600">{item.turnover_pv == null ? "-" : `${item.turnover_pv} PV`}</td><td className="max-w-xs truncate px-3 py-3 text-slate-500">{item.note || "-"}</td></tr>)}</tbody></table></div> : <EmptyState title="还没有工作量记录" description="保存第一条每日记录后，它会显示在这里。" />}</Panel><p className="flex items-center gap-2 text-xs text-slate-500"><FileText size={14} className="text-teal-700" />记录属于当前账号，管理员无法读取。</p></div>;
}
