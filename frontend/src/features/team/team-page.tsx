import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Background, Controls, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import { Camera, Check, Focus, GitBranch, Plus, Trash2, UserCheck, UserRoundX, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AuthResponse, TeamMember, TeamMemberRequest, TeamSnapshot } from "@/api/client";
import { createTeamSnapshot, deleteTeamMember, listTeamSnapshots, saveTeamMember } from "@/api/client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, SubpageLoadingState } from "@/components/ui/state-block";
import { DataTable, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessDate } from "@/lib/date";
import { errorMessage } from "@/lib/utils";
import { FIRST_SCREEN_STALE_TIME, teamMembersQueryOptions } from "@/lib/query-options";
import "@xyflow/react/dist/style.css";

type Form = { name: string; parent_id: string; rank: string; city: string; joined_on: string; status: "ACTIVE" | "INACTIVE"; note: string; node_color: string };
type TeamView = "graph" | "list" | "snapshots";
type MemberDialog = { mode: "create" } | { mode: "detail" | "edit"; member: TeamMember } | null;
const defaultNodeColor = "#0f766e";
const nodeColorPresets = ["#0f766e", "#2563eb", "#7c3aed", "#be123c", "#c2410c", "#a16207", "#047857", "#475569"];
const emptyForm: Form = { name: "", parent_id: "", rank: "", city: "", joined_on: "", status: "ACTIVE", note: "", node_color: defaultNodeColor };

function teamNameError(name: string): string | null {
  const value = name.trim();
  if (value.length < 2 || value.length > 200) return "成员姓名需要 2 到 200 个字符";
  if (/^\d+$/.test(value)) return "成员姓名不能全部是数字";
  return null;
}

type GraphMember = { id: string; parent_id?: string | null; name: string; rank?: string | null; city?: string | null; status: "ACTIVE" | "INACTIVE"; node_color?: string };

function textColor(background: string) {
  const value = background.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#0f172a" : "#ffffff";
}

function graphNodes(members: GraphMember[], selectedID?: string | null): Node[] {
  const membersByID = new Map(members.map((member) => [member.id, member]));
  const depthFor = (member: GraphMember, seen = new Set<string>()): number => {
    if (!member.parent_id || !membersByID.has(member.parent_id) || seen.has(member.id)) return 0;
    const nextSeen = new Set(seen); nextSeen.add(member.id);
    return 1 + depthFor(membersByID.get(member.parent_id)!, nextSeen);
  };
  const layers = new Map<number, GraphMember[]>();
  members.forEach((member) => { const depth = depthFor(member); layers.set(depth, [...(layers.get(depth) ?? []), member]); });
  return [...layers.entries()].flatMap(([depth, layer]) => {
    let nextX = 0;
    return layer.sort((left, right) => left.name.localeCompare(right.name, "zh-CN")).map((member) => {
      const nodeColor = member.node_color ?? defaultNodeColor;
      const width = Math.min(220, Math.max(96, Array.from(member.name).length * 16 + 36));
      const x = nextX;
      nextX += width + 76;
      return {
      id: member.id,
      position: { x, y: depth * 150 },
      data: { label: member.name },
      ariaLabel: member.name,
      style: {
        width,
        height: 64,
        borderRadius: 16,
        border: selectedID === member.id ? "2px solid #f59e0b" : `1px solid ${nodeColor}`,
        background: nodeColor,
        color: textColor(nodeColor),
        boxShadow: selectedID === member.id ? "0 0 0 4px rgb(245 158 11 / 0.22), 0 12px 24px -14px rgb(15 23 42 / 0.48)" : "0 10px 22px -16px rgb(15 23 42 / 0.52)",
        fontWeight: 700,
        overflow: "hidden",
        padding: "16px 18px",
        fontSize: 15,
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      } satisfies Node;
    });
  });
}

function TeamGraph({ members, selectedID, onSelect }: { members: GraphMember[]; selectedID?: string | null; onSelect?: (id: string) => void }) {
  const nodes = useMemo(() => graphNodes(members, selectedID), [members, selectedID]);
  const edges = useMemo<Edge[]>(() => members.filter((member) => member.parent_id).map((member) => ({ id: `${member.parent_id}-${member.id}`, source: member.parent_id!, target: member.id, style: { stroke: "#5aaea3", strokeWidth: 1.75 } })), [members]);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  if (!nodes.length) return <div className="grid h-full place-items-center"><EmptyState title="还没有团队成员" description="添加第一位成员后会显示关系图。" /></div>;
  return <div className="team-graph relative h-full overflow-hidden bg-[#f1fbfa]" role="img" aria-label="团队关系图" data-testid="team-graph"><Button className="absolute right-3 top-3 z-10 !rounded-2xl !border-brand-100 !bg-white/90 !text-brand-800 !shadow-card" variant="icon" size="sm" aria-label="关系图回到中心" onClick={() => void instance?.fitView({ padding: 0.2, duration: 250 })}><Focus size={15} /></Button><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.35} maxZoom={1.8} nodesDraggable={false} panOnDrag zoomOnScroll zoomOnPinch preventScrolling onInit={setInstance} onNodeClick={(_, node) => onSelect?.(node.id)}><Controls showInteractive={false} className="!overflow-hidden !rounded-2xl !border-brand-100 !bg-white/90 !shadow-card" /><Background gap={24} size={1} color="#cfece7" /></ReactFlow></div>;
}

