import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, ChevronLeft, ChevronRight, Compass, Eye, GripVertical, Image as ImageIcon, Leaf, Pencil, Plus, Search, Sparkles, Target, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Background, Controls, ReactFlow, type Edge, type Node, type Position } from "@xyflow/react";
import { useSearchParams } from "react-router-dom";
import "@xyflow/react/dist/style.css";
import type { AuthResponse, Dream, FileAsset, Goal, GoalRequest } from "@/api/client";
import { deleteDream, deleteFile, deleteGoal, listDreams, listFiles, saveDream, saveGoal, uploadFile } from "@/api/client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormLabel, Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessDate } from "@/lib/date";
import { errorMessage } from "@/lib/utils";
import { FIRST_SCREEN_STALE_TIME, goalsQueryOptions } from "@/lib/query-options";

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
}).superRefine((value, context) => {
  if (value.metric_code && value.target_value === undefined) {
    context.addIssue({ code: "custom", path: ["target_value"], message: "选择指标后请输入目标值" });
  }
});
const dreamSchema = z.object({ title: z.string().trim().min(1, "请输入梦想名称").max(200), description: z.string() });
type GoalForm = z.infer<typeof goalSchema>;
type DreamForm = z.infer<typeof dreamSchema>;
type GoalsView = "map" | "list" | "dreams";
type GoalSheetState = { mode: "create" } | { mode: "edit" | "detail"; goal: Goal } | null;
type DreamSheetState = { mode: "create" } | { mode: "detail" | "edit"; dream: Dream } | null;
type DreamUpload = { key: string; file: File; status: "uploading" | "error"; error?: string };

const typeLabels: Record<string, string> = { LONG_TERM: "长期", YEAR: "年度", STAGE: "阶段", MONTH: "月度", WEEK: "周", DAY: "日" };
const statusLabels: Record<string, string> = { NOT_STARTED: "未开始", IN_PROGRESS: "进行中", COMPLETED: "已完成", PAUSED: "已暂停", CANCELLED: "已取消" };
const statusTones: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { NOT_STARTED: "neutral", IN_PROGRESS: "info", COMPLETED: "success", PAUSED: "warning", CANCELLED: "danger" };

const defaultGoal = (date: string): GoalForm => ({ title: "", type: "YEAR", parent_id: "", start_date: date, due_date: date, status: "NOT_STARTED", metric_code: "", target_value: undefined, unit: "" });
function goalForm(value: Goal): GoalForm {
  const metric = value.metrics[0];
  return { title: value.title, type: value.type, parent_id: value.parent_id ?? "", start_date: value.start_date ?? "", due_date: value.due_date ?? "", status: value.status, metric_code: metric?.metric_code ?? "", target_value: metric?.target_value, unit: metric?.unit ?? "" };
}

function GoalsHeroArt() {
  return (
    <svg className="pointer-events-none absolute bottom-0 right-0 h-full w-[52%] max-w-[600px] opacity-90" viewBox="0 0 620 170" fill="none" aria-hidden="true">
      <path d="M0 146C80 124 126 104 194 111c65 7 79 44 143 35 68-10 91-82 168-66 43 9 63 25 115 4v86H0v-24Z" fill="url(#goal-hill)" />
      <path d="M122 158c78-34 135-57 212-49 80 8 140-13 211-58 17-11 35-22 56-31" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".9" />
      <path d="M122 158c78-34 135-57 212-49 80 8 140-13 211-58" stroke="#99F6E4" strokeWidth="2" strokeLinecap="round" />
      <path d="M356 100v-24" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" /><path d="M356 76h18l-18 11" fill="#0F8F83" />
      <path d="M462 67v-28" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" /><path d="M462 39h22l-22 13" fill="#34D399" />
      <g transform="translate(474 38)"><circle cx="45" cy="45" r="26" fill="#fff" fillOpacity=".8" stroke="#0F8F83" strokeWidth="4" /><circle cx="45" cy="45" r="8" fill="#0F8F83" /><path d="m45 15 8 30-8 30-8-30 8-30Z" fill="#60A5FA" opacity=".75" /><path d="m15 45 30-8 30 8-30 8-30-8Z" fill="#34D399" opacity=".55" /></g>
      <path d="M292 157c-5-25 4-45 22-60M296 122c-20-11-31-8-43 1 16 17 28 19 45 14M306 105c8-16 20-22 34-21-3 17-14 26-32 31" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      <defs><linearGradient id="goal-hill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#A7F3D0" stopOpacity=".78" /><stop offset="1" stopColor="#BAE6FD" stopOpacity=".6" /></linearGradient></defs>
    </svg>
  );
}

function GoalsHero() {
  return (
    <header className="relative isolate min-h-[174px] overflow-hidden rounded-hero border border-brand-100/70 bg-gradient-to-r from-brand-100/70 via-sky-50/80 to-brand-50/70 px-5 py-5 shadow-card sm:px-7 sm:py-6">
      <GoalsHeroArt />
      <div className="relative z-10 max-w-[62%] sm:max-w-[57%]">
        <p className="text-xs font-bold tracking-[0.08em] text-brand-700">方向与执行</p>
        <h1 className="mt-1 text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-ink">梦想与目标</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">用层级目标把长期方向拆成可行动的路径。设置量化指标后，目标进度可根据已记录的工作量或营业额自动计算。</p>
      </div>
    </header>
  );
}

