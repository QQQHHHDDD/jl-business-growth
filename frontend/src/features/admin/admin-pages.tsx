import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, RefreshCcw, ShieldCheck, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createAdmin, createInvitation, deleteAdmin, deleteUser, listAdmins, listInvitations, listUsers, resetAdminPassword, resetUserPassword, setAdminStatus, setUserStatus, updateInvitation, type Account, type AuthResponse, type Invitation } from "@/api/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog, PromptDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DataTable, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { errorMessage, formatDate, roleLabel } from "@/lib/utils";

function AdminTabs({ superAdmin }: { superAdmin?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = [{ path: "/admin/users", label: "用户", icon: Users }, { path: "/admin/invitations", label: "邀请码", icon: ShieldCheck }, ...(superAdmin ? [{ path: "/admin/admins", label: "管理员", icon: Users }] : [])];
  return <div role="tablist" aria-label="管理员工作台" className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1">{tabs.map(({ path, label, icon: Icon }) => <button key={path} type="button" role="tab" aria-selected={location.pathname === path} onClick={() => navigate(path)} className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${location.pathname === path ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:bg-white/70"}`}><Icon size={15} />{label}</button>)}</div>;
}

export function AdminHomePage({ account }: { account: Account }) {
  const superAdmin = account.role === "SUPER_ADMIN";
  return <div className="space-y-7"><PageHeader eyebrow="Administration" title="管理员工作台" description="管理账号和注册入口。管理员端不提供普通用户业务数据读取入口。" action={<AdminTabs superAdmin={superAdmin} />} /><div className="grid gap-4 md:grid-cols-3"><Link to="/admin/users" className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:shadow-md"><Users size={20} className="text-teal-700" /><h2 className="mt-4 font-bold">用户管理</h2><p className="mt-1 text-sm leading-6 text-slate-500">启停用、重置密码或删除普通用户。</p></Link><Link to="/admin/invitations" className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:shadow-md"><ShieldCheck size={20} className="text-teal-700" /><h2 className="mt-4 font-bold">邀请码</h2><p className="mt-1 text-sm leading-6 text-slate-500">控制普通用户注册入口和使用限制。</p></Link>{superAdmin && <Link to="/admin/admins" className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:shadow-md"><KeyRound size={20} className="text-teal-700" /><h2 className="mt-4 font-bold">管理员管理</h2><p className="mt-1 text-sm leading-6 text-slate-500">仅超级管理员可管理普通管理员账号。</p></Link>}</div><Panel title="当前权限" description="当前会话的权限范围"><div className="flex flex-wrap items-center gap-3"><StatusBadge tone="success">{roleLabel(account.role)}</StatusBadge><span className="text-sm text-slate-600">账号：{account.username}</span><span className="text-sm text-slate-500">时区：{account.timezone}</span></div></Panel></div>;
}

function ActionDialogs({ target, action, kind, csrfToken, onClose, onNotice }: { target: Account | null; action: "status" | "delete" | "reset" | null; kind: "user" | "admin"; csrfToken: string; onClose: () => void; onNotice: (message: string, error?: boolean) => void }) {
  const queryClient = useQueryClient();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const label = kind === "user" ? "用户" : "管理员";
  const statusMutation = useMutation({ mutationFn: () => kind === "user" ? setUserStatus(csrfToken, target!.id, target!.status === "ACTIVE" ? "DISABLED" : "ACTIVE") : setAdminStatus(csrfToken, target!.id, target!.status === "ACTIVE" ? "DISABLED" : "ACTIVE"), onSuccess: () => { onNotice(`${label}状态已更新。`); onClose(); void queryClient.invalidateQueries({ queryKey: ["admin", kind === "user" ? "users" : "admins"] }); }, onError: (value) => onNotice(errorMessage(value), true) });
  const deleteMutation = useMutation({ mutationFn: () => kind === "user" ? deleteUser(csrfToken, target!.id) : deleteAdmin(csrfToken, target!.id), onSuccess: () => { onNotice(`${label}已删除。`); onClose(); void queryClient.invalidateQueries({ queryKey: ["admin", kind === "user" ? "users" : "admins"] }); }, onError: (value) => onNotice(errorMessage(value), true) });
  const resetMutation = useMutation({ mutationFn: () => kind === "user" ? resetUserPassword(csrfToken, target!.id, temporaryPassword || undefined) : resetAdminPassword(csrfToken, target!.id, temporaryPassword || undefined), onSuccess: (response) => { onNotice(`${label}临时密码：${response.data.temporary_password}`); setTemporaryPassword(""); onClose(); }, onError: (value) => onNotice(errorMessage(value), true) });
  useEffect(() => { if (!target) setTemporaryPassword(""); }, [target]);
  if (!target) return null;
  return <><ConfirmDialog open={action === "status"} onOpenChange={(open) => !open && onClose()} title={`${target.status === "ACTIVE" ? "停用" : "恢复"}${label}`} description={target.status === "ACTIVE" ? `确定停用${label}“${target.username}”吗？其在线会话将立即失效。` : `确定恢复${label}“${target.username}”吗？`} confirmLabel={target.status === "ACTIVE" ? "确认停用" : "确认恢复"} loading={statusMutation.isPending} onConfirm={() => statusMutation.mutate()} /><ConfirmDialog open={action === "delete"} onOpenChange={(open) => !open && onClose()} title={`删除${label}`} description={`确定永久删除${label}“${target.username}”吗？在线数据和会话将被清理。此操作无法撤销。`} confirmLabel={`删除${label}`} loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} /><PromptDialog open={action === "reset"} onOpenChange={(open) => !open && onClose()} title={`重置${label}密码`} description={`为“${target.username}”设置一次性临时密码；留空则由系统生成。`} label="临时密码" value={temporaryPassword} onValueChange={setTemporaryPassword} confirmLabel="重置密码" loading={resetMutation.isPending} onConfirm={() => resetMutation.mutate()} /></>;
}

function AccountActions({ item, kind, csrfToken, onNotice }: { item: Account; kind: "user" | "admin"; csrfToken: string; onNotice: (message: string, error?: boolean) => void }) {
  const [action, setAction] = useState<"status" | "delete" | "reset" | null>(null);
  return <><div className="flex flex-wrap items-center gap-1.5"><Button variant="ghost" size="sm" onClick={() => setAction("status")}>{item.status === "ACTIVE" ? "停用" : "恢复"}</Button><Button variant="ghost" size="sm" onClick={() => setAction("reset")}>重置密码</Button><Button variant="icon" size="sm" onClick={() => setAction("delete")} title={`删除${kind === "user" ? "用户" : "管理员"}`} aria-label={`删除${kind === "user" ? "用户" : "管理员"} ${item.username}`}><Trash2 size={15} className="text-rose-700" /></Button></div><ActionDialogs target={action ? item : null} action={action} kind={kind} csrfToken={csrfToken} onClose={() => setAction(null)} onNotice={onNotice} /></>;
}

function AccountsTable({ items, kind, csrfToken, onNotice }: { items: Account[]; kind: "user" | "admin"; csrfToken: string; onNotice: (message: string, error?: boolean) => void }) {
  if (!items.length) return <EmptyState title={`暂无${kind === "user" ? "普通用户" : "普通管理员"}`} />;
  return <DataTable><TableHead><TableRow><TableCell asHeader>账号</TableCell><TableCell asHeader>状态</TableCell><TableCell asHeader>时区</TableCell><TableCell asHeader>创建时间</TableCell><TableCell asHeader>操作</TableCell></TableRow></TableHead><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell className="font-semibold">{item.username}</TableCell><TableCell><StatusBadge tone={item.status === "ACTIVE" ? "success" : "danger"}>{item.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge></TableCell><TableCell className="text-slate-600">{item.timezone}</TableCell><TableCell className="text-slate-600">{formatDate(item.created_at)}</TableCell><TableCell><AccountActions item={item} kind={kind} csrfToken={csrfToken} onNotice={onNotice} /></TableCell></TableRow>)}</TableBody></DataTable>;
}

export function AdminUsersPage({ authResponse }: { authResponse: AuthResponse }) {
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: () => listUsers() });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const notify = (message: string, isError = false) => { setNotice(message); setError(isError); };
  return <div className="space-y-7"><PageHeader eyebrow="Administration" title="用户管理" description="仅管理账号状态和认证信息，不读取普通用户业务数据。" action={<AdminTabs />} />{notice && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{notice}</p>}<Panel title="普通用户" description={`共 ${usersQuery.data?.meta.total ?? 0} 个账号。`}>{usersQuery.isPending ? <LoadingState label="正在加载用户" /> : usersQuery.isError ? <ErrorState message={errorMessage(usersQuery.error)} onRetry={() => void usersQuery.refetch()} /> : <AccountsTable items={usersQuery.data?.data.items ?? []} kind="user" csrfToken={authResponse.data.csrf_token} onNotice={notify} />}</Panel></div>;
}

function InvitationRow({ item, csrfToken, onNotice }: { item: Invitation; csrfToken: string; onNotice: (message: string, error?: boolean) => void }) {
  const [maxUses, setMaxUses] = useState(item.max_uses?.toString() ?? "");
  const [expiresAt, setExpiresAt] = useState(item.expires_at ? item.expires_at.slice(0, 16) : "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const updateMutation = useMutation({ mutationFn: () => updateInvitation(csrfToken, item.id, { maxUses: maxUses ? Number(maxUses) : null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, clearMaxUses: !maxUses, clearExpiresAt: !expiresAt }), onSuccess: () => onNotice("邀请码限制已更新。"), onError: (value) => onNotice(errorMessage(value), true) });
  const toggleMutation = useMutation({ mutationFn: () => updateInvitation(csrfToken, item.id, { status: item.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }), onSuccess: () => onNotice("邀请码状态已更新。"), onError: (value) => onNotice(errorMessage(value), true) });
  return <div className="rounded-md border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><code className="font-mono text-sm font-bold text-slate-900">{item.code}</code><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><StatusBadge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{item.status === "ACTIVE" ? "启用" : "停用"}</StatusBadge><span>已使用 {item.used_count} 次</span><span>{item.max_uses ? `上限 ${item.max_uses}` : "无限次"}</span><span>{item.expires_at ? formatDate(item.expires_at) : "永不过期"}</span></div></div><Button variant={item.status === "ACTIVE" ? "secondary" : "primary"} size="sm" onClick={() => item.status === "ACTIVE" ? setConfirmOpen(true) : toggleMutation.mutate()} loading={toggleMutation.isPending}>{item.status === "ACTIVE" ? "停用" : "启用"}</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Input label="使用上限" type="number" min="1" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="无限次" /><Input label="过期时间" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /><Button variant="secondary" size="sm" onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}><RefreshCcw size={14} />保存限制</Button></div><ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="停用邀请码" description={`确定停用邀请码“${item.code}”吗？`} confirmLabel="确认停用" loading={toggleMutation.isPending} onConfirm={() => toggleMutation.mutate()} /></div>;
}

export function AdminInvitationsPage({ authResponse }: { authResponse: AuthResponse }) {
  const invitationsQuery = useQuery({ queryKey: ["admin", "invitations"], queryFn: listInvitations });
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const notify = (message: string, isError = false) => { setNotice(message); setError(isError); void invitationsQuery.refetch(); };
  const mutation = useMutation({ mutationFn: () => createInvitation(authResponse.data.csrf_token, undefined, maxUses ? Number(maxUses) : undefined, expiresAt ? new Date(expiresAt).toISOString() : undefined), onSuccess: (response) => { setMaxUses(""); setExpiresAt(""); setNotice(`邀请码已创建：${response.data.code}`); setError(false); void invitationsQuery.refetch(); }, onError: (value) => notify(errorMessage(value), true) });
  const invitations = invitationsQuery.data?.data.items ?? [];
  return <div className="space-y-7"><PageHeader eyebrow="Administration" title="邀请码管理" description="创建后请通过受控渠道交付邀请码。" action={<AdminTabs />} />{notice && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{notice}</p>}<Panel title="创建注册入口" description="可设置使用次数和过期时间。"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Input label="最大使用次数" type="number" min="1" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="无限次" /><Input label="过期时间" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /><Button onClick={() => mutation.mutate()} loading={mutation.isPending}><RefreshCcw size={15} />生成邀请码</Button></div></Panel><Panel title="已有邀请码" description="邀请码状态和限制可以单独调整。">{invitationsQuery.isPending ? <LoadingState label="正在加载邀请码" /> : invitationsQuery.isError ? <ErrorState message={errorMessage(invitationsQuery.error)} onRetry={() => void invitationsQuery.refetch()} /> : invitations.length ? <div className="space-y-3">{invitations.map((item) => <InvitationRow key={item.id} item={item} csrfToken={authResponse.data.csrf_token} onNotice={notify} />)}</div> : <EmptyState title="暂无邀请码" description="创建一个邀请码后，普通用户才可以注册。" />}</Panel></div>;
}

export function AdminAdminsPage({ authResponse }: { authResponse: AuthResponse }) {
  const adminsQuery = useQuery({ queryKey: ["admin", "admins"], queryFn: listAdmins });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const mutation = useMutation({ mutationFn: () => createAdmin(authResponse.data.csrf_token, username, password), onSuccess: (response) => { setUsername(""); setPassword(""); setNotice(`管理员 ${response.data.username} 已创建。`); setError(false); void adminsQuery.refetch(); }, onError: (value) => { setNotice(errorMessage(value)); setError(true); } });
  const notify = (message: string, isError = false) => { setNotice(message); setError(isError); };
  return <div className="space-y-7"><PageHeader eyebrow="Administration" title="管理员管理" description="只有超级管理员可以创建、停用或删除普通管理员。" action={<AdminTabs superAdmin />} />{notice && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{notice}</p>}<Panel title="创建普通管理员"><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><Input label="新管理员账号" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={32} /><Input label="初始密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} /><Button type="submit" loading={mutation.isPending}><Plus size={16} />创建管理员</Button></form></Panel><Panel title="普通管理员列表">{adminsQuery.isPending ? <LoadingState label="正在加载管理员" /> : adminsQuery.isError ? <ErrorState message={errorMessage(adminsQuery.error)} onRetry={() => void adminsQuery.refetch()} /> : <AccountsTable items={adminsQuery.data?.data.items ?? []} kind="admin" csrfToken={authResponse.data.csrf_token} onNotice={notify} />}</Panel></div>;
}
