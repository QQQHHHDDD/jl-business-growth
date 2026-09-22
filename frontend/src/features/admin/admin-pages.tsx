import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, RefreshCcw, ShieldCheck, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createAdmin, createInvitation, deleteAdmin, deleteInvitation, deleteUser, listAdmins, listInvitations, listUsers, resetAdminPassword, resetUserPassword, setAdminStatus, setUserStatus, updateInvitation, type Account, type AuthResponse, type Invitation } from "@/api/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, PromptDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DataTable, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/notice";
import { errorMessage, formatDate, roleLabel } from "@/lib/utils";
import { copyText } from "@/lib/copy";

type ValidityUnit = "HOURS" | "DAYS";

type BulkResult<T> = {
  successes: Array<{ id: string; value: T }>;
  failures: Array<{ id: string; reason: unknown }>;
};

async function runBulk<T>(ids: string[], action: (id: string) => Promise<T>): Promise<BulkResult<T>> {
  const results = await Promise.allSettled(ids.map((id) => action(id)));
  return results.reduce<BulkResult<T>>((summary, result, index) => {
    if (result.status === "fulfilled") summary.successes.push({ id: ids[index], value: result.value });
    else summary.failures.push({ id: ids[index], reason: result.reason });
    return summary;
  }, { successes: [], failures: [] });
}

const hourMilliseconds = 60 * 60 * 1000;
const dayMilliseconds = 24 * hourMilliseconds;

function expiresAtFromDuration(value: string, unit: ValidityUnit): string | undefined {
  if (!value.trim()) return undefined;
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("有效时长请输入大于 0 的数字");
  }
  return new Date(Date.now() + duration * (unit === "DAYS" ? dayMilliseconds : hourMilliseconds)).toISOString();
}


export function AdminHomePage({ account }: { account: Account }) {
  const superAdmin = account.role === "SUPER_ADMIN";
  return <div className="space-y-7"><PageHeader eyebrow="管理功能" title="管理员工作台" description="管理账号和注册入口。管理员端不提供普通用户业务数据读取入口。左侧边栏可切换管理模块。" /><div className="grid gap-4 md:grid-cols-3"><Link to="/admin/users" className="rounded-[1.125rem] border border-brand-100/65 bg-gradient-to-br from-white to-brand-50/35 p-5 shadow-card transition hover:border-brand-300 hover:shadow-card-hover"><Users size={20} className="text-brand-700" /><h2 className="mt-4 font-bold">用户管理</h2><p className="mt-1 text-sm leading-6 text-ink-muted">启停用、重置密码或删除普通用户。</p></Link><Link to="/admin/invitations" className="rounded-[1.125rem] border border-brand-100/65 bg-gradient-to-br from-white to-sky-50/35 p-5 shadow-card transition hover:border-brand-300 hover:shadow-card-hover"><ShieldCheck size={20} className="text-brand-700" /><h2 className="mt-4 font-bold">邀请码</h2><p className="mt-1 text-sm leading-6 text-ink-muted">控制普通用户注册入口和使用限制。</p></Link>{superAdmin && <Link to="/admin/admins" className="rounded-[1.125rem] border border-brand-100/65 bg-gradient-to-br from-white to-violet-50/30 p-5 shadow-card transition hover:border-brand-300 hover:shadow-card-hover"><KeyRound size={20} className="text-brand-700" /><h2 className="mt-4 font-bold">管理员管理</h2><p className="mt-1 text-sm leading-6 text-ink-muted">仅超级管理员可管理普通管理员账号。</p></Link>}</div><Panel title="当前权限" description="当前会话的权限范围"><div className="flex flex-wrap items-center gap-3"><StatusBadge tone="success">{roleLabel(account.role)}</StatusBadge><span className="text-sm text-ink-muted">账号：{account.username}</span><span className="text-sm text-ink-faint">时区：{account.timezone}</span></div></Panel></div>;
}