export function GoalsPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountID = authResponse.data.account.id;
  const today = businessDate(authResponse.data.account.timezone);
  const queryClient = useQueryClient();
  const goalsQuery = useQuery(goalsQueryOptions(accountID));
  const dreamsQuery = useQuery({ queryKey: ["user", accountID, "dreams"], queryFn: listDreams, staleTime: FIRST_SCREEN_STALE_TIME });
  const filesQuery = useQuery({ queryKey: ["user", accountID, "files"], queryFn: listFiles, staleTime: FIRST_SCREEN_STALE_TIME });
  const [view, setView] = useState<GoalsView>("map");
  const [goalSheet, setGoalSheet] = useState<GoalSheetState>(null);
  const [dreamSheet, setDreamSheet] = useState<DreamSheetState>(null);
  const [dreamFiles, setDreamFiles] = useState<string[]>([]);
  const [dreamGoals, setDreamGoals] = useState<string[]>([]);
  const [temporaryDreamFiles, setTemporaryDreamFiles] = useState<string[]>([]);
  const [removedDreamFiles, setRemovedDreamFiles] = useState<string[]>([]);
  const [uploadedDreamAssets, setUploadedDreamAssets] = useState<FileAsset[]>([]);
  const [dreamUploads, setDreamUploads] = useState<DreamUpload[]>([]);
  const [draggingDreamFile, setDraggingDreamFile] = useState<string | null>(null);
  const uploadSequence = useRef(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "goal" | "dream"; id: string; title: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const handledDeepLink = useRef<string | null>(null);
  const goalReturnFocus = useRef<HTMLElement | null>(null);
  const dreamReturnFocus = useRef<HTMLElement | null>(null);
  const goalFormState = useForm<GoalForm>({ resolver: zodResolver(goalSchema), defaultValues: defaultGoal(today) });
  const dreamFormState = useForm<DreamForm>({ resolver: zodResolver(dreamSchema), defaultValues: { title: "", description: "" } });
  const editingGoal = goalSheet?.mode === "edit" ? goalSheet.goal : null;
  const editingDream = dreamSheet?.mode === "edit" ? dreamSheet.dream : null;

  const openGoalSheet = (value: NonNullable<GoalSheetState>) => {
    goalReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGoalSheet(value);
  };
  const closeGoalSheet = () => {
    setGoalSheet(null);
    window.setTimeout(() => goalReturnFocus.current?.focus(), 0);
  };
  const cleanupTemporaryDreamFiles = (fileIDs = temporaryDreamFiles) => {
    if (!fileIDs.length) return;
    setTemporaryDreamFiles((current) => current.filter((id) => !fileIDs.includes(id)));
    void Promise.allSettled(fileIDs.map((id) => deleteFile(authResponse.data.csrf_token, id))).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["user", accountID, "files"] });
    });
  };
  const closeDreamSheet = (cleanup = true) => {
    if (cleanup) cleanupTemporaryDreamFiles();
    setDreamSheet(null);
    setRemovedDreamFiles([]);
    setUploadedDreamAssets([]);
    setDreamUploads([]);
    window.setTimeout(() => dreamReturnFocus.current?.focus(), 0);
  };

  useEffect(() => {
    goalFormState.reset(editingGoal ? goalForm(editingGoal) : defaultGoal(today));
  }, [editingGoal, goalFormState, today]);

  const goals = useMemo(() => goalsQuery.data?.data.items ?? [], [goalsQuery.data]);
  const files = [...(filesQuery.data?.data.items.filter((file) => file.category === "DREAM_IMAGE") ?? []), ...uploadedDreamAssets].filter((file, index, items) => items.findIndex((item) => item.id === file.id) === index);
  const filteredGoals = goals.filter((goal) => goal.title.toLowerCase().includes(search.toLowerCase()) && (!typeFilter || goal.type === typeFilter) && (!statusFilter || goal.status === statusFilter));

  useEffect(() => {
    const goalID = searchParams.get("goal");
    if (!goalID || handledDeepLink.current === goalID || goalsQuery.isPending) return;
    handledDeepLink.current = goalID;
    const goal = goals.find((item) => item.id === goalID);
    if (goal) {
      setView("list");
      openGoalSheet({ mode: "detail", goal });
    }
  }, [goals, goalsQuery.isPending, searchParams]);

  const goalMutation = useMutation({
    mutationFn: (value: GoalRequest) => saveGoal(authResponse.data.csrf_token, value, editingGoal?.id),
    onSuccess: () => { setNotice(editingGoal ? "目标已更新。" : "目标已创建。"); setError(""); closeGoalSheet(); void queryClient.invalidateQueries({ queryKey: ["user", accountID] }); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const dreamMutation = useMutation({
    mutationFn: (value: DreamForm) => saveDream(authResponse.data.csrf_token, { title: value.title, description: value.description || null, goal_ids: dreamGoals, sort_order: editingDream?.sort_order ?? 0, file_ids: dreamFiles }, editingDream?.id),
    onSuccess: () => {
      cleanupTemporaryDreamFiles(temporaryDreamFiles.filter((id) => !dreamFiles.includes(id)));
      void Promise.allSettled(removedDreamFiles.map((id) => deleteFile(authResponse.data.csrf_token, id)));
      setTemporaryDreamFiles([]);
      setRemovedDreamFiles([]);
      setNotice("梦想已保存。");
      setError("");
      closeDreamSheet(false);
      void queryClient.invalidateQueries({ queryKey: ["user", accountID, "dreams"] });
    },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const uploadDreamFile = async (entry: DreamUpload) => {
    setDreamUploads((current) => current.map((item) => item.key === entry.key ? { ...item, status: "uploading", error: undefined } : item));
    try {
      const value = await uploadFile(authResponse.data.csrf_token, entry.file, "DREAM_IMAGE");
      setDreamFiles((current) => current.includes(value.data.id) ? current : [...current, value.data.id]);
      setTemporaryDreamFiles((current) => [...current, value.data.id]);
      setUploadedDreamAssets((current) => [...current, value.data]);
      setDreamUploads((current) => current.filter((item) => item.key !== entry.key));
      setNotice("梦想图片已上传并加入梦想，保存后完成关联。");
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["user", accountID, "files"] });
    } catch (value) {
      setDreamUploads((current) => current.map((item) => item.key === entry.key ? { ...item, status: "error", error: errorMessage(value) } : item));
    }
  };
  const selectDreamFiles = (selected: File[]) => {
    if (!selected.length) return;
    if (dreamFiles.length + dreamUploads.length + selected.length > 10) {
      setError("一个梦想最多可添加 10 张图片。");
      setNotice("");
      return;
    }
    const entries = selected.map((file) => ({ key: `dream-upload-${uploadSequence.current++}`, file, status: "uploading" as const }));
    setDreamUploads((current) => [...current, ...entries]);
    entries.forEach((entry) => void uploadDreamFile(entry));
  };
  const removeDreamFile = (id: string) => {
    setDreamFiles((current) => current.filter((fileID) => fileID !== id));
    if (temporaryDreamFiles.includes(id)) {
      cleanupTemporaryDreamFiles([id]);
      setUploadedDreamAssets((current) => current.filter((file) => file.id !== id));
    } else if (editingDream?.file_ids.includes(id)) {
      setRemovedDreamFiles((current) => current.includes(id) ? current : [...current, id]);
    }
  };
  const moveDreamFile = (id: string, targetID: string) => setDreamFiles((current) => {
    const from = current.indexOf(id); const to = current.indexOf(targetID);
    if (from < 0 || to < 0 || from === to) return current;
    const next = [...current]; next.splice(from, 1); next.splice(to, 0, id); return next;
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
  const openDreamCreate = () => {
    dreamReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDreamSheet({ mode: "create" });
    setTemporaryDreamFiles([]);
    setRemovedDreamFiles([]); setUploadedDreamAssets([]); setDreamUploads([]);
    setDreamFiles([]); setDreamGoals([]); dreamFormState.reset({ title: "", description: "" });
  };
  const openDreamDetail = (dream: Dream) => {
    dreamReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDreamSheet({ mode: "detail", dream });
  };
  const openDreamEdit = (dream: Dream) => {
    setDreamSheet({ mode: "edit", dream });
    setTemporaryDreamFiles([]);
    setRemovedDreamFiles([]); setUploadedDreamAssets([]); setDreamUploads([]);
    setDreamFiles(dream.file_ids); setDreamGoals(dream.goal_ids); dreamFormState.reset({ title: dream.title, description: dream.description ?? "" });
  };

  const activeAction = view === "dreams"
    ? <Button onClick={openDreamCreate}><Plus size={16} />新增梦想</Button>
    : <Button onClick={() => openGoalSheet({ mode: "create" })}><Plus size={16} />新建目标</Button>;
  const goalsContent = goalsQuery.isPending && !goalsQuery.data
    ? <LoadingState label="正在加载目标" />
    : goalsQuery.isError && !goalsQuery.data
      ? <ErrorState message="目标数据暂时无法加载" onRetry={() => void goalsQuery.refetch()} />
      : view === "map"
        ? <GoalMap goals={goals} selectedID={goalSheet && goalSheet.mode !== "create" ? goalSheet.goal.id : null} onSelect={(goal) => openGoalSheet({ mode: "detail", goal })} onCreate={() => openGoalSheet({ mode: "create" })} />
        : <GoalListView goals={filteredGoals} search={search} typeFilter={typeFilter} statusFilter={statusFilter} onSearch={setSearch} onTypeFilter={setTypeFilter} onStatusFilter={setStatusFilter} onView={(goal) => openGoalSheet({ mode: "detail", goal })} onEdit={(goal) => openGoalSheet({ mode: "edit", goal })} onDelete={(goal) => setDeleteTarget({ kind: "goal", id: goal.id, title: goal.title })} />;
  const dreamsContent = (goalsQuery.isPending && !goalsQuery.data) || (dreamsQuery.isPending && !dreamsQuery.data) || (filesQuery.isPending && !filesQuery.data)
    ? <LoadingState label="正在加载梦想板" />
    : (goalsQuery.isError && !goalsQuery.data) || (dreamsQuery.isError && !dreamsQuery.data) || (filesQuery.isError && !filesQuery.data)
      ? <ErrorState message="梦想数据暂时无法加载" onRetry={() => { void goalsQuery.refetch(); void dreamsQuery.refetch(); void filesQuery.refetch(); }} />
      : <DreamBoard dreams={dreamsQuery.data?.data.items ?? []} goals={goals} files={files} onSelect={openDreamDetail} onCreate={openDreamCreate} onDelete={(dream) => setDeleteTarget({ kind: "dream", id: dream.id, title: dream.title })} />;
  const staleDataRefreshFailed = view === "dreams"
    ? (goalsQuery.isError && Boolean(goalsQuery.data)) || (dreamsQuery.isError && Boolean(dreamsQuery.data)) || (filesQuery.isError && Boolean(filesQuery.data))
    : goalsQuery.isError && Boolean(goalsQuery.data);
  const retryStaleData = () => {
    void goalsQuery.refetch();
    if (view === "dreams") { void dreamsQuery.refetch(); void filesQuery.refetch(); }
  };

  return (
    <div className="goals-page space-y-6">
      <GoalsHero />
      {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onValueChange={(value) => setView(value as GoalsView)}>
          <TabsList className="bg-surface-muted/80" aria-label="目标工作台视图"><TabsTrigger value="map" className="min-h-10 px-4">目标地图</TabsTrigger><TabsTrigger value="list" className="min-h-10 px-4">目标列表</TabsTrigger><TabsTrigger value="dreams" className="min-h-10 px-4">梦想板</TabsTrigger></TabsList>
        </Tabs>
        <div className="flex justify-end">{activeAction}</div>
      </div>

      {staleDataRefreshFailed && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">刷新失败，当前仍显示上次数据。 <button type="button" className="font-semibold underline" onClick={retryStaleData}>重试</button></p>}

      {view === "dreams" ? dreamsContent : goalsContent}

      <Dialog open={goalSheet?.mode === "detail"} onOpenChange={(open) => !open && closeGoalSheet()}>
        {goalSheet?.mode === "detail" && <DialogContent className="max-w-2xl overflow-hidden p-0">
          <div className="border-b border-brand-100/70 bg-gradient-to-r from-brand-50/85 via-sky-50/55 to-violet-50/45 px-6 py-5 pr-14">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-brand-700"><Target size={19} /></span><div><DialogTitle>{goalSheet.goal.title}</DialogTitle><DialogDescription>{typeLabels[goalSheet.goal.type]}目标详情</DialogDescription></div></div>
          </div>
          <div className="max-h-[min(68vh,620px)] overflow-y-auto px-6 py-5"><GoalDetail goal={goalSheet.goal} goals={goals} /></div>
          <div className="flex justify-end gap-3 border-t border-outline/55 bg-surface-muted/45 px-6 py-4"><Button variant="danger" onClick={() => setDeleteTarget({ kind: "goal", id: goalSheet.goal.id, title: goalSheet.goal.title })}><Trash2 size={16} />删除</Button><Button onClick={() => setGoalSheet({ mode: "edit", goal: goalSheet.goal })}>编辑目标</Button></div>
        </DialogContent>}
      </Dialog>

      <Dialog open={Boolean(goalSheet && goalSheet.mode !== "detail")} onOpenChange={(open) => !open && closeGoalSheet()}>
        {goalSheet && goalSheet.mode !== "detail" && <DialogContent className="max-w-2xl overflow-hidden p-0">
          <div className="border-b border-brand-100/70 bg-gradient-to-r from-brand-50/85 via-sky-50/55 to-violet-50/45 px-6 py-5 pr-14">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-brand-700"><Target size={19} /></span><div><DialogTitle>{goalSheet.mode === "edit" ? "编辑目标" : "新建目标"}</DialogTitle><DialogDescription>修改目标信息和量化指标</DialogDescription></div></div>
          </div>
          <div className="max-h-[min(68vh,620px)] overflow-y-auto px-6 py-5"><GoalEditor form={goalFormState} goals={goals} editingID={editingGoal?.id} /></div>
          <div className="flex justify-end gap-3 border-t border-outline/55 bg-surface-muted/45 px-6 py-4"><Button variant="secondary" onClick={closeGoalSheet}>取消</Button><Button onClick={() => void onGoalSubmit()} loading={goalMutation.isPending}><Check size={16} />{goalSheet.mode === "edit" ? "保存目标" : "创建目标"}</Button></div>
        </DialogContent>}
      </Dialog>

      <Dialog open={Boolean(dreamSheet)} onOpenChange={(open) => !open && closeDreamSheet()}>
        {dreamSheet && <DialogContent className={`flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 ${dreamSheet.mode === "detail" ? "max-w-4xl sm:max-h-[min(90dvh,860px)]" : "max-w-2xl sm:max-h-[min(84dvh,720px)]"}`}>
          <div className="shrink-0 border-b border-brand-100/70 bg-gradient-to-r from-violet-50/75 via-sky-50/45 to-brand-50/60 px-6 py-5 pr-14"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-violet-100 text-violet-700"><Sparkles size={18} /></span><div><DialogTitle>{dreamSheet.mode === "detail" ? dreamSheet.dream.title : dreamSheet.mode === "create" ? "新增梦想" : "编辑梦想"}</DialogTitle><DialogDescription>{dreamSheet.mode === "detail" ? "查看梦想详情、图片和关联目标。" : "用图片、文字和关联目标呈现希望实现的方向。"}</DialogDescription></div></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {(notice || error) && <p role={error ? "alert" : "status"} className={`mb-5 rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
            {dreamSheet.mode === "detail" ? <DreamDetail dream={dreamSheet.dream} goals={goals} files={files} /> : <DreamEditor form={dreamFormState} goals={goals} files={files} selectedFiles={dreamFiles} selectedGoals={dreamGoals} uploads={dreamUploads} draggingID={draggingDreamFile} onFilesSelected={selectDreamFiles} onRetry={(entry) => void uploadDreamFile(entry)} onRemoveFile={removeDreamFile} onMoveFile={moveDreamFile} onDragging={setDraggingDreamFile} onToggleGoal={(id) => setDreamGoals((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} />}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">{dreamSheet.mode === "detail" ? <><Button variant="danger" onClick={() => setDeleteTarget({ kind: "dream", id: dreamSheet.dream.id, title: dreamSheet.dream.title })}><Trash2 size={16} />删除</Button><Button onClick={() => openDreamEdit(dreamSheet.dream)}>编辑梦想</Button></> : <><Button variant="secondary" onClick={() => closeDreamSheet()}>取消</Button><Button onClick={() => void dreamFormState.handleSubmit((value) => dreamMutation.mutate(value))()} loading={dreamMutation.isPending} disabled={dreamUploads.some((item) => item.status === "uploading") || dreamFiles.length > 10}><Sparkles size={16} />保存梦想</Button></>}</div>
        </DialogContent>}
      </Dialog>

      <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title="确认删除" description={deleteTarget ? `确定要删除“${deleteTarget.title}”吗？${deleteTarget.kind === "goal" ? "它的子目标和指标也会被删除。" : "关联关系也会被删除。"}` : ""} confirmLabel="删除" loading={deleteMutation.isPending} onConfirm={() => deleteTarget && deleteMutation.mutate({ kind: deleteTarget.kind, id: deleteTarget.id })} />
    </div>
  );
}

function GoalMap({ goals, selectedID, onSelect, onCreate }: { goals: Goal[]; selectedID: string | null; onSelect: (goal: Goal) => void; onCreate: () => void }) {
  return (
    <Panel title="目标地图" description="父子目标以连线表达；画布支持缩放和适配，点击节点可查看并高亮关联路径。" className="border-brand-100/70 bg-gradient-to-br from-white via-brand-50/15 to-sky-50/30 shadow-card [&>header]:border-brand-100/55">
      <div className={`${goals.length ? "h-[min(68vh,720px)] min-h-[480px]" : "min-h-[300px]"} overflow-hidden rounded-[1.25rem] border border-brand-100/70 bg-gradient-to-br from-brand-50/70 via-sky-50/55 to-violet-50/35`}>
        {goals.length ? (
          <ReactFlow className="goal-map" nodes={goalNodes(goals, selectedID)} edges={goalEdges(goals, selectedID)} fitView minZoom={0.35} maxZoom={1.8} nodesDraggable={false} onNodeClick={(_, node) => { const goal = goals.find((item) => item.id === node.id); if (goal) onSelect(goal); }}>
            <Controls className="!overflow-hidden !rounded-card !border-brand-100/80 !bg-white/90" />
            <Background gap={24} size={1} color="#94a3b8" />
          </ReactFlow>
        ) : (
          <div className="grid min-h-[300px] place-items-center px-6">
            <div className="max-w-sm text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-100/85 text-brand-700"><Compass size={25} /></span><p className="mt-4 font-bold text-ink">还没有目标</p><p className="mt-2 text-sm leading-6 text-ink-muted">建立第一个目标后，这里会呈现清晰的执行路径。</p><Button variant="secondary" className="mt-4 border-brand-200 bg-white/80" onClick={onCreate}><Plus size={16} />新建目标</Button></div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function GoalListView({ goals, search, typeFilter, statusFilter, onSearch, onTypeFilter, onStatusFilter, onView, onEdit, onDelete }: { goals: Goal[]; search: string; typeFilter: string; statusFilter: string; onSearch: (value: string) => void; onTypeFilter: (value: string) => void; onStatusFilter: (value: string) => void; onView: (goal: Goal) => void; onEdit: (goal: Goal) => void; onDelete: (goal: Goal) => void }) {
  return (
    <Panel title="目标列表" description="搜索、筛选并处理目标。" className="border-brand-100/70 bg-gradient-to-br from-white via-brand-50/15 to-sky-50/25 shadow-card [&>header]:border-brand-100/55">
      <div className="mb-5 grid gap-3 rounded-card border border-brand-100/55 bg-brand-50/30 p-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div className="relative"><Search size={17} className="pointer-events-none absolute left-3 top-[2.35rem] z-10 text-ink-faint" /><Input label="搜索目标" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="输入目标名称" className="pl-10" /></div>
        <Select label="目标层级" value={typeFilter} onChange={(event) => onTypeFilter(event.target.value)}><option value="">全部层级</option>{goalTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</Select>
        <Select label="目标状态" value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}><option value="">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      </div>
      {goals.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead><tr><th className="px-4 py-3">目标</th><th className="px-4 py-3">层级</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">自动进度</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
            <tbody>{goals.map((goal) => { const progress = Math.round(goal.progress * 100); return <tr key={goal.id} className="border-b border-outline/35 last:border-0">
              <td className="px-4 py-4"><button type="button" className="flex items-center gap-3 text-left font-bold text-ink hover:text-brand-800" onClick={() => onView(goal)}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Target size={17} /></span><span><span className="block">{goal.title}</span><span className="mt-1 block text-xs font-normal text-ink-faint">{goal.metrics.length ? `${goal.metrics.length} 个指标` : "无量化指标"}</span></span></button></td>
              <td className="px-4 py-4"><span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted">{typeLabels[goal.type]}</span></td>
              <td className="px-4 py-4"><StatusBadge tone={statusTones[goal.status]}>{statusLabels[goal.status]}</StatusBadge></td>
              <td className="px-4 py-4"><div className="flex min-w-40 items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-500" style={{ width: `${Math.min(100, progress)}%` }} /></div><strong className="w-10 text-right tabular-nums text-brand-800">{progress}%</strong></div></td>
              <td className="px-4 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onView(goal)}><Eye size={15} />查看</Button><Button variant="ghost" size="sm" onClick={() => onEdit(goal)}><Pencil size={15} />编辑</Button><Button variant="icon" size="sm" aria-label={`删除目标 ${goal.title}`} onClick={() => onDelete(goal)}><Trash2 size={15} /></Button></div></td>
            </tr>; })}</tbody>
          </table>
        </div>
      ) : <EmptyState title="没有匹配的目标" description="调整搜索或筛选条件。" />}
    </Panel>
  );
}

function DreamBoard({ dreams, goals, files, onSelect, onCreate, onDelete }: { dreams: Dream[]; goals: Goal[]; files: FileAsset[]; onSelect: (dream: Dream) => void; onCreate: () => void; onDelete: (dream: Dream) => void }) {
  if (!dreams.length) return <Panel className="border-violet-100/70 bg-gradient-to-br from-white via-violet-50/20 to-brand-50/25 shadow-card"><div className="grid min-h-[300px] place-items-center py-8 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-violet-100 text-violet-700"><Sparkles size={24} /></span><p className="mt-4 font-bold text-ink">梦想板还是空的</p><p className="mt-2 text-sm text-ink-muted">添加梦想、图片并关联正在推进的目标。</p><Button variant="secondary" className="mt-4 border-violet-200 bg-white/80" onClick={onCreate}><Plus size={16} />新增梦想</Button></div></div></Panel>;
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{dreams.map((dream) => { const image = files.find((file) => file.id === dream.file_ids[0]); const linkedGoals = goals.filter((goal) => dream.goal_ids.includes(goal.id)); return <article key={dream.id} className="group overflow-hidden rounded-[1.25rem] border border-violet-100/70 bg-gradient-to-br from-white via-violet-50/20 to-rose-50/25 shadow-card transition-shadow hover:shadow-card-hover"><button type="button" className="block w-full text-left" onClick={() => onSelect(dream)}>{image ? <div className="relative"><img className="aspect-[16/9] w-full object-cover" src={`/api/files/${image.id}/content?disposition=inline`} alt={image.original_name} /><span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" aria-hidden="true" /></div> : <div className="grid aspect-[16/9] place-items-center bg-gradient-to-br from-violet-50 to-brand-50 text-violet-400"><ImageIcon size={30} /></div>}<div className="p-4"><h2 className="font-bold text-ink group-hover:text-brand-800">{dream.title}</h2>{dream.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{dream.description}</p>}<span className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-100/75 px-2.5 py-1 text-xs font-semibold text-violet-700"><Target size={13} />关联目标 {linkedGoals.length}</span></div></button><div className="flex justify-end border-t border-violet-100/60 px-3 py-2"><Button variant="icon" size="sm" aria-label={`删除梦想 ${dream.title}`} onClick={() => onDelete(dream)}><Trash2 size={15} /></Button></div></article>; })}<button type="button" onClick={onCreate} className="grid min-h-[300px] place-items-center rounded-[1.25rem] border border-dashed border-brand-200 bg-gradient-to-br from-brand-50/55 to-sky-50/45 p-6 text-center text-brand-800 transition hover:border-brand-400 hover:shadow-card"><span><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/80 text-brand-700 shadow-hairline"><Leaf size={24} /></span><strong className="mt-4 block">添加新梦想</strong><span className="mt-1 block text-sm text-brand-700/80">把梦想放在这里，让它成为前进的动力</span><span className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-control border border-brand-200 bg-white/80 px-4 text-sm font-semibold"><Plus size={15} />新增梦想</span></span></button></div>;
}

function GoalEditor({ form, goals, editingID }: { form: UseFormReturn<GoalForm>; goals: Goal[]; editingID?: string }) {
  return <form className="space-y-5" onSubmit={(event) => event.preventDefault()}><Input label="目标名称" required error={form.formState.errors.title?.message} {...form.register("title")} /><div className="grid gap-4 sm:grid-cols-2"><Select label="目标层级" required {...form.register("type")}>{goalTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</Select><Select label="父目标" {...form.register("parent_id")}><option value="">无父目标</option>{goals.filter((goal) => goal.id !== editingID).map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</Select></div><div className="grid gap-4 sm:grid-cols-2"><Input label="开始日期" type="date" {...form.register("start_date")} /><Input label="截止日期" type="date" {...form.register("due_date")} /></div><Select label="状态" required {...form.register("status")}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><div className="rounded-card border border-brand-100/70 bg-brand-50/35 p-4"><div className="mb-4 flex items-center gap-2 text-sm font-bold text-brand-900"><BarChart3 size={16} />量化指标（可选）</div><div className="space-y-4"><Select label="指标" {...form.register("metric_code")}><option value="">暂不设置</option>{metricCodes.map((code) => <option key={code} value={code}>{metricLabel(code)}</option>)}</Select><div className="grid gap-4 sm:grid-cols-2"><Input label="目标值" type="number" min={0} step="0.01" error={form.formState.errors.target_value?.message} {...form.register("target_value", { setValueAs: (value) => value === "" ? undefined : Number(value) })} /><Input label="单位" placeholder="次 / PV / 分钟" {...form.register("unit")} /></div></div></div></form>;
}

function DreamEditor({ form, goals, files, selectedFiles, selectedGoals, uploads, draggingID, onFilesSelected, onRetry, onRemoveFile, onMoveFile, onDragging, onToggleGoal }: { form: UseFormReturn<DreamForm>; goals: Goal[]; files: FileAsset[]; selectedFiles: string[]; selectedGoals: string[]; uploads: DreamUpload[]; draggingID: string | null; onFilesSelected: (files: File[]) => void; onRetry: (entry: DreamUpload) => void; onRemoveFile: (id: string) => void; onMoveFile: (id: string, targetID: string) => void; onDragging: (id: string | null) => void; onToggleGoal: (id: string) => void }) {
  const images = selectedFiles.map((id) => files.find((file) => file.id === id)).filter((file): file is FileAsset => Boolean(file));
  return <form className="space-y-6" onSubmit={(event) => event.preventDefault()}><Input label="梦想标题" required error={form.formState.errors.title?.message} {...form.register("title")} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">梦想描述</span><textarea className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" placeholder="描述这个方向" {...form.register("description")} /></label><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">关联目标</h3>{goals.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{goals.map((goal) => <label key={goal.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><input type="checkbox" checked={selectedGoals.includes(goal.id)} onChange={() => onToggleGoal(goal.id)} /><span className="font-semibold text-slate-700">{goal.title}</span></label>)}</div> : <p className="mt-2 text-sm text-slate-500">暂无可关联目标。</p>}</section><section className="border-t border-slate-200 pt-5"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">梦想图片</h3><p className="mt-1 text-xs text-slate-500">最多 10 张；第一张为封面，可拖动或使用箭头排序。</p></div><span className="text-sm font-bold tabular-nums text-slate-600">{selectedFiles.length} / 10</span></div><label className="mt-3 block rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><span className="text-sm font-semibold text-slate-700">选择一张或多张图片</span><input aria-label="选择梦想图片" multiple type="file" accept="image/jpeg,image/png,image/webp" disabled={selectedFiles.length >= 10} className="mt-2 block w-full text-sm" onChange={(event) => { onFilesSelected(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} /></label>{uploads.length > 0 && <div className="mt-3 space-y-2">{uploads.map((entry) => <div key={entry.key} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${entry.status === "error" ? "border-rose-200 bg-rose-50" : "border-teal-200 bg-teal-50"}`}><span className="min-w-0 truncate">{entry.file.name} · {entry.status === "uploading" ? "正在上传" : entry.error}</span>{entry.status === "error" && <Button type="button" variant="secondary" size="sm" onClick={() => onRetry(entry)}>重试</Button>}</div>)}</div>}{images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((item, index) => <article key={item.id} draggable onDragStart={() => onDragging(item.id)} onDragEnd={() => onDragging(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingID) onMoveFile(draggingID, item.id); onDragging(null); }} className={`relative rounded-lg border bg-white p-2 ${draggingID === item.id ? "border-amber-400 opacity-60" : "border-slate-200"}`}><img className="aspect-[4/3] w-full rounded-md object-cover" src={`/api/files/${item.id}/content?disposition=inline`} alt={item.original_name} /><div className="mt-2 flex items-center justify-between gap-1"><span className="min-w-0 truncate text-xs text-slate-600">{index === 0 ? "封面 · " : ""}{item.original_name}</span><GripVertical className="shrink-0 cursor-grab text-slate-400" size={15} /></div><div className="mt-2 flex justify-end gap-1"><Button type="button" variant="icon" size="sm" aria-label={`前移图片 ${item.original_name}`} disabled={index === 0} onClick={() => onMoveFile(item.id, selectedFiles[index - 1])}><ChevronLeft size={14} /></Button><Button type="button" variant="icon" size="sm" aria-label={`后移图片 ${item.original_name}`} disabled={index === selectedFiles.length - 1} onClick={() => onMoveFile(item.id, selectedFiles[index + 1])}><ChevronRight size={14} /></Button><Button type="button" variant="icon" size="sm" aria-label={`删除图片 ${item.original_name}`} onClick={() => onRemoveFile(item.id)}><Trash2 size={14} /></Button></div></article>)}</div>}</section></form>;
}

function DreamDetail({ dream, goals, files }: { dream: Dream; goals: Goal[]; files: FileAsset[] }) {
  const images = dream.file_ids.map((id) => files.find((file) => file.id === id)).filter((file): file is FileAsset => Boolean(file));
  const linkedGoals = goals.filter((goal) => dream.goal_ids.includes(goal.id));
  const [imageIndex, setImageIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  useEffect(() => setImageIndex(0), [dream.id]);
  const showImage = (index: number) => setImageIndex((index + images.length) % images.length);
  return <div className="space-y-6">{images.length ? <div className="relative overflow-hidden rounded-lg bg-slate-950" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (touchStart.current == null) return; const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current; if (Math.abs(distance) > 40) showImage(imageIndex + (distance < 0 ? 1 : -1)); touchStart.current = null; }}><img className="max-h-[52vh] min-h-56 w-full object-contain" src={`/api/files/${images[imageIndex].id}/content?disposition=inline`} alt={images[imageIndex].original_name} />{images.length > 1 && <><Button type="button" variant="icon" className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90" aria-label="上一张梦想图片" onClick={() => showImage(imageIndex - 1)}><ChevronLeft size={18} /></Button><Button type="button" variant="icon" className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90" aria-label="下一张梦想图片" onClick={() => showImage(imageIndex + 1)}><ChevronRight size={18} /></Button><span className="absolute bottom-3 right-3 rounded-md bg-slate-950/75 px-2 py-1 text-xs font-bold text-white">{imageIndex + 1} / {images.length}</span></>}</div> : <div className="grid min-h-56 place-items-center rounded-lg bg-slate-100 text-slate-400"><ImageIcon size={32} /></div>}<section><h3 className="text-sm font-bold text-slate-900">梦想描述</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{dream.description || "未填写描述。"}</p><p className="mt-3 text-xs text-slate-400">创建于 {new Date(dream.created_at).toLocaleString("zh-CN")}</p></section><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">已关联目标</h3>{linkedGoals.length ? <ul className="mt-3 space-y-2">{linkedGoals.map((goal) => <li key={goal.id} className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{goal.title}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">暂无关联目标。</p>}</section></div>;
}

function GoalDetail({ goal, goals }: { goal: Goal; goals: Goal[] }) {
  const parent = goals.find((item) => item.id === goal.parent_id);
  const children = goals.filter((item) => item.parent_id === goal.id);
  return <div className="space-y-6"><div className="flex items-center justify-between gap-4"><StatusBadge tone={statusTones[goal.status]}>{statusLabels[goal.status]}</StatusBadge><strong className="text-2xl tabular-nums text-teal-800">{Math.round(goal.progress * 100)}%</strong></div><div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, goal.progress * 100)}%` }} /></div><p className="mt-2 text-xs text-slate-500">进度由目标范围内的真实记录自动计算。</p></div><dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-slate-500">目标层级</dt><dd className="font-semibold text-slate-900">{typeLabels[goal.type]}</dd><dt className="text-slate-500">父目标</dt><dd className="font-semibold text-slate-900">{parent?.title ?? "无"}</dd><dt className="text-slate-500">开始日期</dt><dd className="font-semibold text-slate-900">{goal.start_date || "未设置"}</dd><dt className="text-slate-500">截止日期</dt><dd className="font-semibold text-slate-900">{goal.due_date || "未设置"}</dd></dl><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">量化指标</h3>{goal.metrics.length ? <div className="mt-3 space-y-3">{goal.metrics.map((metric) => <div key={metric.metric_code} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-4"><span className="font-semibold text-slate-700">{metricLabel(metric.metric_code)}</span><span className="tabular-nums text-slate-600">{metric.actual_value} / {metric.target_value} {metric.unit}</span></div></div>)}</div> : <p className="mt-2 text-sm text-slate-500">未设置量化指标。</p>}</section><section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">子目标</h3>{children.length ? <ul className="mt-3 space-y-2 text-sm text-slate-700">{children.map((child) => <li key={child.id} className="rounded-lg bg-slate-50 px-3 py-2.5 font-semibold">{child.title}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">暂无子目标。</p>}</section></div>;
}

function Select({ label, children, required, ...props }: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const selectId = useId();
  return <div className="block space-y-1.5"><FormLabel htmlFor={selectId} required={required} className="text-xs font-bold text-ink-muted">{label}</FormLabel><select id={selectId} className="min-h-10 w-full rounded-control border border-outline bg-surface px-3 text-sm text-ink outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100" required={required} {...props}>{children}</select></div>;
}
function metricLabel(code: string): string { const labels: Record<string, string> = { conversation_open_count: "开启对话", deep_conversation_count: "深入对话", buffer_count: "Buffer", story_share_count: "分享故事", screening_count: "筛选", opportunity_count: "提供机会", meeting_count: "会面", customer_followup_count: "顾客跟进", reading_minutes: "读书分钟", audio_minutes: "听音频分钟", turnover_pv: "营业额 PV", turnover_net_amount: "净营业额" }; return labels[code] ?? code; }
function highlightedGoals(goals: Goal[], selectedID: string | null): Set<string> { const result = new Set<string>(); if (!selectedID) return result; const byID = new Map(goals.map((goal) => [goal.id, goal])); let current: string | null | undefined = selectedID; while (current && !result.has(current)) { result.add(current); current = byID.get(current)?.parent_id; } const addChildren = (id: string) => goals.filter((goal) => goal.parent_id === id).forEach((goal) => { if (!result.has(goal.id)) { result.add(goal.id); addChildren(goal.id); } }); addChildren(selectedID); return result; }
function goalNodes(goals: Goal[], selectedID: string | null): Node[] {
  const highlighted = highlightedGoals(goals, selectedID);
  const positions = goalTreePositions(goals);
  return goals.map((goal) => {
    const position = positions.get(goal.id) ?? { x: 0, y: 0, depth: 0 };
    const selected = goal.id === selectedID;
    const progress = Math.round(goal.progress * 100);
    const accents = [
      { color: "#0F8F83", soft: "#ECFDF5", bar: "linear-gradient(90deg,#14B8A6,#34D399)" },
      { color: "#2563EB", soft: "#EFF6FF", bar: "linear-gradient(90deg,#3B82F6,#60A5FA)" },
      { color: "#7C3AED", soft: "#F5F3FF", bar: "linear-gradient(90deg,#8B5CF6,#A78BFA)" },
    ];
    const accent = accents[position.depth % accents.length];
    return {
      id: goal.id,
      position: { x: position.x, y: position.y },
      sourcePosition: "bottom" as Position,
      targetPosition: "top" as Position,
      ariaLabel: `${goal.title}，${typeLabels[goal.type]}目标，进度 ${progress}%`,
      data: {
        label: (
          <div className="text-left">
            <div className="flex items-center justify-between gap-3 px-4 pt-4">
              <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: accent.soft, color: accent.color }}>{typeLabels[goal.type]}</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint"><span className="h-1.5 w-1.5 rounded-full" style={{ background: accent.color }} />{statusLabels[goal.status]}</span>
            </div>
            <div className="px-4 pb-4 pt-3">
              <strong className="block truncate text-[15px] font-extrabold text-ink">{typeLabels[goal.type]}目标：{goal.title}</strong>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, progress)}%`, background: accent.bar }} /></div>
                <span className="w-10 text-right text-sm font-black tabular-nums" style={{ color: accent.color }}>{progress}%</span>
              </div>
              <p className="mt-2 truncate text-[11px] font-medium text-ink-faint">{goal.due_date ? `截止 ${goal.due_date}` : goal.metrics.length ? `${goal.metrics.length} 个量化指标` : "未设置截止日期"}</p>
            </div>
          </div>
        ),
      },
      draggable: false,
      style: {
        width: 260,
        padding: 0,
        overflow: "hidden",
        border: selected ? "3px solid #F59E0B" : highlighted.has(goal.id) ? `2px solid ${accent.color}` : "1px solid #DCE8ED",
        borderRadius: 20,
        background: "#FFFFFF",
        color: "#0F172A",
        boxShadow: selected ? "0 0 0 4px rgb(251 191 36 / 0.2), 0 18px 38px -22px rgb(15 23 42 / .42)" : "0 16px 34px -24px rgb(15 23 42 / .38)",
      },
    };
  });
}

function goalTreePositions(goals: Goal[]): Map<string, { x: number; y: number; depth: number }> {
  const byID = new Map(goals.map((goal) => [goal.id, goal]));
  const children = new Map<string, Goal[]>();
  goals.forEach((goal) => {
    if (!goal.parent_id || !byID.has(goal.parent_id)) return;
    const siblings = children.get(goal.parent_id) ?? [];
    siblings.push(goal);
    children.set(goal.parent_id, siblings);
  });
  children.forEach((items) => items.sort((left, right) => left.sort_order - right.sort_order || left.title.localeCompare(right.title, "zh-CN")));
  const roots = goals.filter((goal) => !goal.parent_id || !byID.has(goal.parent_id)).sort((left, right) => left.sort_order - right.sort_order || left.title.localeCompare(right.title, "zh-CN"));
  const positions = new Map<string, { x: number; y: number; depth: number }>();
  const placed = new Set<string>();
  const active = new Set<string>();
  let leaf = 0;
  const place = (goal: Goal, depth: number): number => {
    if (placed.has(goal.id)) return positions.get(goal.id)?.x ?? leaf * 320;
    if (active.has(goal.id)) return leaf++ * 320;
    active.add(goal.id);
    const descendants = (children.get(goal.id) ?? []).filter((item) => !active.has(item.id));
    const descendantXs = descendants.map((item) => place(item, depth + 1));
    const x = descendantXs.length ? (descendantXs[0] + descendantXs[descendantXs.length - 1]) / 2 : leaf++ * 320;
    positions.set(goal.id, { x, y: depth * 190, depth });
    placed.add(goal.id);
    active.delete(goal.id);
    return x;
  };
  roots.forEach((goal, index) => { if (index > 0) leaf += 0.25; place(goal, 0); });
  goals.forEach((goal) => { if (!placed.has(goal.id)) { leaf += 0.25; place(goal, 0); } });
  return positions;
}
function goalEdges(goals: Goal[], selectedID: string | null): Edge[] { const highlighted = highlightedGoals(goals, selectedID); return goals.filter((goal) => goal.parent_id).map((goal) => ({ id: `${goal.parent_id}-${goal.id}`, source: goal.parent_id!, target: goal.id, type: "smoothstep", style: { stroke: highlighted.has(goal.id) && highlighted.has(goal.parent_id!) ? "#d97706" : "#0f766e", strokeWidth: highlighted.has(goal.id) && highlighted.has(goal.parent_id!) ? 3 : 1.5 } })); }