function TeamHero() {
  return <section className="relative isolate overflow-hidden rounded-hero border border-white/80 bg-gradient-to-r from-brand-50/90 via-sky-50/65 to-brand-50/80 px-5 py-5 shadow-card ring-1 ring-brand-100/70 sm:px-7 sm:py-6">
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] opacity-80 [mask-image:linear-gradient(to_right,transparent,black_28%)] sm:block" aria-hidden="true">
      <svg viewBox="0 0 620 180" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <path d="M0 148C76 125 118 132 176 104C230 78 271 91 315 110C368 132 403 92 452 84C509 74 539 104 620 44V180H0V148Z" fill="url(#team-hero-fill)" />
        <path d="M50 145C121 119 168 123 218 104C266 86 294 103 336 116C385 132 417 92 462 86C518 78 553 102 610 61" stroke="#4ca99b" strokeWidth="3" strokeLinecap="round" />
        <path d="M407 145C415 127 424 114 434 101C441 117 446 130 450 145" fill="#147c74" fillOpacity=".72" />
        <path d="M434 102C427 91 416 87 406 90C414 102 424 107 434 107M435 97C443 85 454 82 465 87C456 99 446 104 435 104" fill="#65bda5" fillOpacity=".82" />
        <path d="M506 43C506 30 516 20 529 20C542 20 552 30 552 43C552 56 542 66 529 66C516 66 506 56 506 43Z" fill="#FDE68A" fillOpacity=".78" />
        <path d="M529 9V2M529 84V77M495 43H488M570 43H563M505 19L500 14M553 67L558 72M553 19L558 14M505 67L500 72" stroke="#D69E2E" strokeWidth="2" strokeLinecap="round" />
        <defs><linearGradient id="team-hero-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#CCFBF1" stopOpacity=".82" /><stop offset="1" stopColor="#DBEAFE" stopOpacity=".32" /></linearGradient></defs>
      </svg>
    </div>
    <div className="relative z-[1] flex min-h-[132px] flex-col justify-center">
      <PageHeader className="page-header-plain max-w-2xl border-0 pb-0" eyebrow="关系与成长" title="团队" description="查看当前组织结构，并用月末快照保留历史状态。" />
    </div>
  </section>;
}