function ActionDialogs({ target, action, kind, csrfToken, onClose, onNotice }: { target: Account | null; action: "status" | "delete" | "reset" | null; kind: "user" | "admin"; csrfToken: string; onClose: () => void; onNotice: (message: string, error?: boolean) => void }) {
  const queryClient = useQueryClient();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const label = kind === "user" ? "用户" : "管理员";
  const statusMutation = useMutation({ mutationFn: () => kind === "user" ? setUserStatus(csrfToken, target!.id, target!.status === "ACTIVE" ? "DISABLED" : "ACTIVE") : setAdminStatus(csrfToken, target!.id, target!.status === "ACTIVE" ? "DISABLED" : "ACTIVE"), onSuccess: () => { onNotice(`${label}状态已更新。`); onClose(); void queryClient.invalidateQueries({ queryKey: ["admin", kind === "user" ? "users" : "admins"] }); }, onError: (value) => onNotice(errorMessage(value), true) });
  const deleteMutation = useMutation({ mutationFn: () => kind === "user" ? deleteUser(csrfToken, target!.id) : deleteAdmin(csrfToken, target!.id), onSuccess: () => { onNotice(`${label}已删除。`); onClose(); void queryClient.invalidateQueries({ queryKey: ["admin", kind === "user" ? "users" : "admins"] }); }, onError: (value) => onNotice(errorMessage(value), true) });
  const resetMutation = useMutation({ mutationFn: () => kind === "user" ? resetUserPassword(csrfToken, target!.id, temporaryPassword || undefined) : resetAdminPassword(csrfToken, target!.id, temporaryPassword || undefined), onSuccess: (response) => { onNotice(`${label}临时密码：${response.data.temporary_password}`); setTemporaryPassword(""); setResetError(""); onClose(); }, onError: (value) => setResetError(errorMessage(value)) });
  useEffect(() => { if (!target) setTemporaryPassword(""); setResetError(""); }, [target, action]);
  const submitReset = () => {
    if (temporaryPassword && (temporaryPassword.length < 10 || temporaryPassword.length > 128)) {
      setResetError("临时密码长度需要在 10 到 128 个字符之间");
      return;
    }
    setResetError("");
    resetMutation.mutate();
  };
  if (!target) return null;
  return <><ConfirmDialog open={action === "status"} onOpenChange={(open) => !open && onClose()} title={`${target.status === "ACTIVE" ? "停用" : "恢复"}${label}`} description={target.status === "ACTIVE" ? `确定停用${label}“${target.username}”吗？其在线会话将立即失效。` : `确定恢复${label}“${target.username}”吗？`} confirmLabel={target.status === "ACTIVE" ? "确认停用" : "确认恢复"} loading={statusMutation.isPending} onConfirm={() => statusMutation.mutate()} /><ConfirmDialog open={action === "delete"} onOpenChange={(open) => !open && onClose()} title={`删除${label}`} description={`确定永久删除${label}“${target.username}”吗？在线数据和会话将被清理。此操作无法撤销。`} confirmLabel={`删除${label}`} loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} /><PromptDialog open={action === "reset"} onOpenChange={(open) => !open && onClose()} title={`重置${label}密码`} description={`为“${target.username}”设置一次性临时密码；留空则由系统生成。`} label="临时密码" value={temporaryPassword} onValueChange={(value) => { setTemporaryPassword(value); if (resetError) setResetError(""); }} error={resetError} confirmLabel="重置密码" loading={resetMutation.isPending} onConfirm={submitReset} /></>;
}

function AccountActions({ item, kind, csrfToken, onNotice }: { item: Account; kind: "user" | "admin"; csrfToken: string; onNotice: (message: string, error?: boolean) => void }) {
  const [action, setAction] = useState<"status" | "delete" | "reset" | null>(null);
  return <><div className="flex flex-wrap items-center gap-1.5"><Button variant="ghost" size="sm" onClick={() => setAction("status")}>{item.status === "ACTIVE" ? "停用" : "恢复"}</Button><Button variant="ghost" size="sm" onClick={() => setAction("reset")}>重置密码</Button><Button variant="icon" size="sm" onClick={() => setAction("delete")} title={`删除${kind === "user" ? "用户" : "管理员"}`} aria-label={`删除${kind === "user" ? "用户" : "管理员"} ${item.username}`}><Trash2 size={15} className="text-rose-700" /></Button></div><ActionDialogs target={action ? item : null} action={action} kind={kind} csrfToken={csrfToken} onClose={() => setAction(null)} onNotice={onNotice} /></>;
}

