import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Minus,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AuthResponse, Worklog, WorklogRequest } from "@/api/client";
import { listWorklogs, saveWorklog } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { TermHelp } from "@/components/ui/term-help";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/state-block";
import { businessDate, businessDateDaysAgo } from "@/lib/date";
import { errorMessage } from "@/lib/utils";
import { netAmountFromPV, pvFromNetAmount } from "@/lib/pv";

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
      Math.abs(
        Math.round(Number(value.turnover_pv) * 12.5 * 100) / 100 -
          Math.round(Number(value.turnover_net_amount) * 100) / 100,
      ) <= 0.01,
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
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const rangeStart = useMemo(
    () => businessDateDaysAgo(timezone, 90),
    [timezone],
  );
  const worklogsQuery = useQuery({
    queryKey: [
      "user",
      accountId,
      "worklogs",
      rangeStart,
      currentDate,
      selectedDate,
    ],
    queryFn: () => listWorklogs(rangeStart, currentDate),
  });
  const form = useForm<WorklogForm>({
    resolver: zodResolver(worklogSchema),
    defaultValues: formDefaults(selectedDate),
    mode: "onChange",
    reValidateMode: "onChange",
  });
  const existing = worklogsQuery.data?.data.items.find(
    (item) => item.work_date === selectedDate,
  );
  useEffect(() => {
    form.reset(existing ? fromWorklog(existing) : formDefaults(selectedDate));
  }, [existing, form, selectedDate]);
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
  const updatePV = (value: string) => {
    form.setValue("turnover_pv", value, { shouldDirty: true, shouldValidate: true });
    const converted = netAmountFromPV(value);
    if (converted !== null) form.setValue("turnover_net_amount", converted, { shouldDirty: true, shouldValidate: true });
  };
  const updateNetAmount = (value: string) => {
    form.setValue("turnover_net_amount", value, { shouldDirty: true, shouldValidate: true });
    const converted = pvFromNetAmount(value);
    if (converted !== null) form.setValue("turnover_pv", converted, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="每日行动"
        title="今日工作量"
        description="记录今天实际完成的行动、学习和营业额，保存后会用于统计、复盘和目标进度。"
        action={
          <div
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
            aria-label="业务日期导航"
          >
            <Button
              type="button"
              variant="icon"
              size="sm"
              className="h-10 w-10 p-0"
              aria-label="前一天"
              onClick={() => selectDate(shiftDate(selectedDate, -1))}
            >
              <ChevronLeft size={18} />
            </Button>
            <label className="relative flex h-10 min-w-[138px] items-center justify-center rounded-md px-2 text-sm font-bold tabular-nums text-slate-800 hover:bg-slate-50">
              <span aria-hidden="true">{selectedDate}</span>
              <input
                aria-label="业务日期"
                type="date"
                max={currentDate}
                value={selectedDate}
                onChange={(event) => selectDate(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <Button
              type="button"
              variant="icon"
              size="sm"
              className="h-10 w-10 p-0"
              aria-label="后一天"
              disabled={selectedDate >= currentDate}
              onClick={() =>
                selectDate(
                  shiftDate(selectedDate, 1) > currentDate
                    ? currentDate
                    : shiftDate(selectedDate, 1),
                )
              }
            >
              <ChevronRight size={18} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selectedDate === currentDate}
              onClick={() => selectDate(currentDate)}
            >
              今天
            </Button>
          </div>
        }
      />
      {(notice || error) && (
        <p
          role={error ? "alert" : "status"}
          className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}
        >
          {error || notice}
        </p>
      )}
      <section
        aria-label="今日概览"
        className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white px-2 py-3 shadow-sm sm:px-4"
      >
        <div className="px-2 sm:px-4">
          <p className="text-xs font-semibold text-slate-500">行动</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
            {actionCount}
          </p>
        </div>
        <div className="px-2 sm:px-4">
          <p className="text-xs font-semibold text-slate-500">学习</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
            {learningMinutes}
            <span className="ml-1 text-xs font-semibold text-slate-500">分钟</span>
          </p>
        </div>
        <div className="px-2 sm:px-4">
          <p className="text-xs font-semibold text-slate-500">净营业额</p>
          <p className="mt-1 truncate text-xl font-bold tabular-nums text-slate-950">
            {form.watch("turnover_net_amount").trim()
              ? `¥${Number.isFinite(netAmount) ? netAmount.toFixed(2) : "0.00"}`
              : `${pv || 0} PV`}
          </p>
        </div>
      </section>

      <Panel>
        <form className="space-y-0" onSubmit={onSubmit}>
          <input type="hidden" {...form.register("work_date")} />
          <section aria-labelledby="worklog-actions" className="pb-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center">
                  <h2 id="worklog-actions" className="text-base font-bold text-slate-950">
                    顾客行动
                  </h2>
                  <TermHelp
                    term="行动总数"
                    description="当天八类顾客行动数量的合计。"
                  />
                </div>
                <p className="mt-1 text-sm text-slate-500">点击加减快速记录，也可直接输入。</p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-teal-800">
                共 {actionCount} 次
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {countFields.map(([field, label]) => (
                <div
                  key={field}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                >
                  <label
                    htmlFor={`worklog-${field}`}
                    className="flex min-h-6 items-center text-sm font-semibold text-slate-700"
                  >
                    {label}
                    {label === "Buffer" && (
                      <TermHelp
                        term="Buffer"
                        description="按当前产品规则记录的顾客经营行动次数。"
                      />
                    )}
                  </label>
                  <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 w-11 p-0"
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
                      className="h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-1 text-center text-lg font-bold tabular-nums text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                      {...form.register(field, { valueAsNumber: true })}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 w-11 p-0"
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

          <div className="grid border-t border-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
            <section aria-labelledby="worklog-learning" className="py-7 lg:pr-7">
              <h2
                id="worklog-learning"
                className="mb-4 text-base font-bold text-slate-950"
              >
                成长投入
                <TermHelp
                  term="学习投入"
                  description="读书和音频分钟会汇总到学习中心，使用同一份事实源。"
                />
              </h2>
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
            </section>
            <section aria-labelledby="worklog-turnover" className="border-t border-slate-200 py-7 lg:border-t-0 lg:pl-7">
              <h2
                id="worklog-turnover"
                className="mb-4 text-base font-bold text-slate-950"
              >
                营业额
                <TermHelp
                  term="PV"
                  description="业务量单位，系统按 1 PV = ¥12.5 换算净营业额。"
                />
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={
                    <>
                      营业额 PV（可选）
                      <TermHelp
                        term="PV"
                        description="业务量单位，系统按 1 PV = ¥12.5 换算净营业额。"
                      />
                    </>
                  }
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
              <p className="mt-2 text-xs text-slate-500">
                1 PV = ¥12.5；两项同时填写时允许标准货币舍入误差。
              </p>
            </section>
          </div>

          <section aria-labelledby="worklog-note" className="border-t border-slate-200 py-7">
            <label className="block space-y-1.5" htmlFor="worklog-note-input">
              <span id="worklog-note" className="text-base font-bold text-slate-950">备注</span>
              <span className="block text-sm font-normal text-slate-500">记录当天需要保留的上下文，可留空。</span>
              <textarea
                id="worklog-note-input"
                className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                {...form.register("note")}
              />
            </label>
          </section>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
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
        </form>
      </Panel>

      <Panel
        title="最近记录"
        description="最近 7 条记录，点击日期即可返回编辑。"
      >
        {worklogsQuery.isPending ? (
          <LoadingState label="正在加载工作量记录" />
        ) : worklogsQuery.isError ? (
          <ErrorState
            message="工作量记录暂时无法加载"
            onRetry={() => void worklogsQuery.refetch()}
          />
        ) : recentWorklogs.length ? (
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
      </Panel>
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <FileText size={14} className="text-teal-700" />
        记录属于当前账号，管理员无法读取。
      </p>
    </div>
  );
}
