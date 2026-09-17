import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, CircleDollarSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { AuthResponse, Turnover, TurnoverRequest } from "@/api/client";
import { listTurnovers, saveTurnover } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { businessDate, businessDateDaysAgo } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { netAmountFromPV, pvAndNetAmountMatch, pvFromNetAmount } from "@/lib/pv";
import { errorMessage } from "@/lib/utils";

const optionalDecimal = z.string().refine((value) => !value.trim() || Number.isFinite(Number(value)) && Number(value) >= 0, "请输入不小于 0 的数字");
const turnoverSchema = z.object({ turnover_date: z.string().min(1), pv: optionalDecimal, net_amount: optionalDecimal, note: z.string() })
  .refine((value) => value.pv.trim() || value.net_amount.trim(), { message: "PV 或净营业额至少填写一项", path: ["pv"] })
  .refine((value) => !value.pv.trim() || !value.net_amount.trim() || pvAndNetAmountMatch(value.pv, value.net_amount), { message: "PV 与净营业额不一致", path: ["net_amount"] });
type TurnoverForm = z.infer<typeof turnoverSchema>;

function formDefaults(date: string): TurnoverForm {
  return { turnover_date: date, pv: "", net_amount: "", note: "" };
}

function fromTurnover(value: Turnover): TurnoverForm {
  return { turnover_date: value.turnover_date, pv: value.pv.toString(), net_amount: Number(value.net_amount).toFixed(2), note: value.note ?? "" };
}

export function TurnoverPage({ authResponse }: { authResponse: AuthResponse }) {
  const queryClient = useQueryClient();
  const timezone = authResponse.data.account.timezone;
  const currentDate = businessDate(timezone);
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const rangeStart = useMemo(() => businessDateDaysAgo(timezone, 365), [timezone]);
  const query = useQuery({ queryKey: ["user", authResponse.data.account.id, "turnover", rangeStart, currentDate], queryFn: () => listTurnovers(rangeStart, currentDate) });
  const existing = query.data?.data.items.find((item) => item.turnover_date === selectedDate);
  const form = useForm<TurnoverForm>({ resolver: zodResolver(turnoverSchema), defaultValues: formDefaults(selectedDate), mode: "onChange", reValidateMode: "onChange" });
  useEffect(() => { form.reset(existing ? fromTurnover(existing) : formDefaults(selectedDate)); }, [existing, form, selectedDate]);
  const mutation = useMutation({ mutationFn: (value: TurnoverRequest) => saveTurnover(authResponse.data.csrf_token, value, Boolean(existing)), onSuccess: () => { setNotice("营业额已保存，PV 与净营业额来自同一条事实记录。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", authResponse.data.account.id] }); }, onError: (value) => { setError(errorMessage(value)); setNotice(""); } });
  const onSubmit = form.handleSubmit((value) => mutation.mutate({ turnover_date: value.turnover_date, pv: value.pv.trim() ? Number(value.pv) : null, net_amount: value.net_amount.trim() ? Number(value.net_amount).toFixed(2) : null, note: value.note.trim() || null }));
  const updatePV = (value: string) => {
    form.setValue("pv", value, { shouldDirty: true, shouldValidate: true });
    const converted = netAmountFromPV(value);
    if (converted !== null) form.setValue("net_amount", converted, { shouldDirty: true, shouldValidate: true });
  };
  const updateNetAmount = (value: string) => {
    form.setValue("net_amount", value, { shouldDirty: true, shouldValidate: true });
    const converted = pvFromNetAmount(value);
    if (converted !== null) form.setValue("pv", converted, { shouldDirty: true, shouldValidate: true });
  };

  return <div className="space-y-7">
    <PageHeader eyebrow="经营结果" title="营业额" description="PV 和净营业额双向实时同步，系统只保存一份每日营业额事实。" />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="登记每日营业额">
        <form className="space-y-5" onSubmit={onSubmit}>
          <Input label="业务日期" type="date" {...form.register("turnover_date")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="PV" type="number" min={0} step="0.01" error={form.formState.errors.pv?.message} {...form.register("pv")} onChange={(event) => updatePV(event.target.value)} />
            <Input label="净营业额（元）" type="number" min={0} step="0.01" error={form.formState.errors.net_amount?.message} {...form.register("net_amount")} onChange={(event) => updateNetAmount(event.target.value)} />
          </div>
          <div className="rounded-md bg-teal-50 p-4 text-sm font-semibold text-teal-900"><ArrowRightLeft size={16} className="mr-2 inline" />1 PV = ¥12.5</div>
          <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">备注</span><textarea className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" {...form.register("note")} /></label>
          <Button type="submit" loading={mutation.isPending} disabled={!form.formState.isValid}><Check size={16} />{mutation.isPending ? "处理中..." : "保存营业额"}</Button>
        </form>
      </Panel>
      <Panel title="换算规则"><p className="text-3xl font-bold text-slate-950">1 PV = ¥12.5</p><p className="mt-3 text-sm leading-6 text-slate-500">营业额是业务指标，不等于真实现金收入。编辑任一字段时，另一字段会立即更新。</p></Panel>
    </div>
    <Panel title="营业额历史" description="点击日期编辑已有记录。">
      {query.isPending ? <LoadingState label="正在加载营业额" /> : query.isError ? <ErrorState message="营业额记录暂时无法加载" onRetry={() => void query.refetch()} /> : query.data.data.items.length ? <div className="overflow-x-auto"><table className="min-w-[620px] w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold text-slate-500"><tr><th className="px-3 py-3">日期</th><th className="px-3 py-3">PV</th><th className="px-3 py-3">净营业额</th><th className="px-3 py-3">备注</th></tr></thead><tbody>{query.data.data.items.map((item) => <tr key={item.id} className={`border-b border-slate-100 ${item.turnover_date === selectedDate ? "bg-teal-50/60" : ""}`}><td className="px-3 py-3"><button type="button" className="font-semibold text-teal-800 hover:underline" onClick={() => setSelectedDate(item.turnover_date)}>{item.turnover_date}</button></td><td className="px-3 py-3 font-semibold text-slate-900">{item.pv}</td><td className="px-3 py-3 text-slate-600">{formatMoney(item.net_amount)}</td><td className="px-3 py-3 text-slate-500">{item.note || "-"}</td></tr>)}</tbody></table></div> : <EmptyState title="还没有营业额记录" description="保存第一条每日营业额后，它会显示在这里。" />}
    </Panel>
    <p className="flex items-center gap-2 text-xs text-slate-500"><CircleDollarSign size={14} className="text-teal-700" />营业额记录严格属于当前账号。</p>
  </div>;
}