function AccountsTable({ items, kind, csrfToken, onNotice, selectedIds, onToggleSelect, onToggleAll }: { items: Account[]; kind: "user" | "admin"; csrfToken: string; onNotice: (message: string, error?: boolean) => void; selectedIds?: ReadonlySet<string>; onToggleSelect?: (id: string) => void; onToggleAll?: () => void }) {
  if (!items.length) return <EmptyState title={`暂无${kind === "user" ? "普通用户" : "普通管理员"}`} />;
  const selectable = Boolean(selectedIds && onToggleSelect && onToggleAll);
  const allSelected = selectable && items.every((item) => selectedIds?.has(item.id));
  return <DataTable><TableHead><TableRow><TableCell asHeader>{selectable ? <label className="flex items-center gap-2"><input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label={`全选${kind === "user" ? "用户" : "管理员"}`} /><span>账号</span></label> : "账号"}</TableCell><TableCell asHeader>状态</TableCell><TableCell asHeader>时区</TableCell><TableCell asHeader>创建时间</TableCell><TableCell asHeader>操作</TableCell></TableRow></TableHead><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{selectable ? <label className="flex items-center gap-2"><input type="checkbox" checked={selectedIds?.has(item.id) ?? false} onChange={() => onToggleSelect?.(item.id)} aria-label={`选择${kind === "user" ? "用户" : "管理员"} ${item.username}`} /><span>{item.username}</span></label> : item.username}</TableCell><TableCell><StatusBadge tone={item.status === "ACTIVE" ? "success" : "danger"}>{item.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge></TableCell><TableCell className="text-slate-600">{item.timezone}</TableCell><TableCell className="text-slate-600">{formatDate(item.created_at)}</TableCell><TableCell><AccountActions item={item} kind={kind} csrfToken={csrfToken} onNotice={onNotice} /></TableCell></TableRow>)}</TableBody></DataTable>;
}

