import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Globe2, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Account, AuthResponse } from "@/api/client";
import { changePassword, deleteCurrentAccount, updateTimezone } from "@/api/client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { isSupportedTimezone } from "@/lib/timezones";
import { errorMessage } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  USER: "普通用户",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
};
const statusLabels: Record<string, string> = {
  ACTIVE: "正常",
  DISABLED: "已禁用",
  DELETING: "删除中",
};

export function SettingsPage({ account, authResponse }: { account: Account; authResponse: AuthResponse }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [timezone, setTimezone] = useState(account.timezone);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => setTimezone(account.timezone), [account.id, account.timezone]);

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(authResponse.data.csrf_token, currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setNotice("密码已修改，当前登录会话已失效，请重新登录。");
      setError("");
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "user" || query.queryKey[0] === "admin" });
    },
    onError: (value) => setError(errorMessage(value)),
  });
  const timezoneMutation = useMutation({
    mutationFn: () => updateTimezone(authResponse.data.csrf_token, timezone),
    onSuccess: (response) => {
      queryClient.setQueryData<AuthResponse>(["auth", "me"], (current) => current ? { ...current, data: { ...current.data, account: response.data } } : current);
      setNotice("时区已更新。");
      setError("");
    },
    onError: (value) => setError(errorMessage(value)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCurrentAccount(authResponse.data.csrf_token),
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "user" || query.queryKey[0] === "admin" });
      navigate("/login", { replace: true });
    },
    onError: (value) => setError(errorMessage(value)),
  });

  return <div className="space-y-6">
    <PageHeader eyebrow="系统工具" title="设置" description="管理当前账号、业务时区以及数据安全操作。" />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="设置视图"><TabsTrigger value="account">账号</TabsTrigger><TabsTrigger value="preferences">偏好</TabsTrigger><TabsTrigger value="security">数据与安全</TabsTrigger></TabsList></Tabs>
    {tab === "account" && <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
      <Panel title="当前账号"><dl className="space-y-4 text-sm"><Info label="账号" value={account.username} /><Info label="角色" value={<StatusBadge tone="info">{roleLabels[account.role] ?? account.role}</StatusBadge>} /><Info label="状态" value={<StatusBadge tone={account.status === "ACTIVE" ? "success" : "warning"}>{statusLabels[account.status] ?? account.status}</StatusBadge>} /><Info label="创建时间" value={new Date(account.created_at).toLocaleDateString("zh-CN")} /></dl></Panel>
      <Panel title="修改密码" description="修改成功后，所有已有登录会话都会失效。"><form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); passwordMutation.mutate(); }}><input className="sr-only" name="username" value={account.username} readOnly autoComplete="username" tabIndex={-1} aria-label="账号" /><Input label="当前密码" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /><Input label="新密码" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" /><Button type="submit" loading={passwordMutation.isPending} disabled={!currentPassword || newPassword.length < 10}><KeyRound size={15} />{passwordMutation.isPending ? "处理中..." : "保存密码"}</Button></form></Panel>
    </div>}
    {tab === "preferences" && <Panel title="业务时区" description="业务日期使用账号的 IANA 时区，不随服务器时间变化。"><form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); if (isSupportedTimezone(timezone, account.timezone)) timezoneMutation.mutate(); }}><TimezoneSelect value={timezone} onChange={setTimezone} /><p className="text-sm text-slate-500">系统中的业务日期边界、日历、工作量、营业额、复盘、统计和团队月末快照均以该时区为准。</p><Button type="submit" loading={timezoneMutation.isPending} disabled={!isSupportedTimezone(timezone, account.timezone)}><Globe2 size={15} />保存时区</Button></form></Panel>}
    {tab === "security" && <div className="space-y-5">
      <Panel title="完整数据导出" description="前往导入 / 导出页下载当前账号的完整账户 ZIP；不包含密码、登录会话和审计日志。">{account.role === "USER" ? <Button asChild variant="secondary"><Link to="/app/data"><Download size={15} />打开数据导出</Link></Button> : <p className="text-sm text-slate-500">管理员账号不包含普通用户业务数据，也不提供业务数据导出。</p>}</Panel>
      {account.role !== "SUPER_ADMIN" && <section className="rounded-xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-bold text-rose-900">危险操作</h2><p className="mt-1 text-sm leading-6 text-rose-700">将永久删除当前账号的在线业务数据、上传文件和登录会话，删除后无法通过系统恢复。历史备份中的副本可能按备份保留策略保存至到期，并在保留期结束后清理。</p><Button className="mt-5" variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={15} />永久删除账户</Button></section>}
    </div>}
    <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="确认永久删除账户" description="将永久删除在线业务数据、上传文件和登录会话。历史备份中的副本仍按备份保留策略清理。" confirmLabel="永久删除" loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} />
  </div>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-slate-900">{value}</dd></div>;
}