export function TeamPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const client = useQueryClient();
  const membersQuery = useQuery(teamMembersQueryOptions(accountId));
  const snapshotsQuery = useQuery({ queryKey: ["user", accountId, "team", "snapshots"], queryFn: listTeamSnapshots, staleTime: FIRST_SCREEN_STALE_TIME });
  const members = useMemo(() => membersQuery.data?.data.items ?? [], [membersQuery.data]);
  const [view, setView] = useState<TeamView>("graph");
  const [search, setSearch] = useState("");
  const [memberSheet, setMemberSheet] = useState<MemberDialog>(null);
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

  const closeSheet = () => { setMemberSheet(null); window.setTimeout(() => returnFocus.current?.focus({ preventScroll: true }), 0); };
  const openCreate = () => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setForm({ ...emptyForm, joined_on: businessDate(authResponse.data.account.timezone) }); setNameTouched(false); setMemberSheet({ mode: "create" }); };
  const openDetail = (member: TeamMember) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setMemberSheet({ mode: "detail", member }); };
  const openEdit = (member: TeamMember, retainFocus = false) => { if (!retainFocus) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setForm({ name: member.name, parent_id: member.parent_id ?? "", rank: member.rank ?? "", city: member.city ?? "", joined_on: member.joined_on ?? "", status: member.status, note: member.note ?? "", node_color: member.node_color ?? defaultNodeColor }); setNameTouched(true); setMemberSheet({ mode: "edit", member }); };

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

  const activeCount = members.filter((member) => member.status === "ACTIVE").length;
  const staleDataRefreshFailed = (membersQuery.isError && Boolean(membersQuery.data)) || (view === "snapshots" && snapshotsQuery.isError && Boolean(snapshotsQuery.data));
  const retryStaleData = () => {
    if (membersQuery.isError) void membersQuery.refetch();
    if (view === "snapshots" && snapshotsQuery.isError) void snapshotsQuery.refetch();
  };
  const membersContent = membersQuery.isPending && !membersQuery.data
    ? <SubpageLoadingState label="正在加载团队成员" />
    : membersQuery.isError && !membersQuery.data
      ? <ErrorState message="团队成员暂时无法加载" onRetry={() => void membersQuery.refetch()} />
      : view === "graph"
        ? <Panel className="team-graph-panel rounded-[1.25rem] border-outline/75 bg-surface shadow-panel [&>header]:border-b-0 [&>header]:pb-2 [&>div]:pt-3" title="团队关系图" description="搜索可定位成员；使用画布控制调整视图，点击成员打开详情。" action={<TeamSearch value={search} onChange={setSearch} />}><div className={`${members.length ? "h-[min(68vh,720px)] min-h-[500px]" : "min-h-[240px]"} overflow-hidden rounded-[1.25rem] border border-brand-200/80 bg-[#e8f6f4] shadow-inner`}><TeamGraph members={members} selectedID={selectedGraphID} onSelect={(id) => { const member = members.find((item) => item.id === id); if (member) { setSelectedGraphID(id); openDetail(member); } }} /></div></Panel>
        : view === "list"
          ? <MemberList members={filteredMembers} allMembers={members} search={search} onSearch={setSearch} onView={openDetail} onEdit={openEdit} onDelete={setRemoveTarget} />
          : snapshotsQuery.isPending && !snapshotsQuery.data
            ? <SubpageLoadingState label="正在加载团队快照" />
            : snapshotsQuery.isError && !snapshotsQuery.data
              ? <ErrorState message="团队快照暂时无法加载" onRetry={() => void snapshotsQuery.refetch()} />
              : <SnapshotsView snapshots={snapshotsQuery.data?.data.items ?? []} selected={selectedSnapshot} onSelect={setSelectedSnapshot} />;
  return <div className="team-page space-y-6">
    <TeamHero />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-card border px-4 py-3 text-sm shadow-hairline ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-brand-200 bg-brand-50 text-brand-900"}`}>{error || notice}</p>}
    <section aria-label="团队概览" className="grid gap-3 sm:grid-cols-3"><MetricCard label="成员" value={membersQuery.data ? members.length : "—"} icon={<UsersRound size={20} />} tone="brand" /><MetricCard label="启用" value={membersQuery.data ? activeCount : "—"} icon={<UserCheck size={20} />} tone="blue" /><MetricCard label="停用" value={membersQuery.data ? members.length - activeCount : "—"} icon={<UserRoundX size={20} />} tone="amber" /></section>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Tabs value={view} onValueChange={(value) => setView(value as TeamView)}><TabsList aria-label="团队视图"><TabsTrigger value="graph">关系图</TabsTrigger><TabsTrigger value="list">成员列表</TabsTrigger><TabsTrigger value="snapshots">历史快照</TabsTrigger></TabsList></Tabs>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => snapshot.mutate()} loading={snapshot.isPending}><Camera size={16} />保存快照</Button>
        <Button onClick={openCreate}><Plus size={16} />新增成员</Button>
      </div>
    </div>
    {staleDataRefreshFailed && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">刷新失败，当前仍显示上次数据。 <button type="button" className="font-semibold underline" onClick={retryStaleData}>重试</button></p>}
    {membersContent}

    <Dialog open={Boolean(memberSheet)} onOpenChange={(open) => !open && closeSheet()}>
      {memberSheet && <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{memberSheet.mode === "detail" ? memberSheet.member.name : memberSheet.mode === "edit" ? "编辑成员" : "新增成员"}</DialogTitle><DialogDescription>{memberSheet.mode === "detail" ? "查看成员关系与基本信息。" : "成员层级仅通过上级成员字段调整。"}</DialogDescription></DialogHeader>{memberSheet.mode === "detail" ? <><MemberDetail member={memberSheet.member} members={members} /><div className="mt-6 flex justify-end gap-3"><Button variant="danger" onClick={() => setRemoveTarget(memberSheet.member)}><Trash2 size={16} />删除</Button><Button onClick={() => openEdit(memberSheet.member, true)}>编辑成员</Button></div></> : <><MemberEditor form={form} members={members} editingID={editing?.id} nameTouched={nameTouched} onChange={setForm} onNameTouched={setNameTouched} /><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={closeSheet}>取消</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={Boolean(teamNameError(form.name))}><Check size={16} />保存成员</Button></div></>}</DialogContent>}
    </Dialog>
    <ConfirmDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)} title="确认删除成员" description={removeTarget ? `确定删除“${removeTarget.name}”吗？存在下属时需要先调整层级。` : ""} confirmLabel="删除" loading={remove.isPending} onConfirm={() => remove.mutate()} />
  </div>;
}

