import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, CircleDollarSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AuthResponse, Turnover, TurnoverRequest } from "@/api/client";
import { listTurnovers, saveTurnover } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { businessDate, businessDateDaysAgo } from "@/lib/date";
import { errorMessage } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

const optionalNumber = z.preprocess((value) => value === "" || value == null || (typeof value === "number" && Number.isNaN(value)) ? undefined : Number(value), z.number().finite().min(0).optional());
const turnoverSchema = z.object({ turnover_date: z.string().min(1), pv: optionalNumber, net_amount: optionalNumber, note: z.string() }).refine((value) => value.pv !== undefined || value.net_amount !== undefined, { message: "PV 或净营业额至少填写一项", path: ["pv"] }).refine((value) => value.pv === undefined || value.net_amount === undefined || Math.abs(Math.round(value.pv * 12.5 * 100) / 100 - Math.round(value.net_amount * 100) / 100) <= 0.01, { message: "PV 与净营业额不一致", path: ["net_amount"] });
type TurnoverForm = z.infer<typeof turnoverSchema>;
type TurnoverFormInput = z.input<typeof turnoverSchema>;

function formDefaults(date: string): TurnoverForm { return { turnover_date: date, pv: undefined, net_amount: undefined, note: "" }; }
function fromTurnover(value: Turnover): TurnoverForm { return { turnover_date: value.turnover_date, pv: value.pv, net_amount: Number(value.net_amount), note: value.note ?? "" }; }

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
  const form = useForm<TurnoverFormInput, unknown, TurnoverForm>({ resolver: zodResolver(turnoverSchema), defaultValues: formDefaults(selectedDate) });
  useEffect(() => { form.reset(existing ? fromTurnover(existing) : formDefaults(selectedDate)); }, [existing, form, selectedDate]);
  const mutation = useMutation({ mutationFn: (value: TurnoverRequest) => saveTurnover(authResponse.data.csrf_token, value, Boolean(existing)), onSuccess: () => { setNotice("营业额已保存，PV 与净营业额来自同一条事实记录。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", authResponse.data.account.id] }); }, onError: (value) => { setError(errorMessage(value)); setNotice(""); } });
  const onSubmit = form.handleSubmit((value) => mutation.mutate({ turnover_date: value.turnover_date, pv: value.pv ?? null, net_amount: value.net_amount == null ? null : value.net_amount.toFixed(2), note: value.note.trim() || null }));
  const pvInput = form.watch("pv");
  const netInput = form.watch("net_amount");
  const pv = typeof pvInput === "number" && Number.isFinite(pvInput) ? pvInput : pvInput === "" ? undefined : Number(pvInput);
  const net = typeof netInput === "number" && Number.isFinite(netInput) ? netInput : netInput === "" ? undefined : Number(netInput);
  const calculated = pv == null ? (net == null || Number.isNaN(net) ? null : net / 12.5) : pv * 12.5;
  return <div className="space-y-7"><PageHeader eyebrow="经营结果" title="营业额" description="PV 和净营业额互相换算，但系统只保存一份每日营业额事实。" />{(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"><Panel title="登记每日营业额"><form className="space-y-5" onSubmit={onSubmit}><Input label="业务日期" type="date" {...form.register("turnover_date")} /><div className="grid gap-4 sm:grid-cols-2"><Input label="PV" type="number" min={0} step="0.01" error={form.formState.errors.pv?.message} {...form.register("pv", { valueAsNumber: true })} /><Input label="净营业额（元）" type="number" min={0} step="0.01" error={form.formState.errors.net_amount?.message} {...form.register("net_amount", { valueAsNumber: true })} /></div><div className="rounded-md bg-teal-50 p-4 text-sm text-teal-900"><ArrowRightLeft size={16} className="mr-2 inline" />{calculated == null ? "填写 PV 或净营业额，系统会按 1 PV = ¥12.5 换算。" : pv == null ? `按净营业额换算约 ${calculated.toFixed(2)} PV` : `按 PV 换算净营业额 ${formatMoney(calculated)}`}</div><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">备注</span><textarea className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" {...form.register("note")} /></label><Button type="submit" loading={mutation.isPending}><Check size={16} />{mutation.isPending ? "处理中..." : "保存营业额"}</Button></form></Panel><Panel title="换算规则"><p className="text-3xl font-bold text-slate-950">1 PV = ¥12.5</p><p className="mt-3 text-sm leading-6 text-slate-500">营业额是业务指标，不等于真实现金收入。输入两项时，允许标准货币舍入误差。</p></Panel></div><Panel title="营业额历史" description="点击日期编辑已有记录。">{query.isPending ? <LoadingState label="正在加载营业额" /> : query.isError ? <ErrorState message="营业额记录暂时无法加载" onRetry={() => void query.refetch()} /> : query.data.data.items.length ? <div className="overflow-x-auto"><table className="min-w-[620px] w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold text-slate-500"><tr><th className="px-3 py-3">日期</th><th className="px-3 py-3">PV</th><th className="px-3 py-3">净营业额</th><th className="px-3 py-3">备注</th></tr></thead><tbody>{query.data.data.items.map((item) => <tr key={item.id} className={`border-b border-slate-100 ${item.turnover_date === selectedDate ? "bg-teal-50/60" : ""}`}><td className="px-3 py-3"><button type="button" className="font-semibold text-teal-800 hover:underline" onClick={() => setSelectedDate(item.turnover_date)}>{item.turnover_date}</button></td><td className="px-3 py-3 font-semibold text-slate-900">{item.pv}</td><td className="px-3 py-3 text-slate-600">{formatMoney(item.net_amount)}</td><td className="px-3 py-3 text-slate-500">{item.note || "-"}</td></tr>)}</tbody></table></div> : <EmptyState title="还没有营业额记录" description="保存第一条每日营业额后，它会显示在这里。" />}</Panel><p className="flex items-center gap-2 text-xs text-slate-500"><CircleDollarSign size={14} className="text-teal-700" />营业额记录严格属于当前账号。</p></div>;
}
