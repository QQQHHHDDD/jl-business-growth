import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Plus, WalletCards } from "lucide-react";
import { useState } from "react";
import type { AuthResponse, FinanceCategory, FinanceTransaction } from "@/api/client";
import { archiveFinanceCategory, createFinanceCategory, listFinanceBudgets, listFinanceCategories, listFinanceSnapshots, listFinanceTransactions, saveFinanceBudget, saveFinanceSnapshot, saveFinanceTransaction } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { businessDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { errorMessage } from "@/lib/utils";

type TransactionForm = { occurred_on: string; type: "INCOME" | "EXPENSE"; category_id: string; amount: string; description: string; note: string };
const emptyTransaction: TransactionForm = { occurred_on: "", type: "EXPENSE", category_id: "", amount: "", description: "", note: "" };

export function FinancePage({ authResponse }: { authResponse: AuthResponse }) {
  const account = authResponse.data.account;
  const accountId = account.id;
  const client = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["user", accountId, "finance-categories"], queryFn: listFinanceCategories });
  const transactionsQuery = useQuery({ queryKey: ["user", accountId, "finance-transactions"], queryFn: () => listFinanceTransactions() });
  const budgetsQuery = useQuery({ queryKey: ["user", accountId, "finance-budgets"], queryFn: listFinanceBudgets });
  const snapshotsQuery = useQuery({ queryKey: ["user", accountId, "finance-snapshots"], queryFn: listFinanceSnapshots });
  const [transaction, setTransaction] = useState<TransactionForm>({ ...emptyTransaction, occurred_on: businessDate(account.timezone) });
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [budget, setBudget] = useState({ month: businessDate(account.timezone).slice(0, 7) + "-01", amount: "" });
  const [snapshot, setSnapshot] = useState({ date: businessDate(account.timezone), kind: "SAVINGS" as "SAVINGS" | "EMERGENCY_FUND", amount: "", note: "" });
  const [removeTarget, setRemoveTarget] = useState<FinanceCategory | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const invalidate = (key: string) => void client.invalidateQueries({ queryKey: ["user", accountId, key] });
  const categories = categoriesQuery.data?.data.items.filter((item) => !item.archived_at) ?? [];
  const transactionMutation = useMutation({
    mutationFn: () => saveFinanceTransaction(authResponse.data.csrf_token, { occurred_on: transaction.occurred_on, type: transaction.type, category_id: transaction.category_id, amount: transaction.amount, description: transaction.description.trim() || null, note: transaction.note.trim() || null, source: "MANUAL" }),
    onSuccess: () => { setTransaction({ ...emptyTransaction, occurred_on: businessDate(account.timezone) }); setNotice("财务流水已保存"); setError(""); invalidate("finance-transactions"); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const categoryMutation = useMutation({
    mutationFn: () => createFinanceCategory(authResponse.data.csrf_token, { name: categoryName.trim(), type: categoryType }),
    onSuccess: () => { setCategoryName(""); setNotice("财务分类已创建"); setError(""); invalidate("finance-categories"); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveFinanceCategory(authResponse.data.csrf_token, removeTarget!.id),
    onSuccess: () => { setRemoveTarget(null); setNotice("财务分类已归档"); invalidate("finance-categories"); },
    onError: (value) => setError(errorMessage(value)),
  });
  const budgetMutation = useMutation({
    mutationFn: () => saveFinanceBudget(authResponse.data.csrf_token, { month: budget.month, amount: budget.amount, category_id: null }),
    onSuccess: () => { setNotice("月度总预算已保存"); setError(""); invalidate("finance-budgets"); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const snapshotMutation = useMutation({
    mutationFn: () => saveFinanceSnapshot(authResponse.data.csrf_token, { snapshot_date: snapshot.date, kind: snapshot.kind, amount: snapshot.amount, note: snapshot.note.trim() || null }),
    onSuccess: () => { setNotice("资金快照已保存"); setError(""); invalidate("finance-snapshots"); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  if (categoriesQuery.isPending || transactionsQuery.isPending || budgetsQuery.isPending || snapshotsQuery.isPending) return <LoadingState label="正在加载财务工作台" />;
  if (categoriesQuery.isError || transactionsQuery.isError || budgetsQuery.isError || snapshotsQuery.isError) return <ErrorState message="财务数据暂时无法加载" onRetry={() => { void categoriesQuery.refetch(); void transactionsQuery.refetch(); void budgetsQuery.refetch(); void snapshotsQuery.refetch(); }} />;
  return <div className="space-y-7">
    <PageHeader eyebrow="经营数据" title="财务" description="记录经营流水、月度预算和储蓄快照。系统不连接银行卡，也不建立外部账户账本。" action={<WalletCards className="text-teal-700" size={28} aria-hidden="true" />} />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel title="记录财务流水" description="金额使用人民币，收入和支出分别选择对应分类。">
        <div className="grid gap-4 sm:grid-cols-2"><Input label="发生日期" type="date" value={transaction.occurred_on} onChange={(event) => setTransaction({ ...transaction, occurred_on: event.target.value })} required /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">类型</span><select className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={transaction.type} onChange={(event) => setTransaction({ ...transaction, type: event.target.value as TransactionForm["type"], category_id: "" })}><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select></label></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">分类</span><select aria-label="流水分类" className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={transaction.category_id} onChange={(event) => setTransaction({ ...transaction, category_id: event.target.value })} required><option value="">请选择分类</option>{categories.filter((item) => item.type === transaction.type).map((item) => <option key={item.id} value={item.id}>{item.name}{item.system_default ? "（系统）" : ""}</option>)}</select></label><Input label="金额" type="number" min="0" step="0.01" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} required /></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><Input label="摘要" value={transaction.description} onChange={(event) => setTransaction({ ...transaction, description: event.target.value })} /><Input label="备注" value={transaction.note} onChange={(event) => setTransaction({ ...transaction, note: event.target.value })} /></div>
        <div className="mt-5 flex justify-end"><Button onClick={() => transactionMutation.mutate()} loading={transactionMutation.isPending} disabled={!transaction.category_id || !transaction.amount}><Check size={16} />保存流水</Button></div>
      </Panel>
      <Panel title="自定义分类" description="有流水引用的分类只能归档，不会被硬删除。"><div className="space-y-4"><Input label="分类名称" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">分类类型</span><select className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={categoryType} onChange={(event) => setCategoryType(event.target.value as typeof categoryType)}><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select></label><Button onClick={() => categoryMutation.mutate()} loading={categoryMutation.isPending} disabled={!categoryName.trim()}><Plus size={16} />新增分类</Button></div><div className="mt-6 space-y-2">{categories.length ? categories.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"><span className="text-sm font-semibold text-slate-800">{item.name} <span className="text-xs font-normal text-slate-500">{item.type === "INCOME" ? "收入" : "支出"}{item.system_default ? " · 系统" : ""}</span></span>{!item.system_default && <Button variant="icon" size="sm" aria-label={`归档分类 ${item.name}`} onClick={() => setRemoveTarget(item)}><Archive size={15} /></Button>}</div>) : <EmptyState title="暂无分类" description="先创建一个分类。" />}</div></Panel>
    </div>
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel title="月度总预算"><div className="space-y-4"><Input label="月份" type="month" value={budget.month.slice(0, 7)} onChange={(event) => setBudget({ ...budget, month: `${event.target.value}-01` })} /><Input label="预算金额" type="number" min="0" step="0.01" value={budget.amount} onChange={(event) => setBudget({ ...budget, amount: event.target.value })} /><Button onClick={() => budgetMutation.mutate()} loading={budgetMutation.isPending} disabled={!budget.amount}><Check size={16} />保存预算</Button></div><div className="mt-5 space-y-2">{budgetsQuery.data.data.items.length ? budgetsQuery.data.data.items.map((item) => <div key={item.id} className="flex justify-between border-b border-slate-100 py-2 text-sm"><span>{item.month}</span><strong>{formatMoney(item.amount)}</strong></div>) : <EmptyState title="暂无预算" description="保存第一个月度总预算。" />}</div></Panel>
      <Panel title="储蓄与应急资金"><div className="space-y-4"><Input label="快照日期" type="date" value={snapshot.date} onChange={(event) => setSnapshot({ ...snapshot, date: event.target.value })} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">快照类型</span><select className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={snapshot.kind} onChange={(event) => setSnapshot({ ...snapshot, kind: event.target.value as typeof snapshot.kind })}><option value="SAVINGS">储蓄</option><option value="EMERGENCY_FUND">应急资金</option></select></label><Input label="金额" type="number" min="0" step="0.01" value={snapshot.amount} onChange={(event) => setSnapshot({ ...snapshot, amount: event.target.value })} /><Input label="备注" value={snapshot.note} onChange={(event) => setSnapshot({ ...snapshot, note: event.target.value })} /><Button onClick={() => snapshotMutation.mutate()} loading={snapshotMutation.isPending} disabled={!snapshot.amount}><Check size={16} />保存快照</Button></div><div className="mt-5 space-y-2">{snapshotsQuery.data.data.items.length ? snapshotsQuery.data.data.items.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm"><span>{item.snapshot_date} · {item.kind === "SAVINGS" ? "储蓄" : "应急资金"}</span><strong>{formatMoney(item.amount)}</strong></div>) : <EmptyState title="暂无资金快照" description="保存一条当前资金状态。" />}</div></Panel>
      <Panel title="最近流水" description="默认显示最近 30 天。">{transactionsQuery.data.data.items.length ? <div className="overflow-x-auto"><table className="min-w-[560px] w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="px-2 py-2">日期</th><th className="px-2 py-2">类型</th><th className="px-2 py-2">金额</th><th className="px-2 py-2">摘要</th></tr></thead><tbody>{transactionsQuery.data.data.items.slice(0, 12).map((item) => <TransactionRow key={item.id} item={item} categories={categories} />)}</tbody></table></div> : <EmptyState title="暂无流水" description="保存第一条经营流水。" />}</Panel>
    </div>
    <ConfirmDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)} title="确认归档分类" description={removeTarget ? `确定归档“${removeTarget.name}”吗？归档后不能用于新流水。` : ""} confirmLabel="归档" loading={archiveMutation.isPending} onConfirm={() => archiveMutation.mutate()} />
  </div>;
}

function TransactionRow({ item, categories }: { item: FinanceTransaction; categories: FinanceCategory[] }) {
  const category = categories.find((value) => value.id === item.category_id);
  return <tr className="border-b border-slate-100 last:border-0"><td className="px-2 py-3">{item.occurred_on}</td><td className="px-2 py-3"><StatusBadge tone={item.type === "INCOME" ? "success" : "warning"}>{item.type === "INCOME" ? "收入" : "支出"}</StatusBadge></td><td className="px-2 py-3 font-semibold">{formatMoney(item.amount)}</td><td className="px-2 py-3 text-slate-600">{category?.name ?? item.description ?? "未命名"}</td></tr>;
}
