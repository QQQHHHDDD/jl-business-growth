import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, FileUp, Plus, Search, Timer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { useSearchParams } from "react-router-dom";
import type { AuthResponse, FileAsset, KnowledgeItem, KnowledgeItemRequest } from "@/api/client";
import { deleteFile, deleteKnowledgeItem, listFiles, listKnowledgeItems, listLearningSessions, saveKnowledgeItem, saveLearningSession, uploadFile } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState, ErrorState, PageLoadingState } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessDate } from "@/lib/date";
import { errorMessage } from "@/lib/utils";

type Form = { title: string; type: KnowledgeItemRequest["type"]; status: KnowledgeItemRequest["status"]; raw_text: string; tags: string; progress_current: string; progress_total: string; progress_unit: string };
const blank: Form = { title: "", type: "BOOK", status: "NOT_STARTED", raw_text: "", tags: "", progress_current: "", progress_total: "", progress_unit: "页" };
const typeLabels: Record<KnowledgeItemRequest["type"], string> = { BOOK: "书籍", AUDIO: "音频", VIDEO: "视频", EVENT: "活动", MEETING: "会议", PHP: "PHP 课程", MENTOR: "导师辅导", PRODUCT: "产品", OTHER: "其他" };
const statusLabels = { NOT_STARTED: "未开始", IN_PROGRESS: "进行中", COMPLETED: "已完成" } as const;