function MemberEditor({ form, members, editingID, nameTouched, onChange, onNameTouched }: { form: Form; members: TeamMember[]; editingID?: string; nameTouched: boolean; onChange: (value: Form) => void; onNameTouched: (value: boolean) => void }) {
  return <div className="space-y-5"><Input label="团队成员姓名" required error={nameTouched ? teamNameError(form.name) ?? undefined : undefined} value={form.name} onChange={(event) => { onNameTouched(true); onChange({ ...form, name: event.target.value }); }} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-ink-muted">上级成员</span><select className="min-h-10 w-full rounded-control border border-outline bg-surface px-3 text-sm text-ink shadow-hairline outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" value={form.parent_id} onChange={(event) => onChange({ ...form, parent_id: event.target.value })}><option value="">直属根节点</option>{members.filter((member) => member.id !== editingID).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><Input label="级别" value={form.rank} onChange={(event) => onChange({ ...form, rank: event.target.value })} /><Input label="城市" value={form.city} onChange={(event) => onChange({ ...form, city: event.target.value })} /><Input label="加入日期" type="date" value={form.joined_on} onChange={(event) => onChange({ ...form, joined_on: event.target.value })} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-ink-muted">状态</span><select className="min-h-10 w-full rounded-control border border-outline bg-surface px-3 text-sm text-ink shadow-hairline outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as Form["status"] })}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></label></div><fieldset className="space-y-3"><legend className="text-sm font-semibold text-ink-muted">节点颜色</legend><div className="flex flex-wrap gap-2">{nodeColorPresets.map((color) => <button key={color} type="button" aria-label={`选择节点颜色 ${color}`} aria-pressed={form.node_color === color} className="h-9 w-9 rounded-control border-2 border-white shadow-[0_0_0_1px_rgb(var(--color-outline))] focus:outline-none focus:ring-2 focus:ring-brand-500" style={{ backgroundColor: color, boxShadow: form.node_color === color ? "0 0 0 2px #218e83" : undefined }} onClick={() => onChange({ ...form, node_color: color })} />)}</div><div className="flex flex-wrap items-end gap-3"><label className="block space-y-1.5"><span className="text-sm font-semibold text-ink-muted">自定义节点颜色</span><input type="color" className="block h-10 w-16 cursor-pointer rounded-control border border-outline bg-surface p-1" value={form.node_color} onChange={(event) => onChange({ ...form, node_color: event.target.value })} /></label><div className="flex min-h-10 items-center gap-2 rounded-control border border-outline/70 bg-surface-muted/45 px-3 text-sm text-ink-muted"><span className="h-5 w-5 rounded-control border border-black/10" style={{ backgroundColor: form.node_color }} aria-hidden="true" /><span>预览 {form.node_color}</span></div><Button variant="secondary" size="sm" onClick={() => onChange({ ...form, node_color: defaultNodeColor })}>恢复默认颜色</Button></div></fieldset><label className="block space-y-1.5"><span className="text-sm font-semibold text-ink-muted">备注</span><textarea className="min-h-24 w-full rounded-control border border-outline bg-surface px-3 py-2.5 text-sm text-ink shadow-hairline outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} /></label></div>;
}

