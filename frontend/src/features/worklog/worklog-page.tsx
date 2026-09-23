import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  FileText,
  Gift,
  Handshake,
  Layers3,
  Minus,
  MessageCircle,
  Plus,
  Share2,
  Sprout,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AuthResponse, Worklog, WorklogRequest, listWorklogs } from "@/api/client";
import { saveWorklog } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/state-block";
import { businessDate, businessDateDaysAgo } from "@/lib/date";
import { errorMessage } from "@/lib/utils";
import { netAmountFromPV, pvAndNetAmountMatch, pvFromNetAmount } from "@/lib/pv";
import { worklogDateQueryOptions, worklogQueryOptions } from "@/lib/query-options";

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

const countFieldMeta = {
  open_conversation_count: { icon: MessageCircle, tone: "blue" },
  deep_conversation_count: { icon: UsersRound, tone: "mint" },
  buffer_count: { icon: Layers3, tone: "violet" },
  story_share_count: { icon: Share2, tone: "coral" },
  screening_count: { icon: Filter, tone: "blue" },
  opportunity_count: { icon: Gift, tone: "amber" },
  meeting_count: { icon: Handshake, tone: "cyan" },
  customer_followup_count: { icon: UserRoundCheck, tone: "purple" },
} as const;

const optionalDecimal = z
  .string()
  .refine(
    (value) =>
      !value.trim() || (Number.isFinite(Number(value)) && Number(value) >= 0),
    "请输入不小于 0 的数字",
  );
const worklogSchema = z
  .object({
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
    turnover_pv: optionalDecimal,
    turnover_net_amount: optionalDecimal,
    note: z.string(),
  })
  .refine(
    (value) =>
      !value.turnover_pv.trim() ||
      !value.turnover_net_amount.trim() ||
      pvAndNetAmountMatch(value.turnover_pv, value.turnover_net_amount),
    { message: "PV 与净营业额不一致", path: ["turnover_net_amount"] },
  );

type WorklogForm = z.infer<typeof worklogSchema>;
const formDefaults = (date: string): WorklogForm => ({
  work_date: date,
  open_conversation_count: 0,
  deep_conversation_count: 0,
  buffer_count: 0,
  story_share_count: 0,
  screening_count: 0,
  opportunity_count: 0,
  meeting_count: 0,
  customer_followup_count: 0,
  reading_minutes: 0,
  audio_minutes: 0,
  turnover_pv: "",
  turnover_net_amount: "",
  note: "",
});

function fromWorklog(value: Worklog): WorklogForm {
  return {
    work_date: value.work_date,
    open_conversation_count: value.open_conversation_count,
    deep_conversation_count: value.deep_conversation_count,
    buffer_count: value.buffer_count,
    story_share_count: value.story_share_count,
    screening_count: value.screening_count,
    opportunity_count: value.opportunity_count,
    meeting_count: value.meeting_count,
    customer_followup_count: value.customer_followup_count,
    reading_minutes: value.reading_minutes,
    audio_minutes: value.audio_minutes,
    turnover_pv: value.turnover_pv?.toString() ?? "",
    turnover_net_amount: value.turnover_net_amount == null ? "" : Number(value.turnover_net_amount).toFixed(2),
    note: value.note ?? "",
  };
}