export function KnowledgePage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const client = useQueryClient();
  const itemsQuery = useQuery({ queryKey: ["user", accountId, "knowledge"], queryFn: listKnowledgeItems });
  const filesQuery = useQuery({ queryKey: ["user", accountId, "files"], queryFn: listFiles });
  const sessionsQuery = useQuery({ queryKey: ["user", accountId, "learning-sessions"], queryFn: () => listLearningSessions() });
  const [tab, setTab] = useState("items");
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeTarget, setRemoveTarget] = useState<KnowledgeItem | null>(null);
  const [removeFileTarget, setRemoveFileTarget] = useState<FileAsset | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [tag, setTag] = useState("ALL");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const handledDeepLink = useRef<string | null>(null);
  const files = useMemo(() => filesQuery.data?.data.items.filter((file) => file.category === "KNOWLEDGE_DOCUMENT" || file.category === "KNOWLEDGE_IMAGE") ?? [], [filesQuery.data]);
  const items = useMemo(() => itemsQuery.data?.data.items ?? [], [itemsQuery.data]);
  const save = useMutation({ mutationFn: () => saveKnowledgeItem(authResponse.data.csrf_token, itemRequest(form, selectedFileIds), editing?.id), onSuccess: () => { closeEditor(); setNotice("学习项目已保存"); setError(""); void client.invalidateQueries({ queryKey: ["user", accountId, "knowledge"] }); }, onError: (value) => { setError(errorMessage(value)); setNotice(""); } });
  const remove = useMutation({ mutationFn: () => deleteKnowledgeItem(authResponse.data.csrf_token, removeTarget!.id), onSuccess: () => { setRemoveTarget(null); setNotice("学习项目已删除"); void client.invalidateQueries({ queryKey: ["user", accountId, "knowledge"] }); }, onError: (value) => setError(errorMessage(value)) });
  const removeFile = useMutation({ mutationFn: () => deleteFile(authResponse.data.csrf_token, removeFileTarget!.id), onSuccess: () => { setRemoveFileTarget(null); setNotice("附件已删除"); void client.invalidateQueries({ queryKey: ["user", accountId, "files"] }); void client.invalidateQueries({ queryKey: ["user", accountId, "knowledge"] }); }, onError: (value) => setError(errorMessage(value)) });
  const upload = useMutation({ mutationFn: () => uploadFile(authResponse.data.csrf_token, selectedFile!, selectedFile?.type.startsWith("image/") ? "KNOWLEDGE_IMAGE" : "KNOWLEDGE_DOCUMENT"), onSuccess: (value) => { setSelectedFile(null); setSelectedFileIds((current) => [...current, value.data.id]); setNotice("文件已上传并选中，请保存项目完成关联"); void client.invalidateQueries({ queryKey: ["user", accountId, "files"] }); }, onError: (value) => setError(errorMessage(value)) });
  const session = useMutation({ mutationFn: (knowledgeItemId: string) => saveLearningSession(authResponse.data.csrf_token, { knowledge_item_id: knowledgeItemId, activity_type: "READING", activity_date: businessDate(authResponse.data.account.timezone), minutes: 30, source: "ITEM" }), onSuccess: () => { setNotice("已记录 30 分钟读书时间"); void client.invalidateQueries({ queryKey: ["user", accountId, "learning-sessions"] }); }, onError: (value) => setError(errorMessage(value)) });
  useEffect(() => {
    const tagName = searchParams.get("tag");
    if (tagName) setTag(tagName);
    const itemID = searchParams.get("item");
    if (!itemID || handledDeepLink.current === itemID || itemsQuery.isPending) return;
    handledDeepLink.current = itemID;
    const item = items.find((value) => value.id === itemID);
    if (item) {
      setTab("items");
      setEditing(item);
      setSelectedFileIds(item.file_ids);
      setForm(formFromItem(item));
      setEditorOpen(true);
    }
  }, [items, itemsQuery.isPending, searchParams]);
  if (itemsQuery.isPending || filesQuery.isPending || sessionsQuery.isPending) return <PageLoadingState eyebrow="输入与沉淀" title="学习中心" description="整理长期学习投入。" label="正在加载学习中心" />;
  if (itemsQuery.isError || filesQuery.isError || sessionsQuery.isError) return <ErrorState message="学习中心数据暂时无法加载" onRetry={() => { void itemsQuery.refetch(); void filesQuery.refetch(); void sessionsQuery.refetch(); }} />;
  const tags = [...new Set(items.flatMap((item) => item.tags))].sort();
  const filteredItems = items.filter((item) => (type === "ALL" || item.type === type) && (status === "ALL" || item.status === status) && (tag === "ALL" || item.tags.includes(tag)) && `${item.title} ${item.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6); const weekKey = weekStart.toISOString().slice(0, 10);
  const weekMinutes = sessionsQuery.data.data.items.filter((item) => item.activity_date >= weekKey).reduce((sum, item) => sum + item.minutes, 0);
  const edit = (item: KnowledgeItem) => { setEditing(item); setSelectedFileIds(item.file_ids); setForm(formFromItem(item)); setEditorOpen(true); };
  function closeEditor() { setEditorOpen(false); setEditing(null); setForm(blank); setSelectedFileIds([]); setSelectedFile(null); }
  return <div className="space-y-6">
    <PageHeader eyebrow="输入与沉淀" title="学习中心" description="管理学习项目、真实学习投入与安全存储的附件。" action={<Button onClick={() => setEditorOpen(true)}><Plus size={16} />新增学习</Button>} />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><Summary label="近 7 日学习" value={`${weekMinutes} 分钟`} /><Summary label="进行中" value={`${items.filter((item) => item.status === "IN_PROGRESS").length} 项`} /><Summary label="已完成" value={`${items.filter((item) => item.status === "COMPLETED").length} 项`} /></div>
    <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="学习中心视图"><TabsTrigger value="items">学习项目</TabsTrigger><TabsTrigger value="files">附件库</TabsTrigger></TabsList></Tabs>
    {tab === "items" ? <Panel title="学习项目" description="筛选项目并从详情入口继续编辑或记录学习时长。"><div className="mb-5 grid gap-3 md:grid-cols-4"><div className="relative md:col-span-1"><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} /><input aria-label="搜索学习项目" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或标签" className="min-h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm" /></div><Filter label="类型筛选" value={type} onChange={setType}><option value="ALL">全部类型</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Filter><Filter label="状态筛选" value={status} onChange={setStatus}><option value="ALL">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Filter><Filter label="标签筛选" value={tag} onChange={setTag}><option value="ALL">全部标签</option>{tags.map((value) => <option key={value}>{value}</option>)}</Filter></div>{filteredItems.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredItems.map((item) => <article key={item.id} className="flex min-h-44 flex-col rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-teal-700">{typeLabels[item.type]}</p><h2 className="mt-1 truncate font-bold text-slate-950">{item.title}</h2></div><StatusBadge tone={item.status === "COMPLETED" ? "success" : item.status === "IN_PROGRESS" ? "info" : "neutral"}>{statusLabels[item.status]}</StatusBadge></div><Progress item={item} /><p className="mt-3 line-clamp-2 text-sm text-slate-500">{item.raw_text || item.tags.join("、") || "尚未添加学习内容"}</p><div className="mt-auto flex flex-wrap items-center gap-2 pt-4"><Button variant="secondary" size="sm" onClick={() => session.mutate(item.id)} loading={session.isPending}><Timer size={14} />读 30 分钟</Button><Button variant="ghost" size="sm" onClick={() => edit(item)}>查看 / 编辑</Button><Button variant="icon" size="sm" aria-label={`删除学习项目 ${item.title}`} onClick={() => setRemoveTarget(item)}><Trash2 size={15} /></Button></div></article>)}</div> : <EmptyState title="没有匹配的学习项目" description="调整筛选条件，或新建一条学习项目。" action={<Button size="sm" onClick={() => setEditorOpen(true)}><Plus size={15} />新增学习</Button>} />}</Panel> : <AttachmentLibrary files={files} items={items} onDelete={setRemoveFileTarget} />}
    <Sheet open={editorOpen} onOpenChange={(open) => open ? setEditorOpen(true) : closeEditor()}><SheetContent title={editing ? "编辑学习项目" : "新增学习项目"} description="附件正文不会自动解析，项目内容仍由你手工维护。" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={closeEditor}>取消</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.title.trim()}><Check size={15} />保存项目</Button></div>}><div className="space-y-4"><Input label="学习项目标题" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Select label="类型" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Form["type"] })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select label="状态" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Form["status"] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><div className="grid gap-3 sm:grid-cols-3"><Input label="当前进度" type="number" min="0" value={form.progress_current} onChange={(event) => setForm({ ...form, progress_current: event.target.value })} /><Input label="总进度" type="number" min="0" value={form.progress_total} onChange={(event) => setForm({ ...form, progress_total: event.target.value })} /><Input label="进度单位" value={form.progress_unit} onChange={(event) => setForm({ ...form, progress_unit: event.target.value })} /></div><Input label="标签（逗号分隔）" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">学习内容</span><textarea className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" value={form.raw_text} onChange={(event) => setForm({ ...form, raw_text: event.target.value })} /></label><div className="rounded-lg border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-800">关联附件</p><div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 space-y-1.5"><span className="text-sm text-slate-600">上传 PDF、TXT、Markdown 或图片</span><input aria-label="选择学习文件" type="file" accept="application/pdf,text/plain,text/markdown,image/jpeg,image/png,image/webp,.md" className="block w-full text-sm" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label><Button variant="secondary" size="sm" onClick={() => upload.mutate()} disabled={!selectedFile} loading={upload.isPending}><FileUp size={15} />上传</Button></div>{files.length > 0 && <div className="mt-4 space-y-2">{files.map((file) => <label key={file.id} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={selectedFileIds.includes(file.id)} onChange={() => setSelectedFileIds((current) => current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id])} /><span className="truncate">{file.original_name}</span></label>)}</div>}</div></div></SheetContent></Sheet>
    <ConfirmDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)} title="确认删除学习项目" description={removeTarget ? `确定删除“${removeTarget.title}”吗？关联的项目学习记录也会删除。` : ""} confirmLabel="删除" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    <ConfirmDialog open={Boolean(removeFileTarget)} onOpenChange={(open) => !open && setRemoveFileTarget(null)} title="确认删除附件" description={removeFileTarget ? `确定删除“${removeFileTarget.original_name}”吗？有关联的附件不会被删除。` : ""} confirmLabel="删除" loading={removeFile.isPending} onConfirm={() => removeFile.mutate()} />
  </div>;
}

function AttachmentLibrary({ files, items, onDelete }: { files: FileAsset[]; items: KnowledgeItem[]; onDelete: (file: FileAsset) => void }) { return <Panel title="附件库" description="集中查看当前账号的学习附件及项目关联。">{files.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{files.map((file) => { const linked = items.filter((item) => item.file_ids.includes(file.id)); return <article key={file.id} className="rounded-lg border border-slate-200 p-4"><a href={`/api/files/${file.id}/content?disposition=inline`} target="_blank" rel="noreferrer" className="block rounded-md bg-slate-50 p-4 hover:bg-teal-50">{file.category === "KNOWLEDGE_IMAGE" ? <img className="h-32 w-full object-contain" src={`/api/files/${file.id}/content?disposition=inline`} alt={file.original_name} /> : <div className="grid h-32 place-items-center"><FileText size={32} className="text-teal-700" /></div>}</a><h2 className="mt-3 truncate font-semibold text-slate-900">{file.original_name}</h2><p className="mt-1 text-xs text-slate-500">{file.mime_type} · {new Date(file.created_at).toLocaleDateString("zh-CN")}</p><p className="mt-3 text-sm text-slate-600">关联：{linked.length ? linked.map((item) => item.title).join("、") : "未关联项目"}</p><div className="mt-4 flex gap-2"><Button asChild variant="secondary" size="sm"><a href={`/api/files/${file.id}/content?disposition=inline`} target="_blank" rel="noreferrer">预览</a></Button><Button variant="icon" size="sm" aria-label={`删除附件 ${file.original_name}`} onClick={() => onDelete(file)}><Trash2 size={15} /></Button></div></article>; })}</div> : <EmptyState title="暂无附件" description="在新增或编辑学习项目时上传第一个附件。" />}</Panel>; }
function Summary({ label, value }: { label: string; value: string }) { return <MetricCard label={label} value={value} tone={label.includes("文件") ? "purple" : label.includes("完成") ? "brand" : "blue"} />; }
function Progress({ item }: { item: KnowledgeItem }) { const percent = item.progress_total ? Math.min(100, Math.round(((item.progress_current ?? 0) / item.progress_total) * 100)) : null; return percent === null ? null : <div className="mt-4"><div className="flex justify-between text-xs text-slate-500"><span>{item.progress_current ?? 0} / {item.progress_total} {item.progress_unit}</span><span>{percent}%</span></div><div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${percent}%` }} /></div></div>; }
function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) { return <label><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">{children}</select></label>; }
function Select({ label, children, ...props }: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) { return <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span><select className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" {...props}>{children}</select></label>; }
function formFromItem(item: KnowledgeItem): Form { return { title: item.title, type: item.type, status: item.status, raw_text: item.raw_text ?? "", tags: item.tags.join(", "), progress_current: item.progress_current?.toString() ?? "", progress_total: item.progress_total?.toString() ?? "", progress_unit: item.progress_unit ?? "页" }; }
function itemRequest(form: Form, fileIds: string[]): KnowledgeItemRequest { return { title: form.title.trim(), type: form.type, status: form.status, raw_text: form.raw_text.trim() || null, tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean), progress_current: form.progress_current === "" ? null : Number(form.progress_current), progress_total: form.progress_total === "" ? null : Number(form.progress_total), progress_unit: form.progress_unit.trim() || null, file_ids: fileIds }; }
