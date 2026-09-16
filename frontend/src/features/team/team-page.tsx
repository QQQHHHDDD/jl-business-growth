import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Focus, GitBranch, Maximize2, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AuthResponse, TeamMember, TeamMemberRequest, TeamSnapshot } from "@/api/client";
import { createTeamSnapshot, deleteTeamMember, listTeamMembers, listTeamSnapshots, saveTeamMember } from "@/api/client";
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

type Form = { name: string; parent_id: string; rank: string; city: string; joined_on: string; status: "ACTIVE" | "INACTIVE"; note: string };
type TeamView = "graph" | "list" | "snapshots";
type MemberSheet = { mode: "create" } | { mode: "detail" | "edit"; member: TeamMember } | null;
const emptyForm: Form = { name: "", parent_id: "", rank: "", city: "", joined_on: "", status: "ACTIVE", note: "" };

function teamNameError(name: string): string | null {
  const value = name.trim();
  if (value.length < 2 || value.length > 200) return "成员姓名需要 2 到 200 个字符";
  if (/^\d+$/.test(value)) return "成员姓名不能全部是数字";
  return null;
}

type GraphMember = { id: string; parent_id?: string | null; name: string; rank?: string | null; city?: string | null; status: "ACTIVE" | "INACTIVE" };
type TeamGraphNode = { id: string; position: { x: number; y: number }; data: { name: string; rank: string | null; city: string | null; status: "ACTIVE" | "INACTIVE"; isRoot: boolean } };

function graphNodes(members: GraphMember[]): TeamGraphNode[] {
  const membersByID = new Map(members.map((member) => [member.id, member]));
  const depthFor = (member: GraphMember, seen = new Set<string>()): number => {
    if (!member.parent_id || !membersByID.has(member.parent_id) || seen.has(member.id)) return 0;
    const nextSeen = new Set(seen); nextSeen.add(member.id);
    return 1 + depthFor(membersByID.get(member.parent_id)!, nextSeen);
  };
  const layers = new Map<number, GraphMember[]>();
  members.forEach((member) => { const depth = depthFor(member); layers.set(depth, [...(layers.get(depth) ?? []), member]); });
  return [...layers.entries()].flatMap(([depth, layer]) => layer.sort((left, right) => left.name.localeCompare(right.name, "zh-CN")).map((member, index) => ({ id: member.id, position: { x: index * 250, y: depth * 170 }, data: { name: member.name, rank: member.rank ?? null, city: member.city ?? null, status: member.status, isRoot: !member.parent_id || !membersByID.has(member.parent_id) } })));
}