function actionTotal(value: Worklog): number {
  return countFields.reduce((total, [field]) => total + value[field], 0);
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

export function WorklogPage({ authResponse }: { authResponse: AuthResponse }) {
  const queryClient = useQueryClient();
  const accountId = authResponse.data.account.id;
  const timezone = authResponse.data.account.timezone;
  const currentDate = businessDate(timezone);
  const rangeStart = businessDateDaysAgo(timezone, 90);
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get("date");
  const initialDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= currentDate ? requestedDate : currentDate;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const worklogsQuery = useQuery(worklogQueryOptions(accountId, timezone));
  const selectedDateInRange = selectedDate >= rangeStart && selectedDate <= currentDate;
  const selectedDateQuery = useQuery({
    ...worklogDateQueryOptions(accountId, selectedDate),
    enabled: !selectedDateInRange,
  });
  const selectedDateResponse = selectedDateInRange ? worklogsQuery.data : selectedDateQuery.data;
  const selectedDateLoading = selectedDateInRange
    ? worklogsQuery.isPending && !worklogsQuery.data
    : selectedDateQuery.isPending && !selectedDateQuery.data;
  const selectedDateError = selectedDateInRange
    ? worklogsQuery.isError && !worklogsQuery.data
    : selectedDateQuery.isError && !selectedDateQuery.data;
  const form = useForm<WorklogForm>({
    resolver: zodResolver(worklogSchema),
    defaultValues: formDefaults(selectedDate),
    mode: "onChange",
    reValidateMode: "onChange",
  });
  const existing = selectedDateResponse?.data.items.find(
    (item) => item.work_date === selectedDate,
  );
  const loadedFormDate = useRef(selectedDate);
  useEffect(() => {
    const dateChanged = loadedFormDate.current !== selectedDate;
    if (dateChanged || !form.formState.isDirty) {
      form.reset(existing ? fromWorklog(existing) : formDefaults(selectedDate));
      loadedFormDate.current = selectedDate;
    }
  }, [existing, form, form.formState.isDirty, selectedDate]);
  const mutation = useMutation({
    mutationFn: (value: WorklogRequest) =>
      saveWorklog(authResponse.data.csrf_token, value, Boolean(existing)),
    onSuccess: () => {
      setNotice("今日工作已保存，目标进度已更新。");
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["user", accountId] });
    },
    onError: (value) => {
      setError(errorMessage(value));
      setNotice("");
    },
  });
  const onSubmit = form.handleSubmit((value) =>
    mutation.mutate({
      work_date: value.work_date,
      open_conversation_count: value.open_conversation_count,
      deep_conversation_count: value.deep_conversation_count,
      buffer_count: value.buffer_count,
      story_share_count: value.story_share_count,
      screening_count: value.screening_count,
      opportunity_count: value.opportunity_count,
      meeting_count: value.meeting_count,
      customer_followup_count: value.customer_followup_count,
      reading_minutes: value.reading_minutes,
      audio_minutes: value.audio_minutes,
      turnover_pv: value.turnover_pv.trim() ? Number(value.turnover_pv) : null,
      turnover_net_amount: value.turnover_net_amount.trim()
        ? value.turnover_net_amount
        : null,
      note: value.note.trim() || null,
    }),
  );
  const actionCount = countFields.reduce(
    (total, [field]) => total + (Number(form.watch(field)) || 0),
    0,
  );
  const learningMinutes =
    (Number(form.watch("reading_minutes")) || 0) +
    (Number(form.watch("audio_minutes")) || 0);
  const pv = Number(form.watch("turnover_pv"));
  const netAmount = Number(form.watch("turnover_net_amount"));
  const fieldError = (field: keyof WorklogForm) =>
    form.formState.errors[field]?.message?.toString();
  const selectDate = (date: string) => {
    const dateInRange = date >= rangeStart && date <= currentDate;
    const cachedResponse = dateInRange
      ? worklogsQuery.data
      : queryClient.getQueryData<Awaited<ReturnType<typeof listWorklogs>>>(
          worklogDateQueryOptions(accountId, date).queryKey,
        );
    const nextWorklog = cachedResponse?.data.items.find((item) => item.work_date === date);
    form.reset(nextWorklog ? fromWorklog(nextWorklog) : formDefaults(date));
    loadedFormDate.current = date;
    setSelectedDate(date);
    setNotice("");
    setError("");
  };
  const updateCount = (
    field: (typeof countFields)[number][0],
    delta: number,
  ) => {
    const current = Number(form.getValues(field)) || 0;
    form.setValue(field, Math.max(0, current + delta), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  const recentWorklogs = worklogsQuery.data?.data.items.slice(0, 7) ?? [];
  const retrySelectedDate = () => {
    if (selectedDateInRange) void worklogsQuery.refetch();
    else void selectedDateQuery.refetch();
  };
  const updatePV = (value: string) => {
    form.setValue("turnover_pv", value, { shouldDirty: true });
    const converted = netAmountFromPV(value);
    if (converted !== null) form.setValue("turnover_net_amount", converted, { shouldDirty: true });
    void form.trigger(["turnover_pv", "turnover_net_amount"]);
  };
  const updateNetAmount = (value: string) => {
    form.setValue("turnover_net_amount", value, { shouldDirty: true });
    const converted = pvFromNetAmount(value);
    if (converted !== null) form.setValue("turnover_pv", converted, { shouldDirty: true });
    void form.trigger(["turnover_pv", "turnover_net_amount"]);
  };

  return (
    <div className="worklog-page space-y-7">
      <section className="worklog-hero rounded-hero border border-brand-100/70 bg-gradient-to-br from-brand-50/90 via-sky-50/80 to-surface/95 shadow-float">
        <div className="relative overflow-hidden px-5 pt-5 sm:px-7 sm:pt-6">
          <PageHeader
            className="page-header-plain relative z-10 border-0 pb-4 sm:items-start"
            eyebrow="每日行动"
            title="今日工作量"
            description="记录今天实际完成的行动、学习和营业额，保存后会用于统计、复盘和目标进度。"
            action={
              <div className="worklog-date-nav" aria-label="业务日期导航">
                <Button type="button" variant="icon" size="sm" className="h-10 w-10 p-0" aria-label="前一天" onClick={() => selectDate(shiftDate(selectedDate, -1))}><ChevronLeft size={18} /></Button>
                <label className="worklog-date-value">
                  <span aria-hidden="true">{selectedDate}</span>
                  <input aria-label="业务日期" type="date" max={currentDate} value={selectedDate} onChange={(event) => selectDate(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
                <Button type="button" variant="icon" size="sm" className="h-10 w-10 p-0" aria-label="后一天" disabled={selectedDate >= currentDate} onClick={() => selectDate(shiftDate(selectedDate, 1) > currentDate ? currentDate : shiftDate(selectedDate, 1))}><ChevronRight size={18} /></Button>
                <Button type="button" variant="ghost" size="sm" disabled={selectedDate === currentDate} onClick={() => selectDate(currentDate)}>今天</Button>
              </div>
            }
          />
          <svg className="worklog-hero-art" viewBox="0 0 520 180" fill="none" aria-hidden="true">
            <path d="M0 143C90 106 132 137 211 111C289 85 343 130 424 99C466 83 490 89 520 73V180H0V143Z" fill="rgb(117 215 204 / .24)" />
            <path d="M16 157C101 124 151 145 224 120C303 93 353 138 430 106C469 90 498 91 520 80" stroke="rgb(74 157 151 / .55)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="388" cy="53" r="25" fill="rgb(248 190 77 / .75)" />
            <path d="M388 17V5M388 101V89M352 53h-13M437 53h-13M362 27l-9-9M414 79l-9-9M414 27l9-9M362 79l-9 9" stroke="rgb(229 164 47 / .8)" strokeWidth="3" strokeLinecap="round" />
            <path d="M444 119c6-29 12-44 27-59M455 96c17-2 29-9 39-22M454 96c-17-3-26-12-31-26" stroke="rgb(42 135 123 / .7)" strokeWidth="4" strokeLinecap="round" />
            <path d="M459 70c12-14 24-18 37-17-4 13-14 23-37 25M443 61c-9-14-18-19-31-20 2 14 12 24 31 28" fill="rgb(84 195 166 / .7)" />
          </svg>
        </div>
        <section aria-label="今日概览" className="worklog-summary mx-4 mb-4 mt-4 grid grid-cols-3 gap-2 rounded-panel border border-white/80 bg-surface/70 p-2 shadow-hairline sm:mx-7 sm:mb-5 sm:mt-5 sm:gap-0 sm:p-1.5">
          <div className="worklog-summary-item worklog-summary-mint"><span className="worklog-summary-icon"><BriefcaseBusiness size={17} /></span><span><span className="worklog-summary-label">行动</span><strong>{selectedDateResponse ? actionCount : "—"}</strong></span></div>
          <div className="worklog-summary-item worklog-summary-blue"><span className="worklog-summary-icon"><BookOpen size={17} /></span><span><span className="worklog-summary-label">学习</span><strong>{selectedDateResponse ? <>{learningMinutes}<small>分钟</small></> : "—"}</strong></span></div>
          <div className="worklog-summary-item worklog-summary-teal"><span className="worklog-summary-icon"><BarChart3 size={17} /></span><span><span className="worklog-summary-label">净营业额</span><strong>{selectedDateResponse ? (form.watch("turnover_net_amount").trim() ? `¥${Number.isFinite(netAmount) ? netAmount.toFixed(2) : "0.00"}` : `${pv || 0} PV`) : "—"}</strong></span></div>
        </section>
      </section>
      {(notice || error) && (
        <p
          role={error ? "alert" : "status"}
          className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}
        >
          {error || notice}
        </p>
      )}
      <Panel className="worklog-form-panel border-brand-100/70 bg-surface/80 shadow-float">
        {!selectedDateInRange && selectedDateQuery.isFetching && selectedDateQuery.data && <p role="status" className="mb-3 text-xs text-slate-500">正在刷新所选日期的工作量…</p>}
        {!selectedDateInRange && selectedDateQuery.isError && selectedDateQuery.data && <p role="alert" className="mb-3 text-xs text-amber-700">刷新失败，当前仍显示上次数据。 <button type="button" className="font-semibold underline" onClick={retrySelectedDate}>重试</button></p>}
        {selectedDateLoading ? <LoadingState label="正在准备工作量表单" /> : selectedDateError ? <ErrorState message="工作量记录暂时无法加载" onRetry={retrySelectedDate} /> : <form className="space-y-0" onSubmit={onSubmit}>
          <input type="hidden" {...form.register("work_date")} />
          <section aria-labelledby="worklog-actions" className="worklog-actions-section pb-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="worklog-actions" className="flex items-center gap-2 text-base font-bold text-slate-950">
                  <span className="worklog-section-icon worklog-section-icon-blue"><MessageCircle size={17} /></span>
                  五层对话
                </h2>
                <p className="mt-1 text-sm text-slate-500">行动总数为当天八类对话行动的合计；可点击加减或直接输入。</p>
              </div>
              <span className="worklog-total-badge shrink-0 text-sm font-semibold tabular-nums">
                共 {actionCount} 次
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {countFields.map(([field, label]) => (
                <div
                  key={field}
                  className={`worklog-count-card worklog-count-card-${countFieldMeta[field].tone}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="worklog-count-icon"><>{(() => { const Icon = countFieldMeta[field].icon; return <Icon size={17} />; })()}</></span>
                    <label htmlFor={`worklog-${field}`} className="min-h-6 text-sm font-bold text-ink">{label}</label>
                  </div>
                  <div className="mt-3 grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="worklog-count-stepper h-10 w-10 p-0"
                      aria-label={`减少${label}`}
                      onClick={() => updateCount(field, -1)}
                    >
                      <Minus size={18} />
                    </Button>
                    <input
                      id={`worklog-${field}`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      aria-invalid={Boolean(fieldError(field))}
                      className="worklog-count-input h-10 min-w-0 rounded-control border border-outline bg-surface px-1 text-center text-lg font-extrabold tabular-nums text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                      {...form.register(field, { valueAsNumber: true })}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="worklog-count-stepper h-10 w-10 p-0"
                      aria-label={`增加${label}`}
                      onClick={() => updateCount(field, 1)}
                    >
                      <Plus size={18} />
                    </Button>
                  </div>
                  {fieldError(field) && (
                    <p className="mt-1 text-xs text-rose-700">{fieldError(field)}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="worklog-detail-grid grid border-t border-outline/70 lg:grid-cols-2 lg:divide-x lg:divide-outline/70">
            <section data-testid="worklog-learning-section" aria-labelledby="worklog-learning" className="worklog-detail-card grid grid-rows-[auto_minmax(40px,auto)_auto_auto] gap-y-3 py-7 lg:pr-7">
              <h2
                id="worklog-learning"
                className="flex items-center gap-2 text-base font-bold text-slate-950"
              >
                <span className="worklog-section-icon worklog-section-icon-mint"><Sprout size={17} /></span>
                成长投入
              </h2>
              <p className="text-sm leading-5 text-slate-500">记录当天实际投入的读书和音频学习时间。</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="读书分钟"
                  type="number"
                  min={0}
                  step={1}
                  error={fieldError("reading_minutes")}
                  {...form.register("reading_minutes", { valueAsNumber: true })}
                />
                <Input
                  label="听音频分钟"
                  type="number"
                  min={0}
                  step={1}
                  error={fieldError("audio_minutes")}
                  {...form.register("audio_minutes", { valueAsNumber: true })}
                />
              </div>
              <p className="text-xs leading-5 text-slate-500">学习分钟会汇总到学习中心，使用同一份事实源。</p>
            </section>
            <section data-testid="worklog-turnover-section" aria-labelledby="worklog-turnover" className="worklog-detail-card grid grid-rows-[auto_minmax(40px,auto)_auto_auto] gap-y-3 border-t border-outline/70 py-7 lg:border-t-0 lg:pl-7">
              <h2
                id="worklog-turnover"
                className="flex items-center gap-2 text-base font-bold text-slate-950"
              >
                <span className="worklog-section-icon worklog-section-icon-amber"><BarChart3 size={17} /></span>
                营业额
              </h2>
              <p className="text-sm leading-5 text-slate-500">填写 PV 或净营业额时，另一项会按固定比例自动换算。</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="营业额 PV（可选）"
                  type="number"
                  min={0}
                  step="0.01"
                  error={fieldError("turnover_pv")}
                  {...form.register("turnover_pv")}
                  onChange={(event) => updatePV(event.target.value)}
                />
                <Input
                  label="净营业额（可选）"
                  type="number"
                  min={0}
                  step="0.01"
                  error={fieldError("turnover_net_amount")}
                  {...form.register("turnover_net_amount")}
                  onChange={(event) => updateNetAmount(event.target.value)}
                />
              </div>
              <p className="text-xs leading-5 text-slate-500">
                1 PV = ¥12.5；两项同时填写时允许标准货币舍入误差。
              </p>
            </section>
          </div>

          <section aria-labelledby="worklog-note" className="worklog-note-section border-t border-outline/70 py-7">
            <label className="block space-y-1.5" htmlFor="worklog-note-input">
              <span id="worklog-note" className="flex items-center gap-2 text-base font-bold text-slate-950"><span className="worklog-section-icon worklog-section-icon-coral"><FileText size={17} /></span>备注</span>
              <span className="block text-sm font-normal text-slate-500">记录当天需要保留的上下文，可留空。</span>
              <textarea
                id="worklog-note-input"
                className="worklog-note-input min-h-24 w-full rounded-panel border border-outline bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                {...form.register("note")}
              />
            </label>
          </section>
          <div className="worklog-save-row flex flex-col-reverse gap-3 border-t border-outline/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <CalendarDays size={14} className="text-teal-700" />
              正在记录 {selectedDate}
            </p>
            <Button
              type="submit"
              loading={mutation.isPending}
              disabled={!form.formState.isValid || mutation.isPending}
            >
              <Check size={16} />
              {mutation.isPending ? "处理中..." : "保存今日记录"}
            </Button>
          </div>
        </form>}
      </Panel>

      <Panel
        className="worklog-recent-panel border-brand-100/70 bg-surface/80 shadow-float"
        title="最近记录"
        description="最近 7 条记录，点击日期即可返回编辑。"
      >
        {worklogsQuery.isPending && !worklogsQuery.data ? (
          <LoadingState label="正在加载工作量记录" />
        ) : worklogsQuery.isError && !worklogsQuery.data ? (
          <ErrorState
            message="工作量记录暂时无法加载"
            onRetry={() => void worklogsQuery.refetch()}
          />
        ) : <>
          {worklogsQuery.isFetching && <p role="status" className="mb-3 text-xs text-slate-500">正在刷新最近记录…</p>}
          {worklogsQuery.isError && worklogsQuery.data && <p role="alert" className="mb-3 text-xs text-amber-700">刷新失败，当前仍显示上次数据。 <button type="button" className="font-semibold underline" onClick={() => void worklogsQuery.refetch()}>重试</button></p>}
          {recentWorklogs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-3 py-3">日期</th>
                  <th className="px-3 py-3">行动总数</th>
                  <th className="px-3 py-3">读书 / 音频</th>
                  <th className="px-3 py-3">营业额</th>
                  <th className="px-3 py-3">备注</th>
                </tr>
              </thead>
              <tbody>
                {recentWorklogs.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 last:border-b-0 ${item.work_date === selectedDate ? "bg-teal-50/60" : ""}`}
                  >
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="font-semibold text-teal-800 hover:underline"
                        onClick={() => selectDate(item.work_date)}
                      >
                        {item.work_date}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {actionTotal(item)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.reading_minutes} / {item.audio_minutes} 分钟
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.turnover_pv == null ? "-" : `${item.turnover_pv} PV`}
                    </td>
                    <td className="max-w-xs truncate px-3 py-3 text-slate-500">
                      {item.note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
          <EmptyState
            title="还没有工作量记录"
            description="保存第一条每日记录后，它会显示在这里。"
          />
          )}
        </>}
      </Panel>
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <FileText size={14} className="text-teal-700" />
        记录属于当前账号，管理员无法读取。
      </p>
    </div>
  );
}
