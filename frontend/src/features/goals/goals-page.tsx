import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AuthResponse, Dream, FileAsset, Goal, GoalRequest } from "@/api/client";
import { deleteDream, deleteGoal, listDreams, listFiles, listGoals, saveDream, saveGoal, uploadFile } from "@/api/client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/utils";

const goalTypes = ["LONG_TERM", "YEAR", "STAGE", "MONTH", "WEEK", "DAY"] as const;
const metricCodes = ["conversation_open_count", "deep_conversation_count", "buffer_count", "story_share_count", "screening_count", "opportunity_count", "meeting_count", "customer_followup_count", "reading_minutes", "audio_minutes", "turnover_pv", "turnover_net_amount"] as const;
const goalSchema = z.object({
  title: z.string().trim().min(1, "请输入目标名称").max(200),
  type: z.enum(goalTypes),
  parent_id: z.string(),
  start_date: z.string(),
  due_date: z.string(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED", "CANCELLED"]),
  metric_code: z.string(),
  target_value: z.number().finite().min(0).optional(),
  unit: z.string().max(32),
});
const dreamSchema = z.object({ title: z.string().trim().min(1, "请输入梦想名称").max(200), description: z.string() });
type GoalForm = z.infer<typeof goalSchema>;
type DreamForm = z.infer<typeof dreamSchema>;
type GoalsView = "map" | "list" | "dreams";
type GoalSheetState = { mode: "create" } | { mode: "edit" | "detail"; goal: Goal } | null;

const typeLabels: Record<string, string> = { LONG_TERM: "长期", YEAR: "年度", STAGE: "阶段", MONTH: "月度", WEEK: "周", DAY: "日" };
const statusLabels: Record<string, string> = { NOT_STARTED: "未开始", IN_PROGRESS: "进行中", COMPLETED: "已完成", PAUSED: "已暂停", CANCELLED: "已取消" };
const statusTones: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { NOT_STARTED: "neutral", IN_PROGRESS: "info", COMPLETED: "success", PAUSED: "warning", CANCELLED: "danger" };

const defaultGoal = (): GoalForm => ({ title: "", type: "YEAR", parent_id: "", start_date: "", due_date: "", status: "NOT_STARTED", metric_code: "", target_value: undefined, unit: "" });
function goalForm(value: Goal): GoalForm {
  const metric = value.metrics[0];
  return { title: value.title, type: value.type, parent_id: value.parent_id ?? "", start_date: value.start_date ?? "", due_date: value.due_date ?? "", status: value.status, metric_code: metric?.metric_code ?? "", target_value: metric?.target_value, unit: metric?.unit ?? "" };
}

export function GoalsPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountID = authResponse.data.account.id;
  const queryClient = useQueryClient();
  const goalsQuery = useQuery({ queryKey: ["user", accountID, "goals"], queryFn: listGoals });
  const dreamsQuery = useQuery({ queryKey: ["user", accountID, "dreams"], queryFn: listDreams });
  const filesQuery = useQuery({ queryKey: ["user", accountID, "files"], queryFn: listFiles });
  const [view, setView] = useState<GoalsView>("map");
  const [goalSheet, setGoalSheet] = useState<GoalSheetState>(null);
  const [dreamSheet, setDreamSheet] = useState<Dream | "new" | null>(null);
  const [dreamFiles, setDreamFiles] = useState<string[]>([]);
  const [dreamGoals, setDreamGoals] = useState<string[]>([]);
  const [dreamFile, setDreamFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "goal" | "dream"; id: string; title: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const goalReturnFocus = useRef<HTMLElement | null>(null);
  const dreamReturnFocus = useRef<HTMLElement | null>(null);
  const goalFormState = useForm<GoalForm>({ resolver: zodResolver(goalSchema), defaultValues: defaultGoal() });
  const dreamFormState = useForm<DreamForm>({ resolver: zodResolver(dreamSchema), defaultValues: { title: "", description: "" } });
  const editingGoal = goalSheet?.mode === "edit" ? goalSheet.goal : null;

  const openGoalSheet = (value: NonNullable<GoalSheetState>) => {
    goalReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGoalSheet(value);
  };
  const closeGoalSheet = () => {
    setGoalSheet(null);
    window.setTimeout(() => goalReturnFocus.current?.focus(), 0);
  };
  const closeDreamSheet = () => {
    setDreamSheet(null);
    window.setTimeout(() => dreamReturnFocus.current?.focus(), 0);
  };

  useEffect(() => {
    goalFormState.reset(editingGoal ? goalForm(editingGoal) : defaultGoal());
  }, [editingGoal, goalFormState]);

  const goals = useMemo(() => goalsQuery.data?.data.items ?? [], [goalsQuery.data]);
  const files = filesQuery.data?.data.items.filter((file) => file.category === "DREAM_IMAGE") ?? [];
  const filteredGoals = goals.filter((goal) => goal.title.toLowerCase().includes(search.toLowerCase()) && (!typeFilter || goal.type === typeFilter) && (!statusFilter || goal.status === statusFilter));

  const goalMutation = useMutation({
    mutationFn: (value: GoalRequest) => saveGoal(authResponse.data.csrf_token, value, editingGoal?.id),
    onSuccess: () => { setNotice(editingGoal ? "目标已更新。" : "目标已创建。"); setError(""); closeGoalSheet(); void queryClient.invalidateQueries({ queryKey: ["user", accountID] }); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const dreamMutation = useMutation({
    mutationFn: (value: DreamForm) => saveDream(authResponse.data.csrf_token, { title: value.title, description: value.description || null, goal_ids: dreamGoals, sort_order: dreamSheet === "new" ? 0 : dreamSheet?.sort_order ?? 0, file_ids: dreamFiles }, dreamSheet === "new" ? undefined : dreamSheet?.id),
    onSuccess: () => { setNotice("梦想已保存。"); setError(""); closeDreamSheet(); void queryClient.invalidateQueries({ queryKey: ["user", accountID, "dreams"] }); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const uploadMutation = useMutation({
    mutationFn: () => uploadFile(authResponse.data.csrf_token, dreamFile!, "DREAM_IMAGE"),
    onSuccess: (value) => { setDreamFile(null); setDreamFiles((current) => [...current, value.data.id]); setNotice("梦想图片已上传，请保存梦想完成关联。"); void queryClient.invalidateQueries({ queryKey: ["user", accountID, "files"] }); },
    onError: (value) => setError(errorMessage(value)),
  });
  const deleteMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: "goal" | "dream"; id: string }) => kind === "goal" ? deleteGoal(authResponse.data.csrf_token, id) : deleteDream(authResponse.data.csrf_token, id),
    onSuccess: () => { setNotice("已删除。目标子树和关联关系会同步清理。"); setError(""); setDeleteTarget(null); closeGoalSheet(); closeDreamSheet(); void queryClient.invalidateQueries({ queryKey: ["user", accountID] }); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });

  const onGoalSubmit = goalFormState.handleSubmit((value) => {
    const metrics = value.metric_code ? [{ metric_code: value.metric_code as NonNullable<GoalRequest["metrics"]>[number]["metric_code"], target_value: value.target_value ?? 0, unit: value.unit || "次" }] : [];
    goalMutation.mutate({ title: value.title, type: value.type, parent_id: value.parent_id || null, description: null, start_date: value.start_date || null, due_date: value.due_date || null, status: value.status, sort_order: 0, metrics });
  });
  const openDream = (value: Dream | "new") => {
    dreamReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDreamSheet(value);
    setDreamFile(null);
    if (value === "new") {
      setDreamFiles([]); setDreamGoals([]); dreamFormState.reset({ title: "", description: "" });
    } else {
      setDreamFiles(value.file_ids); setDreamGoals(value.goal_ids); dreamFormState.reset({ title: value.title, description: value.description ?? "" });
    }
  };

  if (goalsQuery.isPending || dreamsQuery.isPending || filesQuery.isPending) return <LoadingState label="正在加载目标工作台" />;
  if (goalsQuery.isError || dreamsQuery.isError || filesQuery.isError) return <ErrorState message="目标数据暂时无法加载" onRetry={() => { void goalsQuery.refetch(); void dreamsQuery.refetch(); void filesQuery.refetch(); }} />;

  const activeAction = view === "dreams"
    ? <Button onClick={() => openDream("new")}><Plus size={16} />新增梦想</Button>
    : <Button onClick={() => openGoalSheet({ mode: "create" })}><Plus size={16} />新建目标</Button>;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="方向与执行" title="梦想与目标" description="用层级目标把长期方向拆成可行动的路径。设置量化指标后，目标进度可根据已记录的工作量或营业额自动计算。" action={activeAction} />
      {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
      <Tabs value={view} onValueChange={(value) => setView(value as GoalsView)}>
        <TabsList aria-label="目标工作台视图"><TabsTrigger value="map">目标地图</TabsTrigger><TabsTrigger value="list">目标列表</TabsTrigger><TabsTrigger value="dreams">梦想板</TabsTrigger></TabsList>
      </Tabs>

      {view === "map" && <GoalMap goals={goals} onSelect={(goal) => openGoalSheet({ mode: "detail", goal })} onCreate={() => openGoalSheet({ mode: "create" })} />}
      {view === "list" && <GoalListView goals={filteredGoals} search={search} typeFilter={typeFilter} statusFilter={statusFilter} onSearch={setSearch} onTypeFilter={setTypeFilter} onStatusFilter={setStatusFilter} onView={(goal) => openGoalSheet({ mode: "detail", goal })} onEdit={(goal) => openGoalSheet({ mode: "edit", goal })} onDelete={(goal) => setDeleteTarget({ kind: "goal", id: goal.id, title: goal.title })} />}
      {view === "dreams" && <DreamBoard dreams={dreamsQuery.data.data.items} goals={goals} files={files} onSelect={openDream} onCreate={() => openDream("new")} onDelete={(dream) => setDeleteTarget({ kind: "dream", id: dream.id, title: dream.title })} />}

      <Sheet open={Boolean(goalSheet)} onOpenChange={(open) => !open && closeGoalSheet()}>
        {goalSheet?.mode === "detail" ? (
          <SheetContent title={goalSheet.goal.title} description={`${typeLabels[goalSheet.goal.type]}目标详情`} footer={<div className="flex justify-end gap-3"><Button variant="danger" onClick={() => setDeleteTarget({ kind: "goal", id: goalSheet.goal.id, title: goalSheet.goal.title })}><Trash2 size={16} />删除</Button><Button onClick={() => setGoalSheet({ mode: "edit", goal: goalSheet.goal })}>编辑目标</Button></div>}>
            <GoalDetail goal={goalSheet.goal} goals={goals} />
          </SheetContent>
        ) : goalSheet ? (
          <SheetContent title={goalSheet.mode === "edit" ? "编辑目标" : "新建目标"} description="父子关系仅通过表单修改，不会因拖动画布而改变。" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={closeGoalSheet}>取消</Button><Button onClick={() => void onGoalSubmit()} loading={goalMutation.isPending}><Check size={16} />{goalSheet.mode === "edit" ? "保存目标" : "创建目标"}</Button></div>}>
            <GoalEditor form={goalFormState} goals={goals} editingID={editingGoal?.id} />
          </SheetContent>
        ) : null}
      </Sheet>

      <Sheet open={Boolean(dreamSheet)} onOpenChange={(open) => !open && closeDreamSheet()}>
        {dreamSheet && <SheetContent title={dreamSheet === "new" ? "新增梦想" : "编辑梦想"} description="用图片、文字和关联目标呈现希望实现的方向。" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={closeDreamSheet}>取消</Button><Button onClick={() => void dreamFormState.handleSubmit((value) => dreamMutation.mutate(value))()} loading={dreamMutation.isPending}><Sparkles size={16} />保存梦想</Button></div>}>
          <DreamEditor form={dreamFormState} goals={goals} files={files} selectedFiles={dreamFiles} selectedGoals={dreamGoals} pendingFile={dreamFile} uploading={uploadMutation.isPending} onFileChange={setDreamFile} onUpload={() => uploadMutation.mutate()} onToggleFile={(id) => setDreamFiles((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} onToggleGoal={(id) => setDreamGoals((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} />
        </SheetContent>}
      </Sheet>

      <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title="确认删除" description={deleteTarget ? `确定要删除“${deleteTarget.title}”吗？${deleteTarget.kind === "goal" ? "它的子目标和指标也会被删除。" : "关联关系也会被删除。"}` : ""} confirmLabel="删除" loading={deleteMutation.isPending} onConfirm={() => deleteTarget && deleteMutation.mutate({ kind: deleteTarget.kind, id: deleteTarget.id })} />
    </div>
  );
}

function GoalMap({ goals, onSelect, onCreate }: { goals: Goal[]; onSelect: (goal: Goal) => void; onCreate: () => void }) {
  return <Panel title="目标地图" description="父子目标以连线表达，点击节点查看详细信息和自动进度。"><div className="h-[min(68vh,720px)] min-h-[480px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">{goals.length ? <ReactFlow nodes={goalNodes(goals)} edges={goalEdges(goals)} fitView minZoom={0.35} maxZoom={1.8} nodesDraggable={false} onNodeClick={(_, node) => { const goal = goals.find((item) => item.id === node.id); if (goal) onSelect(goal); }}><MiniMap pannable zoomable /><Controls /><Background gap={20} size={1} /></ReactFlow> : <div className="grid h-full place-items-center px-6"><div className="max-w-sm text-center"><p className="font-bold text-slate-950">还没有目标</p><p className="mt-2 text-sm leading-6 text-slate-500">建立第一个目标后，这里会呈现清晰的执行路径。</p><Button className="mt-4" onClick={onCreate}><Plus size={16} />新建目标</Button></div></div>}</div></Panel>;
}

function GoalListView({ goals, search, typeFilter, statusFilter, onSearch, onTypeFilter, onStatusFilter, onView, onEdit, onDelete }: { goals: Goal[]; search: string; typeFilter: string; statusFilter: string; onSearch: (value: string) => void; onTypeFilter: (value: string) => void; onStatusFilter: (value: string) => void; onView: (goal: Goal) => void; onEdit: (goal: Goal) => void; onDelete: (goal: Goal) => void }) {
  return <Panel title="目标列表" description="搜索、筛选并处理目标。"><div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]"><Input label="搜索目标" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="输入目标名称" /><Select label="目标层级" value={typeFilter} onChange={(event) => onTypeFilter(event.target.value)}><option value="">全部层级</option>{goalTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</Select><Select label="目标状态" value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}><option value="">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>{goals.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold text-slate-500"><tr><th className="px-3 py-3">目标</th><th className="px-3 py-3">层级</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">自动进度</th><th className="px-3 py-3 text-right">操作</th></tr></thead><tbody>{goals.map((goal) => <tr key={goal.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3"><button type="button" className="font-bold text-slate-900 hover:text-teal-800" onClick={() => onView(goal)}>{goal.title}</button><p className="mt-1 text-xs text-slate-500">{goal.metrics.length ? `${goal.metrics.length} 个指标` : "无量化指标"}</p></td><td className="px-3 py-3 text-slate-600">{typeLabels[goal.type]}</td><td className="px-3 py-3"><StatusBadge tone={statusTones[goal.status]}>{statusLabels[goal.status]}</StatusBadge></td><td className="px-3 py-3 font-bold tabular-nums text-teal-800">{Math.round(goal.progress * 100)}%</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onEdit(goal)}>编辑</Button><Button variant="icon" size="sm" aria-label={`删除目标 ${goal.title}`} onClick={() => onDelete(goal)}><Trash2 size={15} /></Button></div></td></tr>)}</tbody></table></div> : <EmptyState title="没有匹配的目标" description="调整搜索或筛选条件。" />}</Panel>;
}

function DreamBoard({ dreams, goals, files, onSelect, onCreate, onDelete }: { dreams: Dream[]; goals: Goal[]; files: FileAsset[]; onSelect: (dream: Dream) => void; onCreate: () => void; onDelete: (dream: Dream) => void }) {
  if (!dreams.length) return <Panel><div className="py-8 text-center"><ImageIcon className="mx-auto text-slate-300" size={32} /><p className="mt-3 font-bold text-slate-950">梦想板还是空的</p><p className="mt-2 text-sm text-slate-500">添加梦想、图片并关联正在推进的目标。</p><Button className="mt-4" onClick={onCreate}><Plus size={16} />新增梦想</Button></div></Panel>;
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{dreams.map((dream) => { const image = files.find((file) => file.id === dream.file_ids[0]); const linkedGoals = goals.filter((goal) => dream.goal_ids.includes(goal.id)); return <article key={dream.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel"><button type="button" className="block w-full text-left" onClick={() => onSelect(dream)}>{image ? <img className="aspect-[16/9] w-full object-cover" src={`/api/files/${image.id}/content?disposition=inline`} alt={image.original_name} /> : <div className="grid aspect-[16/9] place-items-center bg-slate-100 text-slate-400"><ImageIcon size={30} /></div>}<div className="p-4"><h2 className="font-bold text-slate-950 group-hover:text-teal-800">{dream.title}</h2>{dream.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{dream.description}</p>}<p className="mt-3 text-xs font-semibold text-slate-500">关联目标 {linkedGoals.length}</p></div></button><div className="flex justify-end border-t border-slate-100 px-3 py-2"><Button variant="icon" size="sm" aria-label={`删除梦想 ${dream.title}`} onClick={() => onDelete(dream)}><Trash2 size={15} /></Button></div></article>; })}</div>;
}

function GoalEditor({ form, goals, editingID }: { form: UseFormReturn<GoalForm>; goals: Goal[]; editingID?: string }) {
  return <form className="space-y-5" onSubmit={(event) => event.preventDefault()}><Input label="目标名称" required error={form.formState.errors.title?.message} {...form.register("title")} /><div className="grid gap-4 sm:grid-cols-2"><Select label="目标层级" {...form.register("type")}>{goalTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</Select><Select label="父目标" {...form.register("parent_id")}><option value="">无父目标</option>{goals.filter((goal) => goal.id !== editingID).map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</Select></div><div className="grid gap-4 sm:grid-cols-2"><Input label="开始日期" type="date" {...form.register("start_date")} /><Input label="截止日期" type="date" {...form.register("due_date")} /></div><Select label="状态" {...form.register("status")}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><div className="border-t border-slate-200 pt-5"><p className="mb-4 text-sm font-bold text-slate-900">量化指标（可选）</p><div className="space-y-4"><Select label="指标" {...form.register("metric_code")}><option value="">暂不设置</option>{metricCodes.map((code) => <option key={code} value={code}>{metricLabel(code)}</option>)}</Select><div className="grid gap-4 sm:grid-cols-2"><Input label="目标值" type="number" min={0} step="0.01" {...form.register("target_value", { valueAsNumber: true })} /><Input label="单位" placeholder="次 / PV / 分钟" {...form.register("unit")} /></div></div></div></form>;
}

function DreamEditor({ form, goals, files, selectedFiles, selectedGoals, pendingFile, uploading, onFileChange, onUpload, onToggleFile, onToggleGoal }: { form: UseFormReturn<DreamForm>; goals: Goal[]; files: FileAsset[]; selectedFiles: string[]; selectedGoals: string[]; pendingFile: File | null; uploading: boolean; onFileChange: (file: File | null) => void; onUpload: () => void; onToggleFile: (id: string) => void; onToggleGoal: (id: string) => void }) {
  return <form className="space-y-6" onSubmit={(event) => event.preventDefault()}><Input label="梦想标题" required error={form.formState.errors.title?.message} {...form.register("title")} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">梦想描述</span><textarea className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" placeholder="描述这个方向" {...form.register("description")} /></label><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">关联目标</h3>{goals.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{goals.map((goal) => <label key={goal.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><input type="checkbox" checked={selectedGoals.includes(goal.id)} onChange={() => onToggleGoal(goal.id)} /><span className="font-semibold text-slate-700">{goal.title}</span></label>)}</div> : <p className="mt-2 text-sm text-slate-500">暂无可关联目标。</p>}</section><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">梦想图片</h3><div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-[220px] flex-1 space-y-1.5"><span className="text-sm font-semibold text-slate-700">选择图片</span><input aria-label="选择梦想图片" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} /></label><Button type="button" variant="secondary" onClick={onUpload} loading={uploading} disabled={!pendingFile}><Upload size={16} />上传</Button></div>{files.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3">{files.map((item) => <label key={item.id} className={`cursor-pointer rounded-lg border p-2 ${selectedFiles.includes(item.id) ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}><input className="sr-only" type="checkbox" checked={selectedFiles.includes(item.id)} onChange={() => onToggleFile(item.id)} /><FileThumb file={item} /><span className="mt-1 block truncate text-xs text-slate-600">{item.original_name}</span></label>)}</div>}</section></form>;
}

function GoalDetail({ goal, goals }: { goal: Goal; goals: Goal[] }) {
  const parent = goals.find((item) => item.id === goal.parent_id);
  const children = goals.filter((item) => item.parent_id === goal.id);
  return <div className="space-y-6"><div className="flex items-center justify-between gap-4"><StatusBadge tone={statusTones[goal.status]}>{statusLabels[goal.status]}</StatusBadge><strong className="text-2xl tabular-nums text-teal-800">{Math.round(goal.progress * 100)}%</strong></div><div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, goal.progress * 100)}%` }} /></div><p className="mt-2 text-xs text-slate-500">进度由目标范围内的真实记录自动计算。</p></div><dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-slate-500">目标层级</dt><dd className="font-semibold text-slate-900">{typeLabels[goal.type]}</dd><dt className="text-slate-500">父目标</dt><dd className="font-semibold text-slate-900">{parent?.title ?? "无"}</dd><dt className="text-slate-500">开始日期</dt><dd className="font-semibold text-slate-900">{goal.start_date || "未设置"}</dd><dt className="text-slate-500">截止日期</dt><dd className="font-semibold text-slate-900">{goal.due_date || "未设置"}</dd></dl><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">量化指标</h3>{goal.metrics.length ? <div className="mt-3 space-y-3">{goal.metrics.map((metric) => <div key={metric.metric_code} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-4"><span className="font-semibold text-slate-700">{metricLabel(metric.metric_code)}</span><span className="tabular-nums text-slate-600">{metric.actual_value} / {metric.target_value} {metric.unit}</span></div></div>)}</div> : <p className="mt-2 text-sm text-slate-500">未设置量化指标。</p>}</section><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">子目标</h3>{children.length ? <ul className="mt-3 space-y-2 text-sm text-slate-700">{children.map((child) => <li key={child.id} className="rounded-lg bg-slate-50 px-3 py-2.5 font-semibold">{child.title}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">暂无子目标。</p>}</section></div>;
}

function Select({ label, children, ...props }: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span><select className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" {...props}>{children}</select></label>;
}
function FileThumb({ file }: { file: FileAsset }) { return <img className="h-24 w-full rounded-md object-cover" src={`/api/files/${file.id}/content?disposition=inline`} alt={file.original_name} />; }
function metricLabel(code: string): string { const labels: Record<string, string> = { conversation_open_count: "开启对话", deep_conversation_count: "深入对话", buffer_count: "Buffer", story_share_count: "分享故事", screening_count: "筛选", opportunity_count: "提供机会", meeting_count: "会面", customer_followup_count: "顾客跟进", reading_minutes: "读书分钟", audio_minutes: "听音频分钟", turnover_pv: "营业额 PV", turnover_net_amount: "净营业额" }; return labels[code] ?? code; }
function goalNodes(goals: Goal[]): Node[] { const byID = new Map(goals.map((goal) => [goal.id, goal])); const rowsByDepth = new Map<number, number>(); return goals.map((goal) => { let depth = 0; let parent = goal.parent_id; const visited = new Set<string>(); while (parent && byID.has(parent) && !visited.has(parent)) { visited.add(parent); depth += 1; parent = byID.get(parent)?.parent_id; } const row = rowsByDepth.get(depth) ?? 0; rowsByDepth.set(depth, row + 1); return { id: goal.id, position: { x: depth * 300, y: row * 130 }, data: { label: `${goal.title}  ${Math.round(goal.progress * 100)}%` }, draggable: false, style: { width: 220, border: "1px solid #cbd5e1", borderRadius: 8, background: "#ffffff", color: "#0f172a", fontWeight: 700, padding: 14, boxShadow: "0 1px 3px rgb(15 23 42 / 0.08)" } }; }); }
function goalEdges(goals: Goal[]): Edge[] { return goals.filter((goal) => goal.parent_id).map((goal) => ({ id: `${goal.parent_id}-${goal.id}`, source: goal.parent_id!, target: goal.id, type: "smoothstep", style: { stroke: "#0f766e", strokeWidth: 1.5 } })); }