function MemberDetail({ member, members }: { member: TeamMember; members: TeamMember[] }) {
  const parent = members.find((item) => item.id === member.parent_id);
  const children = members.filter((item) => item.parent_id === member.id);
  return <div className="space-y-6"><div className="flex justify-between"><StatusBadge tone={member.status === "ACTIVE" ? "success" : "neutral"}>{member.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge><span className="text-sm font-semibold text-ink-muted">{member.rank ? `级别：${member.rank}` : "未设置级别"}</span></div><dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-ink-faint">上级成员</dt><dd className="font-semibold text-ink">{parent?.name ?? "直属根节点"}</dd><dt className="text-ink-faint">城市</dt><dd className="font-semibold text-ink">{member.city || "未设置"}</dd><dt className="text-ink-faint">加入日期</dt><dd className="font-semibold text-ink">{member.joined_on || "未设置"}</dd><dt className="text-ink-faint">节点颜色</dt><dd className="flex items-center gap-2 font-semibold text-ink"><span className="h-5 w-5 rounded-control border border-black/10" style={{ backgroundColor: member.node_color }} aria-hidden="true" />{member.node_color}</dd></dl>{member.note && <section className="border-t border-outline/60 pt-5"><h3 className="text-sm font-bold text-ink">备注</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{member.note}</p></section>}<section className="border-t border-outline/60 pt-5"><h3 className="text-sm font-bold text-ink">直属成员</h3>{children.length ? <ul className="mt-3 space-y-2">{children.map((child) => <li key={child.id} className="rounded-control bg-surface-muted/65 px-3 py-2.5 text-sm font-semibold text-ink-muted">{child.name}</li>)}</ul> : <p className="mt-2 text-sm text-ink-faint">暂无直属成员。</p>}</section><details className="border-t border-outline/60 pt-5"><summary className="cursor-pointer text-sm font-semibold text-ink-muted">高级信息</summary><dl className="mt-3 grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 text-sm"><dt className="text-ink-faint">成员编码</dt><dd className="break-all font-mono text-xs text-ink-muted">{member.member_code}</dd></dl></details></div>;
}

function TeamSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="w-full sm:w-72"><Input label="搜索成员" value={value} onChange={(event) => onChange(event.target.value)} placeholder="姓名、级别或城市" /></div>;
}