export function AdminUsersPage({ authResponse }: { authResponse: AuthResponse }) {
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: () => listUsers() });
  const users = useMemo(() => usersQuery.data?.data.items ?? [], [usersQuery.data]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<"delete" | "reset" | null>(null);
  const [resetResults, setResetResults] = useState<Array<{ username: string; password: string }>>([]);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const notify = (message: string, isError = false) => setNotice({ message, tone: isError ? "danger" : "success" });
  useEffect(() => { if (!notice) return; const timeout = window.setTimeout(() => setNotice(null), 5000); return () => window.clearTimeout(timeout); }, [notice]);
  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => users.some((item) => item.id === id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [users]);
  const selectedUsers = users.filter((item) => selectedIds.has(item.id));
  const hasActiveSelection = selectedUsers.some((item) => item.status === "ACTIVE");
  const hasDisabledSelection = selectedUsers.some((item) => item.status !== "ACTIVE");
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = users.length > 0 && users.every((item) => selectedIds.has(item.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(users.map((item) => item.id)));
  const bulkStatusMutation = useMutation({ mutationFn: ({ ids, status }: { ids: string[]; status: "ACTIVE" | "DISABLED" }) => runBulk(ids, (id) => setUserStatus(authResponse.data.csrf_token, id, status)), onSuccess: (result, variables) => { setSelectedIds(new Set(result.failures.map((item) => item.id))); const action = variables.status === "ACTIVE" ? "启用" : "停用"; notify(result.failures.length ? `已${action} ${result.successes.length} 个用户，${result.failures.length} 个处理失败。` : `已${action} ${result.successes.length} 个用户。`, result.failures.length > 0); void usersQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  const bulkDeleteMutation = useMutation({ mutationFn: (ids: string[]) => runBulk(ids, (id) => deleteUser(authResponse.data.csrf_token, id)), onSuccess: (result) => { setSelectedIds(new Set(result.failures.map((item) => item.id))); setBulkAction(null); notify(result.failures.length ? `已删除 ${result.successes.length} 个用户，${result.failures.length} 个删除失败。` : `已删除 ${result.successes.length} 个用户。`, result.failures.length > 0); void usersQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  const bulkResetMutation = useMutation({ mutationFn: (ids: string[]) => runBulk(ids, (id) => resetUserPassword(authResponse.data.csrf_token, id)), onSuccess: (result) => { setResetResults(result.successes.map(({ id, value }) => ({ username: users.find((item) => item.id === id)?.username ?? id, password: value.data.temporary_password }))); setSelectedIds(new Set(result.failures.map((item) => item.id))); setBulkAction(null); if (result.failures.length) notify(`已重置 ${result.successes.length} 个用户的密码，${result.failures.length} 个重置失败。`, true); void usersQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  return <div className="space-y-7"><PageHeader eyebrow="管理功能" title="用户管理" description="仅管理账号状态和认证信息，不读取普通用户业务数据。左侧边栏可切换管理模块。" />{notice && <Notice tone={notice.tone} className="fixed left-1/2 top-[4.5rem] z-[100] w-[min(90vw,420px)] -translate-x-1/2 animate-toast-drop-in shadow-overlay">{notice.message}</Notice>}<Panel title="普通用户" description={`共 ${usersQuery.data?.meta.total ?? 0} 个账号。`}>{usersQuery.isPending ? <LoadingState label="正在加载用户" /> : usersQuery.isError ? <ErrorState message={errorMessage(usersQuery.error)} onRetry={() => void usersQuery.refetch()} /> : users.length ? <><div className="mb-3 flex h-14 flex-nowrap items-center justify-between gap-3 overflow-x-auto rounded-control border border-outline/60 bg-surface-soft px-3 py-2"><span className="shrink-0 text-sm font-semibold text-ink-muted">{selectedIds.size > 0 ? `已选择 ${selectedIds.size} 个用户` : "勾选用户后可批量操作"}</span>{selectedIds.size > 0 && <div className="flex shrink-0 flex-nowrap gap-2">{hasActiveSelection && <Button variant="secondary" size="sm" onClick={() => bulkStatusMutation.mutate({ ids: selectedUsers.filter((item) => item.status === "ACTIVE").map((item) => item.id), status: "DISABLED" })} loading={bulkStatusMutation.isPending}>批量停用</Button>}{hasDisabledSelection && <Button variant="primary" size="sm" onClick={() => bulkStatusMutation.mutate({ ids: selectedUsers.filter((item) => item.status !== "ACTIVE").map((item) => item.id), status: "ACTIVE" })} loading={bulkStatusMutation.isPending}>批量启用</Button>}<Button variant="secondary" size="sm" onClick={() => setBulkAction("reset")}><KeyRound size={14} />批量重置密码</Button><Button variant="danger" size="sm" onClick={() => setBulkAction("delete")}><Trash2 size={14} />批量删除</Button></div>}</div><AccountsTable items={users} kind="user" csrfToken={authResponse.data.csrf_token} onNotice={notify} selectedIds={selectedIds} onToggleSelect={toggleSelected} onToggleAll={toggleAll} /><ConfirmDialog open={bulkAction === "reset"} onOpenChange={(open) => !open && setBulkAction(null)} title="批量重置用户密码" description={`将为选中的 ${selectedIds.size} 个用户分别生成一次性临时密码，并使其已有登录会话失效。`} confirmLabel="重置密码" loading={bulkResetMutation.isPending} onConfirm={() => bulkResetMutation.mutate([...selectedIds])} /><ConfirmDialog open={bulkAction === "delete"} onOpenChange={(open) => !open && setBulkAction(null)} title="批量删除用户" description={`确定永久删除选中的 ${selectedIds.size} 个用户吗？其在线数据和会话将被清理，此操作无法撤销。`} confirmLabel="永久删除" loading={bulkDeleteMutation.isPending} onConfirm={() => bulkDeleteMutation.mutate([...selectedIds])} /></> : <EmptyState title="暂无普通用户" />}</Panel><Dialog open={resetResults.length > 0} onOpenChange={(open) => !open && setResetResults([])}><DialogContent><DialogHeader><DialogTitle>临时密码已生成</DialogTitle><DialogDescription>请立即复制并通过安全渠道交给对应用户。关闭后这里不会继续保留。</DialogDescription></DialogHeader><div className="max-h-72 space-y-2 overflow-y-auto">{resetResults.map((item) => <div key={item.username} className="flex items-center justify-between gap-4 rounded-control border border-outline/60 bg-surface-soft px-3 py-2 text-sm"><strong className="min-w-0 truncate">{item.username}</strong><code className="select-all break-all text-right text-brand-800">{item.password}</code></div>)}</div><div className="mt-6 flex justify-end"><Button onClick={() => setResetResults([])}>我已保存</Button></div></DialogContent></Dialog></div>;
}

function invitationExhausted(item: Invitation) {
  return item.max_uses !== null && item.max_uses !== undefined && item.used_count >= item.max_uses;
}

function InvitationRow({ item, selected, onToggleSelect, csrfToken, onNotice }: { item: Invitation; selected: boolean; onToggleSelect: () => void; csrfToken: string; onNotice: (message: string, error?: boolean) => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const exhausted = invitationExhausted(item);
  const toggleMutation = useMutation({ mutationFn: () => updateInvitation(csrfToken, item.id, { status: item.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }), onSuccess: () => onNotice("邀请码状态已更新。"), onError: (value) => onNotice(errorMessage(value), true) });
  const deleteMutation = useMutation({ mutationFn: () => deleteInvitation(csrfToken, item.id), onSuccess: () => { setDeleteOpen(false); onNotice("邀请码已删除。"); }, onError: (value) => onNotice(errorMessage(value), true) });
  const copyCode = async () => {
    const copied = await copyText(item.code);
    onNotice(copied ? "邀请码已复制。" : "复制失败，请手动复制邀请码。", !copied);
  };
  return <TableRow className={exhausted ? "bg-surface-muted/70 text-ink-faint hover:bg-surface-muted/70" : undefined}><TableCell className="font-semibold"><div className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`选择邀请码 ${item.code}`} /><button type="button" className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" onClick={() => void copyCode()} title="复制邀请码" aria-label={`复制邀请码 ${item.code}`}><code className="font-mono text-sm">{item.code}</code><Copy size={14} className="text-ink-faint transition-colors group-hover:text-brand-700" /></button></div></TableCell><TableCell><StatusBadge tone={exhausted ? "neutral" : item.status === "ACTIVE" ? "success" : "danger"}>{exhausted ? "已用完" : item.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge></TableCell><TableCell className="text-slate-600">{item.max_uses !== null && item.max_uses !== undefined ? `${item.used_count}/${item.max_uses} 次` : `${item.used_count}/无限次`}</TableCell><TableCell className="text-slate-600">{item.expires_at ? formatDate(item.expires_at) : "永不过期"}</TableCell><TableCell className="text-slate-600">{formatDate(item.created_at)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-1.5">{!exhausted && <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate()} loading={toggleMutation.isPending}>{item.status === "ACTIVE" ? "停用" : "启用"}</Button>}<Button variant="icon" size="sm" onClick={() => setDeleteOpen(true)} title="删除邀请码" aria-label={`删除邀请码 ${item.code}`}><Trash2 size={15} className="text-rose-700" /></Button></div><ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="删除邀请码" description={`确定永久删除邀请码“${item.code}”吗？已记录的使用记录也会一并清理，此操作无法撤销。`} confirmLabel="永久删除" loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} /></TableCell></TableRow>;
}

export function AdminInvitationsPage({ authResponse }: { authResponse: AuthResponse }) {
  const invitationsQuery = useQuery({ queryKey: ["admin", "invitations"], queryFn: listInvitations });
  const [maxUses, setMaxUses] = useState("");
  const [validityDuration, setValidityDuration] = useState("");
  const [validityUnit, setValidityUnit] = useState<ValidityUnit>("DAYS");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const notify = (message: string, isError = false) => { setNotice({ message, tone: isError ? "danger" : "success" }); void invitationsQuery.refetch(); };
  useEffect(() => { if (!notice) return; const timeout = window.setTimeout(() => setNotice(null), 3500); return () => window.clearTimeout(timeout); }, [notice]);
  const mutation = useMutation({ mutationFn: () => createInvitation(authResponse.data.csrf_token, undefined, maxUses ? Number(maxUses) : undefined, expiresAtFromDuration(validityDuration, validityUnit)), onSuccess: (response) => { setMaxUses(""); setValidityDuration(""); setValidityUnit("DAYS"); notify(`邀请码已创建：${response.data.code}`); }, onError: (value) => notify(errorMessage(value), true) });
  const invitations = useMemo(() => invitationsQuery.data?.data.items ?? [], [invitationsQuery.data]);
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = invitations.length > 0 && invitations.every((item) => selectedIds.has(item.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(invitations.map((item) => item.id)));
  const selectedInvitations = invitations.filter((item) => selectedIds.has(item.id));
  const manageableInvitations = selectedInvitations.filter((item) => !invitationExhausted(item));
  const hasActiveSelection = manageableInvitations.some((item) => item.status === "ACTIVE");
  const hasDisabledSelection = manageableInvitations.some((item) => item.status !== "ACTIVE");
  const bulkStatusMutation = useMutation({ mutationFn: ({ ids, status }: { ids: string[]; status: "ACTIVE" | "DISABLED" }) => runBulk(ids.filter((id) => manageableInvitations.some((item) => item.id === id)), (id) => updateInvitation(authResponse.data.csrf_token, id, { status })), onSuccess: (result, variables) => { setSelectedIds(new Set(result.failures.map((item) => item.id))); const action = variables.status === "ACTIVE" ? "启用" : "停用"; notify(result.failures.length ? `已${action} ${result.successes.length} 个邀请码，${result.failures.length} 个处理失败。` : `已${action} ${result.successes.length} 个邀请码。`, result.failures.length > 0); void invitationsQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  const bulkDeleteMutation = useMutation({ mutationFn: (ids: string[]) => runBulk(ids, (id) => deleteInvitation(authResponse.data.csrf_token, id)), onSuccess: (result) => { setSelectedIds(new Set(result.failures.map((item) => item.id))); setBulkDeleteOpen(false); notify(result.failures.length ? `已删除 ${result.successes.length} 个邀请码，${result.failures.length} 个删除失败。` : `已删除 ${result.successes.length} 个邀请码。`, result.failures.length > 0); void invitationsQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => invitations.some((item) => item.id === id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [invitations]);
  return <div className="space-y-7"><PageHeader eyebrow="管理功能" title="邀请码管理" description="创建后请通过受控渠道交付邀请码。左侧边栏可切换管理模块。" />{notice && <Notice tone={notice.tone} className="fixed left-1/2 top-[4.5rem] z-[100] w-[min(90vw,380px)] -translate-x-1/2 animate-toast-drop-in shadow-overlay">{notice.message}</Notice>}<Panel title="创建注册入口" description="填写有效时长后，系统会从创建时刻开始计算过期时间；留空则永不过期。"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_0.8fr_auto] sm:items-end"><Input label="最大使用次数" type="number" min="1" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="无限次" /><Input label="有效时长" type="number" min="1" value={validityDuration} onChange={(event) => setValidityDuration(event.target.value)} placeholder="不填则永不过期" /><label className="block space-y-1.5"><span className="block text-sm font-semibold text-ink-muted">单位</span><select className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm text-ink shadow-hairline outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" value={validityUnit} onChange={(event) => setValidityUnit(event.target.value as ValidityUnit)}><option value="DAYS">天</option><option value="HOURS">小时</option></select></label><Button onClick={() => mutation.mutate()} loading={mutation.isPending}><RefreshCcw size={15} />生成邀请码</Button></div></Panel><Panel title="已有邀请码" description="创建后的使用上限和有效时长固定不变，可调整状态或删除邀请码。">{invitationsQuery.isPending ? <LoadingState label="正在加载邀请码" /> : invitationsQuery.isError ? <ErrorState message={errorMessage(invitationsQuery.error)} onRetry={() => void invitationsQuery.refetch()} /> : invitations.length ? <><div className="mb-3 flex h-14 items-center justify-between gap-3 overflow-x-auto rounded-control border border-outline/60 bg-surface-soft px-3 py-2"><span className="shrink-0 text-sm font-semibold text-ink-muted">{selectedIds.size > 0 ? `已选择 ${selectedIds.size} 个邀请码` : "勾选邀请码后可批量操作"}</span>{selectedIds.size > 0 && <div className="flex shrink-0 flex-nowrap items-center gap-2">{hasActiveSelection && <Button variant="secondary" size="sm" onClick={() => bulkStatusMutation.mutate({ ids: selectedInvitations.filter((item) => item.status === "ACTIVE").map((item) => item.id), status: "DISABLED" })} loading={bulkStatusMutation.isPending}>批量停用</Button>}{hasDisabledSelection && <Button variant="primary" size="sm" onClick={() => bulkStatusMutation.mutate({ ids: selectedInvitations.filter((item) => item.status !== "ACTIVE").map((item) => item.id), status: "ACTIVE" })} loading={bulkStatusMutation.isPending}>批量启用</Button>}<Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}><Trash2 size={14} />批量删除</Button></div>}</div><DataTable><TableHead><TableRow><TableCell asHeader><label className="flex items-center gap-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="全选邀请码" /><span>邀请码</span></label></TableCell><TableCell asHeader>状态</TableCell><TableCell asHeader>使用次数 / 上限</TableCell><TableCell asHeader>有效至</TableCell><TableCell asHeader>创建时间</TableCell><TableCell asHeader>操作</TableCell></TableRow></TableHead><TableBody>{invitations.map((item) => <InvitationRow key={item.id} item={item} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelected(item.id)} csrfToken={authResponse.data.csrf_token} onNotice={notify} />)}</TableBody></DataTable><ConfirmDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen} title="批量删除邀请码" description={`确定永久删除选中的 ${selectedIds.size} 个邀请码吗？已记录的使用记录也会一并清理，此操作无法撤销。`} confirmLabel="永久删除" loading={bulkDeleteMutation.isPending} onConfirm={() => bulkDeleteMutation.mutate([...selectedIds])} /></> : <EmptyState title="暂无邀请码" description="创建一个邀请码后，普通用户才可以注册。" />}</Panel></div>;
}

export function AdminAdminsPage({ authResponse }: { authResponse: AuthResponse }) {
  const adminsQuery = useQuery({ queryKey: ["admin", "admins"], queryFn: listAdmins });
  const admins = useMemo(() => adminsQuery.data?.data.items ?? [], [adminsQuery.data]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<"delete" | "reset" | null>(null);
  const [resetResults, setResetResults] = useState<Array<{ username: string; password: string }>>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const mutation = useMutation({ mutationFn: () => createAdmin(authResponse.data.csrf_token, username, password), onSuccess: (response) => { setUsername(""); setPassword(""); setNotice(`管理员 ${response.data.username} 已创建。`); setError(false); void adminsQuery.refetch(); }, onError: (value) => { setNotice(errorMessage(value)); setError(true); } });
  const notify = (message: string, isError = false) => { setNotice(message); setError(isError); };
  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => admins.some((item) => item.id === id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [admins]);
  const selectedAdmins = admins.filter((item) => selectedIds.has(item.id));
  const hasActiveSelection = selectedAdmins.some((item) => item.status === "ACTIVE");
  const hasDisabledSelection = selectedAdmins.some((item) => item.status !== "ACTIVE");
  const allSelected = admins.length > 0 && admins.every((item) => selectedIds.has(item.id));
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(admins.map((item) => item.id)));
  const bulkStatusMutation = useMutation({ mutationFn: ({ ids, status }: { ids: string[]; status: "ACTIVE" | "DISABLED" }) => runBulk(ids, (id) => setAdminStatus(authResponse.data.csrf_token, id, status)), onSuccess: (result, variables) => { setSelectedIds(new Set(result.failures.map((item) => item.id))); const action = variables.status === "ACTIVE" ? "启用" : "停用"; notify(result.failures.length ? `已${action} ${result.successes.length} 个管理员，${result.failures.length} 个处理失败。` : `已${action} ${result.successes.length} 个管理员。`, result.failures.length > 0); void adminsQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  const bulkDeleteMutation = useMutation({ mutationFn: (ids: string[]) => runBulk(ids, (id) => deleteAdmin(authResponse.data.csrf_token, id)), onSuccess: (result) => { setSelectedIds(new Set(result.failures.map((item) => item.id))); setBulkAction(null); notify(result.failures.length ? `已删除 ${result.successes.length} 个管理员，${result.failures.length} 个删除失败。` : `已删除 ${result.successes.length} 个管理员。`, result.failures.length > 0); void adminsQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  const bulkResetMutation = useMutation({ mutationFn: (ids: string[]) => runBulk(ids, (id) => resetAdminPassword(authResponse.data.csrf_token, id)), onSuccess: (result) => { setResetResults(result.successes.map(({ id, value }) => ({ username: admins.find((item) => item.id === id)?.username ?? id, password: value.data.temporary_password }))); setSelectedIds(new Set(result.failures.map((item) => item.id))); setBulkAction(null); if (result.failures.length) notify(`已重置 ${result.successes.length} 个管理员的密码，${result.failures.length} 个重置失败。`, true); void adminsQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  return <div className="space-y-7"><PageHeader eyebrow="管理功能" title="管理员管理" description="只有超级管理员可以创建、停用或删除普通管理员。管理员列表也支持多选批量操作。" />{notice && <Notice tone={error ? "danger" : "success"} className="fixed left-1/2 top-[4.5rem] z-[100] w-[min(90vw,420px)] -translate-x-1/2 animate-toast-drop-in shadow-overlay">{notice}</Notice>}<Panel title="创建普通管理员"><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><Input label="新管理员账号" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={32} /><Input label="初始密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} /><Button type="submit" loading={mutation.isPending}><Plus size={16} />创建管理员</Button></form></Panel><Panel title="普通管理员列表">{adminsQuery.isPending ? <LoadingState label="正在加载管理员" /> : adminsQuery.isError ? <ErrorState message={errorMessage(adminsQuery.error)} onRetry={() => void adminsQuery.refetch()} /> : admins.length ? <><div className="mb-3 flex h-14 flex-nowrap items-center justify-between gap-3 overflow-x-auto rounded-control border border-outline/60 bg-surface-soft px-3 py-2"><span className="shrink-0 text-sm font-semibold text-ink-muted">{selectedIds.size > 0 ? `已选择 ${selectedIds.size} 个管理员` : "勾选管理员后可批量操作"}</span>{selectedIds.size > 0 && <div className="flex shrink-0 flex-nowrap items-center gap-2">{hasActiveSelection && <Button variant="secondary" size="sm" onClick={() => bulkStatusMutation.mutate({ ids: selectedAdmins.filter((item) => item.status === "ACTIVE").map((item) => item.id), status: "DISABLED" })} loading={bulkStatusMutation.isPending}>批量停用</Button>}{hasDisabledSelection && <Button variant="primary" size="sm" onClick={() => bulkStatusMutation.mutate({ ids: selectedAdmins.filter((item) => item.status !== "ACTIVE").map((item) => item.id), status: "ACTIVE" })} loading={bulkStatusMutation.isPending}>批量启用</Button>}<Button variant="secondary" size="sm" onClick={() => setBulkAction("reset")}><KeyRound size={14} />批量重置密码</Button><Button variant="danger" size="sm" onClick={() => setBulkAction("delete")}><Trash2 size={14} />批量删除</Button></div>}</div><AccountsTable items={admins} kind="admin" csrfToken={authResponse.data.csrf_token} onNotice={notify} selectedIds={selectedIds} onToggleSelect={toggleSelected} onToggleAll={toggleAll} /><ConfirmDialog open={bulkAction === "reset"} onOpenChange={(open) => !open && setBulkAction(null)} title="批量重置管理员密码" description={`将为选中的 ${selectedIds.size} 个管理员分别生成一次性临时密码，并使其已有登录会话失效。`} confirmLabel="重置密码" loading={bulkResetMutation.isPending} onConfirm={() => bulkResetMutation.mutate([...selectedIds])} /><ConfirmDialog open={bulkAction === "delete"} onOpenChange={(open) => !open && setBulkAction(null)} title="批量删除管理员" description={`确定永久删除选中的 ${selectedIds.size} 个管理员吗？其登录会话将被清理，此操作无法撤销。`} confirmLabel="永久删除" loading={bulkDeleteMutation.isPending} onConfirm={() => bulkDeleteMutation.mutate([...selectedIds])} /></> : <EmptyState title="暂无普通管理员" />}</Panel><Dialog open={resetResults.length > 0} onOpenChange={(open) => !open && setResetResults([])}><DialogContent><DialogHeader><DialogTitle>管理员临时密码已生成</DialogTitle><DialogDescription>请立即复制并通过安全渠道交给对应管理员。关闭后这里不会继续保留。</DialogDescription></DialogHeader><div className="max-h-72 space-y-2 overflow-y-auto">{resetResults.map((item) => <div key={item.username} className="flex items-center justify-between gap-4 rounded-control border border-outline/60 bg-surface-soft px-3 py-2 text-sm"><strong className="min-w-0 truncate">{item.username}</strong><code className="select-all break-all text-right text-brand-800">{item.password}</code></div>)}</div><div className="mt-6 flex justify-end"><Button onClick={() => setResetResults([])}>我已保存</Button></div></DialogContent></Dialog></div>;
}