function TeamGraph({ members, selectedID, onSelect }: { members: GraphMember[]; selectedID?: string | null; onSelect?: (id: string) => void }) {
  const nodes = graphNodes(members);
  const edges = members.filter((member) => member.parent_id).map((member) => ({ source: member.parent_id!, target: member.id }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const width = Math.max(720, ...nodes.map((node) => node.position.x + 230));
  const height = Math.max(480, ...nodes.map((node) => node.position.y + 150));
  const viewport = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const center = () => { const element = viewport.current; if (element) element.scrollTo({ left: Math.max(0, (element.scrollWidth - element.clientWidth) / 2), top: 0, behavior: "smooth" }); };
  const fit = () => { const element = viewport.current; if (!element) return; setScale(Math.max(0.55, Math.min(1, (element.clientWidth - 24) / width, (element.clientHeight - 24) / height))); window.setTimeout(center, 0); };
  useEffect(() => { if (!selectedID) return; viewport.current?.querySelector<HTMLElement>(`[data-member-id="${selectedID}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" }); }, [selectedID, scale]);
  if (!nodes.length) return <div className="grid h-full place-items-center"><EmptyState title="还没有团队成员" description="添加第一位成员后会显示关系图。" /></div>;
  return <div className="relative h-full overflow-hidden bg-slate-50 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]" role="img" aria-label="团队关系图"><div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"><Button variant="icon" size="sm" aria-label="缩小关系图" onClick={() => setScale((value) => Math.max(0.5, value - 0.1))}><Minus size={15} /></Button><Button variant="icon" size="sm" aria-label="放大关系图" onClick={() => setScale((value) => Math.min(1.6, value + 0.1))}><Plus size={15} /></Button><Button variant="icon" size="sm" aria-label="适配关系图" onClick={fit}><Maximize2 size={15} /></Button><Button variant="icon" size="sm" aria-label="关系图回到中心" onClick={center}><Focus size={15} /></Button></div><div ref={viewport} className="h-full overflow-auto"><div style={{ width: width * scale, height: height * scale }}><div className="relative origin-top-left" style={{ width, height, transform: `scale(${scale})` }}><svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{edges.map((edge) => { const source = nodeById.get(edge.source); const target = nodeById.get(edge.target); if (!source || !target) return null; return <path key={`${edge.source}-${edge.target}`} d={`M ${source.position.x + 124} ${source.position.y + 106} C ${source.position.x + 124} ${source.position.y + 140}, ${target.position.x + 124} ${target.position.y - 34}, ${target.position.x + 124} ${target.position.y + 20}`} fill="none" stroke="#0f766e" strokeWidth="2" />; })}</svg>{nodes.map((node) => <button key={node.id} data-member-id={node.id} type="button" onClick={() => onSelect?.(node.id)} className={`absolute w-[208px] rounded-xl border p-4 text-left shadow-float transition hover:-translate-y-0.5 hover:shadow-overlay focus:outline-none focus:ring-2 focus:ring-teal-500 ${selectedID === node.id ? "ring-4 ring-amber-300" : ""} ${node.data.isRoot ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-slate-900"}`} style={{ left: node.position.x + 20, top: node.position.y + 20 }}><span className={`absolute bottom-0 left-0 top-0 w-[3px] rounded-l-xl ${node.data.isRoot ? "bg-teal-300" : "bg-teal-500"}`} aria-hidden="true" /><span className="block font-bold">{node.data.name}</span><span className={`mt-1 block text-xs ${node.data.isRoot ? "text-teal-50" : "text-slate-500"}`}>{node.data.rank ? `级别：${node.data.rank}` : "未设置级别"} · {node.data.city ? `城市：${node.data.city}` : "未设置城市"}</span><span className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${node.data.status === "ACTIVE" ? (node.data.isRoot ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700") : "bg-slate-100 text-slate-600"}`}>{node.data.status === "ACTIVE" ? "启用" : "停用"}</span></button>)}</div></div></div></div>;
}

export function TeamPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const client = useQueryClient();
  const membersQuery = useQuery({ queryKey: ["user", accountId, "team", "members"], queryFn: listTeamMembers });
  const snapshotsQuery = useQuery({ queryKey: ["user", accountId, "team", "snapshots"], queryFn: listTeamSnapshots });
  const members = useMemo(() => membersQuery.data?.data.items ?? [], [membersQuery.data]);
  const [view, setView] = useState<TeamView>("graph");
  const [search, setSearch] = useState("");
  const [memberSheet, setMemberSheet] = useState<MemberSheet>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [nameTouched, setNameTouched] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<TeamSnapshot | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const handledDeepLink = useRef<string | null>(null);
  const [selectedGraphID, setSelectedGraphID] = useState<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const editing = memberSheet?.mode === "edit" ? memberSheet.member : null;
  const filteredMembers = useMemo(() => members.filter((member) => [member.name, member.rank, member.city].some((value) => value?.toLowerCase().includes(search.toLowerCase()))), [members, search]);

  const closeSheet = () => { setMemberSheet(null); window.setTimeout(() => returnFocus.current?.focus(), 0); };
  const openCreate = () => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setForm(emptyForm); setNameTouched(false); setMemberSheet({ mode: "create" }); };
  const openDetail = (member: TeamMember) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setMemberSheet({ mode: "detail", member }); };
  const openEdit = (member: TeamMember, retainFocus = false) => { if (!retainFocus) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setForm({ name: member.name, parent_id: member.parent_id ?? "", rank: member.rank ?? "", city: member.city ?? "", joined_on: member.joined_on ?? "", status: member.status, note: member.note ?? "" }); setNameTouched(true); setMemberSheet({ mode: "edit", member }); };

  useEffect(() => {
    const memberID = searchParams.get("member");
    if (!memberID || handledDeepLink.current === memberID || membersQuery.isPending) return;
    handledDeepLink.current = memberID;
    const member = members.find((item) => item.id === memberID);
    if (member) {
      setView("graph");
      setSelectedGraphID(member.id);
      openDetail(member);
    }
  }, [members, membersQuery.isPending, searchParams]);

  useEffect(() => {
    if (!search.trim()) return;
    setSelectedGraphID(filteredMembers[0]?.id ?? null);
  }, [filteredMembers, search]);

  const save = useMutation({
    mutationFn: () => { const validationError = teamNameError(form.name); if (validationError) throw new Error(validationError); return saveTeamMember(authResponse.data.csrf_token, formRequest(form), editing?.id); },
    onSuccess: () => { closeSheet(); setNotice("团队成员已保存"); setError(""); void client.invalidateQueries({ queryKey: ["user", accountId, "team"] }); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const remove = useMutation({ mutationFn: () => deleteTeamMember(authResponse.data.csrf_token, removeTarget!.id), onSuccess: () => { setRemoveTarget(null); closeSheet(); setNotice("团队成员已删除"); setError(""); void client.invalidateQueries({ queryKey: ["user", accountId, "team"] }); }, onError: (value) => setError(errorMessage(value)) });
  const snapshot = useMutation({ mutationFn: () => createTeamSnapshot(authResponse.data.csrf_token, { snapshot_type: "MANUAL", captured_late: false }), onSuccess: (value) => { setNotice("团队快照已保存"); setSelectedSnapshot(value.data); setView("snapshots"); void client.invalidateQueries({ queryKey: ["user", accountId, "team", "snapshots"] }); }, onError: (value) => setError(errorMessage(value)) });

  if (membersQuery.isPending || snapshotsQuery.isPending) return <LoadingState label="正在加载团队" />;
  if (membersQuery.isError || snapshotsQuery.isError) return <ErrorState message="团队数据暂时无法加载" onRetry={() => { void membersQuery.refetch(); void snapshotsQuery.refetch(); }} />;

  const activeCount = members.filter((member) => member.status === "ACTIVE").length;
  return <div className="space-y-6">
    <PageHeader eyebrow="关系与成长" title="团队" description="查看当前组织结构，并用月末快照保留历史状态。" action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => snapshot.mutate()} loading={snapshot.isPending}><Camera size={16} />保存快照</Button><Button onClick={openCreate}><Plus size={16} />新增成员</Button></div>} />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <section aria-label="团队概览" className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white px-2 py-3 shadow-sm sm:px-4"><Summary label="成员" value={members.length} /><Summary label="启用" value={activeCount} /><Summary label="停用" value={members.length - activeCount} /></section>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><Tabs value={view} onValueChange={(value) => setView(value as TeamView)}><TabsList aria-label="团队视图"><TabsTrigger value="graph">关系图</TabsTrigger><TabsTrigger value="list">成员列表</TabsTrigger><TabsTrigger value="snapshots">历史快照</TabsTrigger></TabsList></Tabs>{view !== "snapshots" && <div className="w-full sm:max-w-xs"><Input label="搜索成员" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="姓名、级别或城市" /></div>}</div>
    {view === "graph" && <Panel title="团队关系图" description="搜索可定位成员；使用画布控制调整视图，点击成员打开详情。"><div className="h-[min(68vh,720px)] min-h-[500px] overflow-hidden rounded-xl border border-slate-200"><TeamGraph members={members} selectedID={selectedGraphID} onSelect={(id) => { const member = members.find((item) => item.id === id); if (member) { setSelectedGraphID(id); openDetail(member); } }} /></div></Panel>}
    {view === "list" && <MemberList members={filteredMembers} allMembers={members} onView={openDetail} onEdit={openEdit} onDelete={setRemoveTarget} />}
    {view === "snapshots" && <SnapshotsView snapshots={snapshotsQuery.data.data.items} selected={selectedSnapshot} onSelect={setSelectedSnapshot} />}

    <Sheet open={Boolean(memberSheet)} onOpenChange={(open) => !open && closeSheet()}>
      {memberSheet?.mode === "detail" ? <SheetContent title={memberSheet.member.name} description="查看成员关系与基本信息。" footer={<div className="flex justify-end gap-3"><Button variant="danger" onClick={() => setRemoveTarget(memberSheet.member)}><Trash2 size={16} />删除</Button><Button onClick={() => openEdit(memberSheet.member, true)}>编辑成员</Button></div>}><MemberDetail member={memberSheet.member} members={members} /></SheetContent> : memberSheet ? <SheetContent title={memberSheet.mode === "edit" ? "编辑成员" : "新增成员"} description="成员层级仅通过上级成员字段调整。" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={closeSheet}>取消</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={Boolean(teamNameError(form.name))}><Check size={16} />保存成员</Button></div>}><MemberEditor form={form} members={members} editingID={editing?.id} nameTouched={nameTouched} onChange={setForm} onNameTouched={setNameTouched} /></SheetContent> : null}
    </Sheet>
    <ConfirmDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)} title="确认删除成员" description={removeTarget ? `确定删除“${removeTarget.name}”吗？存在下属时需要先调整层级。` : ""} confirmLabel="删除" loading={remove.isPending} onConfirm={() => remove.mutate()} />
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="px-2 sm:px-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{value}</p></div>; }

function MemberEditor({ form, members, editingID, nameTouched, onChange, onNameTouched }: { form: Form; members: TeamMember[]; editingID?: string; nameTouched: boolean; onChange: (value: Form) => void; onNameTouched: (value: boolean) => void }) {
  return <div className="space-y-5"><Input label="团队成员姓名" required error={nameTouched ? teamNameError(form.name) ?? undefined : undefined} value={form.name} onChange={(event) => { onNameTouched(true); onChange({ ...form, name: event.target.value }); }} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">上级成员</span><select className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={form.parent_id} onChange={(event) => onChange({ ...form, parent_id: event.target.value })}><option value="">直属根节点</option>{members.filter((member) => member.id !== editingID).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><Input label="级别" value={form.rank} onChange={(event) => onChange({ ...form, rank: event.target.value })} /><Input label="城市" value={form.city} onChange={(event) => onChange({ ...form, city: event.target.value })} /><Input label="加入日期" type="date" value={form.joined_on} onChange={(event) => onChange({ ...form, joined_on: event.target.value })} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">状态</span><select className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as Form["status"] })}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></label></div><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">备注</span><textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} /></label></div>;
}

function MemberDetail({ member, members }: { member: TeamMember; members: TeamMember[] }) {
  const parent = members.find((item) => item.id === member.parent_id);
  const children = members.filter((item) => item.parent_id === member.id);
  return <div className="space-y-6"><div className="flex justify-between"><StatusBadge tone={member.status === "ACTIVE" ? "success" : "neutral"}>{member.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge><span className="text-sm font-semibold text-slate-500">{member.rank ? `级别：${member.rank}` : "未设置级别"}</span></div><dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-slate-500">上级成员</dt><dd className="font-semibold text-slate-900">{parent?.name ?? "直属根节点"}</dd><dt className="text-slate-500">城市</dt><dd className="font-semibold text-slate-900">{member.city || "未设置"}</dd><dt className="text-slate-500">加入日期</dt><dd className="font-semibold text-slate-900">{member.joined_on || "未设置"}</dd></dl>{member.note && <section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">备注</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{member.note}</p></section>}<section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">直属成员</h3>{children.length ? <ul className="mt-3 space-y-2">{children.map((child) => <li key={child.id} className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{child.name}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">暂无直属成员。</p>}</section><details className="border-t border-slate-200 pt-5"><summary className="cursor-pointer text-sm font-semibold text-slate-600">高级信息</summary><dl className="mt-3 grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 text-sm"><dt className="text-slate-500">成员编码</dt><dd className="break-all font-mono text-xs text-slate-700">{member.member_code}</dd></dl></details></div>;
}

function MemberList({ members, allMembers, onView, onEdit, onDelete }: { members: TeamMember[]; allMembers: TeamMember[]; onView: (member: TeamMember) => void; onEdit: (member: TeamMember) => void; onDelete: (member: TeamMember) => void }) {
  if (!members.length) return <Panel><EmptyState title="没有匹配的成员" description="调整搜索关键词或添加新成员。" /></Panel>;
  return <Panel title="成员列表" description="查看状态、层级与上级，或快速进入编辑。"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold text-slate-500"><tr><th className="px-3 py-3">成员</th><th className="px-3 py-3">上级</th><th className="px-3 py-3">级别 / 城市</th><th className="px-3 py-3">状态</th><th className="px-3 py-3 text-right">操作</th></tr></thead><tbody>{members.map((member) => <tr key={member.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3"><button type="button" className="font-bold text-slate-900 hover:text-teal-800" onClick={() => onView(member)}>{member.name}</button></td><td className="px-3 py-3 text-slate-600">{allMembers.find((item) => item.id === member.parent_id)?.name ?? "根节点"}</td><td className="px-3 py-3 text-slate-600">{member.rank ? `级别：${member.rank}` : "未设置级别"} · {member.city ? `城市：${member.city}` : "未设置城市"}</td><td className="px-3 py-3"><StatusBadge tone={member.status === "ACTIVE" ? "success" : "neutral"}>{member.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge></td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onEdit(member)}>编辑</Button><Button variant="icon" size="sm" aria-label={`删除成员 ${member.name}`} onClick={() => onDelete(member)}><Trash2 size={15} /></Button></div></td></tr>)}</tbody></table></div></Panel>;
}

function SnapshotsView({ snapshots, selected, onSelect }: { snapshots: TeamSnapshot[]; selected: TeamSnapshot | null; onSelect: (snapshot: TeamSnapshot) => void }) {
  if (!snapshots.length) return <Panel><EmptyState title="暂无历史快照" description="使用页面右上角保存当前团队快照。" /></Panel>;
  const current = selected ?? snapshots[0];
  return <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]"><Panel title="快照日期" description="选择一个时间点查看当时结构。"><div className="space-y-2">{snapshots.map((snapshot) => <button key={snapshot.id} type="button" onClick={() => onSelect(snapshot)} className={`w-full rounded-lg border px-3 py-3 text-left ${current.id === snapshot.id ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}><span className="flex items-center gap-2 font-bold text-slate-900"><GitBranch size={15} className="text-teal-700" />{snapshot.snapshot_month}</span><span className="mt-1 block text-xs text-slate-500">{snapshot.members.length} 位成员 · {snapshot.snapshot_type === "AUTO" ? "自动" : "手动"}{snapshot.captured_late ? " · 延迟捕获" : ""}</span></button>)}</div></Panel><Panel title={`${current.snapshot_month} 团队结构`} description={`${current.snapshot_type === "AUTO" ? "自动" : "手动"}快照 · 捕获于 ${new Date(current.captured_at).toLocaleString("zh-CN")}`}><div className="h-[min(62vh,640px)] min-h-[460px] overflow-auto rounded-xl border border-slate-200"><TeamGraph members={current.members} /></div></Panel></div>;
}

function formRequest(form: Form): TeamMemberRequest { return { name: form.name.trim(), parent_id: form.parent_id || null, rank: form.rank.trim() || null, city: form.city.trim() || null, joined_on: form.joined_on || null, status: form.status, note: form.note.trim() || null, sort_order: 0 }; }
