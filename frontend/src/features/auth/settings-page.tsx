import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Download, Globe2, KeyRound, TriangleAlert, Trash2 } from "lucide-react";
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
import { businessDate, zonedDateTimeToISO } from "@/lib/date";
import { deviceTimezone, formatTimezoneOffset, isSupportedTimezone, timezoneLabel } from "@/lib/timezones";
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
  useEffect(() => {
    if (account.role !== "USER" && tab === "security") setTab("account");
  }, [account.role, tab]);

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

  return <div className="settings-page space-y-6">
    <PageHeader eyebrow="系统工具" title="设置" description={account.role === "USER" ? "管理当前账号、业务时区以及数据安全操作。" : "管理当前账号和业务时区。"} />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="设置视图"><TabsTrigger value="account">账号</TabsTrigger><TabsTrigger value="preferences">偏好</TabsTrigger>{account.role === "USER" && <TabsTrigger value="security">数据与安全</TabsTrigger>}</TabsList></Tabs>
    {tab === "account" && <div className="grid items-stretch gap-5 lg:grid-cols-[320px_1fr]">
      <Panel className="h-full" title="当前账号"><dl className="space-y-4 text-sm"><Info label="账号" value={account.username} /><Info label="角色" value={<StatusBadge tone="info">{roleLabels[account.role] ?? account.role}</StatusBadge>} /><Info label="状态" value={<StatusBadge tone={account.status === "ACTIVE" ? "success" : "warning"}>{statusLabels[account.status] ?? account.status}</StatusBadge>} /><Info label="创建时间" value={new Date(account.created_at).toLocaleDateString("zh-CN")} /></dl></Panel>
      <Panel className="h-full" title="修改密码" description="修改成功后，所有已有登录会话都会失效。"><form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); passwordMutation.mutate(); }}><input className="sr-only" name="username" value={account.username} readOnly autoComplete="username" tabIndex={-1} aria-label="账号" /><Input label="当前密码" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /><Input label="新密码" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" /><Button type="submit" loading={passwordMutation.isPending} disabled={!currentPassword || newPassword.length < 10}><KeyRound size={15} />{passwordMutation.isPending ? "处理中..." : "保存密码"}</Button></form></Panel>
    </div>}
    {tab === "preferences" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><Panel title="业务时区" description="业务日期使用账号的 IANA 时区，不随服务器时间变化。"><form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); if (isSupportedTimezone(timezone, account.timezone)) timezoneMutation.mutate(); }}><TimezoneSelect value={timezone} onChange={setTimezone} /><p className="text-sm text-slate-500">系统中的业务日期边界、日历、工作量、营业额、复盘、统计和团队月末快照均以该时区为准。</p><Button type="submit" loading={timezoneMutation.isPending} disabled={!isSupportedTimezone(timezone, account.timezone)}><Globe2 size={15} />保存时区</Button></form></Panel><BusinessTimePreview timezone={timezone} /></div>}
    {tab === "security" && account.role === "USER" && <div className="space-y-5">
      <Panel title="完整数据导出" description="前往导入 / 导出页下载当前账号的完整账户 ZIP；不包含密码、登录会话和审计日志。">{account.role === "USER" ? <Button asChild variant="secondary"><Link to="/app/data"><Download size={15} />打开数据导出</Link></Button> : <p className="text-sm text-slate-500">管理员账号不包含普通用户业务数据，也不提供业务数据导出。</p>}</Panel>
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-bold text-rose-900">危险操作</h2><p className="mt-1 text-sm leading-6 text-rose-700">将永久删除当前账号的在线业务数据、上传文件和登录会话，删除后无法通过系统恢复。历史备份中的副本可能按备份保留策略保存至到期，并在保留期结束后清理。</p><Button className="mt-5" variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={15} />永久删除账户</Button></section>
    </div>}
    <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="确认永久删除账户" description="将永久删除在线业务数据、上传文件和登录会话。历史备份中的副本仍按备份保留策略清理。" confirmLabel="永久删除" loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} />
  </div>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-slate-900">{value}</dd></div>;
}

function BusinessTimePreview({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const previewTimezone = isSupportedTimezone(timezone) ? timezone : "UTC";
  const currentDate = businessDate(previewTimezone, now);
  const nextDateValue = new Date(`${currentDate}T12:00:00Z`);
  nextDateValue.setUTCDate(nextDateValue.getUTCDate() + 1);
  const nextDate = nextDateValue.toISOString().slice(0, 10);
  const nextBoundary = new Date(zonedDateTimeToISO(`${nextDate}T00:00`, previewTimezone));
  const remainingSeconds = Math.max(0, Math.floor((nextBoundary.getTime() - now.getTime()) / 1000));
  const remainingHours = Math.floor(remainingSeconds / 3600);
  const remainingMinutes = Math.floor((remainingSeconds % 3600) / 60);
  const remaining = `${String(remainingHours).padStart(2, "0")}小时 ${String(remainingMinutes).padStart(2, "0")}分 ${String(remainingSeconds % 60).padStart(2, "0")}秒`;
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { timeZone: previewTimezone, year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("zh-CN", { timeZone: previewTimezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  const device = deviceTimezone();
  const deviceDiffers = device !== previewTimezone;

  return <Panel className="h-full" title="业务时间预览" description="预览当前选择的时区将如何定义系统中的业务日期。"><div className="rounded-panel border border-brand-200/70 bg-gradient-to-br from-brand-50 via-surface to-sky-50/70 p-5 shadow-card"><div className="flex items-center gap-2 text-sm font-semibold text-brand-800"><Clock3 size={17} /><span>{timezoneLabel(previewTimezone)} · {formatTimezoneOffset(previewTimezone, now)}</span></div><p className="mt-4 text-3xl font-black tracking-tight text-ink">{timeLabel}</p><p className="mt-1 text-sm font-semibold text-ink-muted">{dateLabel}</p><p className="mt-1 font-mono text-xs text-ink-faint">{previewTimezone}</p></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-card border border-outline/60 bg-surface-soft p-3"><div className="flex items-center gap-1.5 text-xs font-semibold text-ink-faint"><CalendarDays size={14} />业务日期</div><p className="mt-2 text-lg font-bold text-ink">{currentDate}</p></div><div className="rounded-card border border-outline/60 bg-surface-soft p-3"><p className="text-xs font-semibold text-ink-faint">距下一业务日</p><p className="mt-2 whitespace-nowrap text-sm font-bold tabular-nums text-ink">{remaining}</p></div></div>{deviceDiffers && <div className="mt-4 flex gap-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900"><TriangleAlert className="mt-0.5 shrink-0" size={15} /><p>当前设备时区为 {timezoneLabel(device)}（{formatTimezoneOffset(device, now)}），系统会继续按 {timezoneLabel(previewTimezone)} 计算业务日期。</p></div>}<div className="mt-4 rounded-card border border-outline/60 bg-surface-soft p-4"><p className="text-sm font-bold text-ink">会影响这些模块</p><div className="mt-3 flex flex-wrap gap-2">{["日历", "今日工作量", "营业额", "统计复盘", "团队快照"].map((item) => <span key={item} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted shadow-hairline">{item}</span>)}</div></div></Panel>;
}