function MemberList({ members, allMembers, search, onSearch, onView, onEdit, onDelete }: { members: TeamMember[]; allMembers: TeamMember[]; search: string; onSearch: (value: string) => void; onView: (member: TeamMember) => void; onEdit: (member: TeamMember) => void; onDelete: (member: TeamMember) => void }) {
  return <Panel className="rounded-[1.25rem] border-outline/55 bg-surface/95 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.42)] [&>header]:border-b-0 [&>header]:pb-2 [&>div]:pt-3" title="成员列表" description="查看状态、层级与上级，或快速进入编辑。" action={<TeamSearch value={search} onChange={onSearch} />}>{members.length ? <DataTable className="min-w-[760px]"><TableHead><TableRow><TableCell asHeader>成员</TableCell><TableCell asHeader>上级</TableCell><TableCell asHeader>级别 / 城市</TableCell><TableCell asHeader>状态</TableCell><TableCell asHeader className="text-right">操作</TableCell></TableRow></TableHead><TableBody>{members.map((member) => <TableRow key={member.id}><TableCell><button type="button" className="flex items-center gap-3 text-left font-bold text-ink hover:text-brand-800" onClick={() => onView(member)}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-100 text-sm font-extrabold text-brand-800 shadow-hairline">{member.name.slice(0, 1)}</span><span className="min-w-0"><span className="block truncate">{member.name}</span><span className="mt-0.5 block text-xs font-medium text-ink-faint">{member.rank || "团队成员"}</span></span></button></TableCell><TableCell className="text-ink-muted">{allMembers.find((item) => item.id === member.parent_id)?.name ?? "根节点"}</TableCell><TableCell className="text-ink-muted">{member.rank ? `级别：${member.rank}` : "未设置级别"} <span className="text-ink-faint">·</span> {member.city ? `城市：${member.city}` : "未设置城市"}</TableCell><TableCell><StatusBadge tone={member.status === "ACTIVE" ? "success" : "neutral"}>{member.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onEdit(member)}>编辑</Button><Button variant="icon" size="sm" aria-label={`删除成员 ${member.name}`} onClick={() => onDelete(member)}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></DataTable> : <EmptyState title="没有匹配的成员" description="调整搜索关键词或添加新成员。" />}</Panel>;
}

function SnapshotsView({ snapshots, selected, onSelect }: { snapshots: TeamSnapshot[]; selected: TeamSnapshot | null; onSelect: (snapshot: TeamSnapshot) => void }) {
  if (!snapshots.length) return <Panel className="rounded-[1.25rem] border-outline/55 bg-surface/95 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.42)]"><EmptyState title="暂无历史快照" description="使用页面右上角保存当前团队快照。" /></Panel>;
  const current = selected ?? snapshots[0];
  return <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]"><Panel className="rounded-[1.25rem] border-outline/75 bg-surface shadow-panel [&>header]:border-b-0 [&>header]:pb-2 [&>div]:pt-3" title="快照日期" description="选择一个时间点查看当时结构。"><div className="relative space-y-3 pl-4 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-px before:bg-brand-100">{snapshots.map((snapshot) => <button key={snapshot.id} type="button" onClick={() => onSelect(snapshot)} className={`relative w-full rounded-2xl border px-4 py-3 text-left shadow-hairline transition-[border-color,background-color,box-shadow] ${current.id === snapshot.id ? "border-brand-400 bg-brand-50/80 shadow-card" : "border-outline/55 bg-surface hover:border-brand-200 hover:bg-brand-50/45"}`}><span className={`absolute -left-[1.2rem] top-5 h-3 w-3 rounded-full border-2 border-surface ${current.id === snapshot.id ? "bg-brand-500" : "bg-sky-200"}`} /><span className="flex items-center gap-2 font-bold text-ink"><GitBranch size={15} className="text-brand-700" />{snapshot.snapshot_month}</span><span className="mt-1 block text-xs font-medium text-ink-faint">{snapshot.members.length} 位成员 · {snapshot.snapshot_type === "AUTO" ? "自动" : "手动"}{snapshot.captured_late ? " · 延迟捕获" : ""}</span></button>)}</div></Panel><Panel className="rounded-[1.25rem] border-outline/75 bg-surface shadow-panel [&>header]:border-b-0 [&>header]:pb-2 [&>div]:pt-3" title={`${current.snapshot_month} 团队结构`} description={`${current.snapshot_type === "AUTO" ? "自动" : "手动"}快照 · 捕获于 ${new Date(current.captured_at).toLocaleString("zh-CN")}`}><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><GitBranch size={14} />{current.snapshot_type === "AUTO" ? "自动快照" : "手动快照"}</div><div className="h-[min(62vh,640px)] min-h-[460px] overflow-hidden rounded-[1.25rem] border border-brand-200/80 bg-[#e8f6f4] shadow-inner"><TeamGraph members={current.members} /></div></Panel></div>;
}

function formRequest(form: Form): TeamMemberRequest { return { name: form.name.trim(), parent_id: form.parent_id || null, rank: form.rank.trim() || null, city: form.city.trim() || null, joined_on: form.joined_on || null, status: form.status, note: form.note.trim() || null, node_color: form.node_color, sort_order: 0 }; }
