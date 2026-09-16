import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe2, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Account, AuthResponse } from "@/api/client";
import { changePassword, deleteCurrentAccount, updateTimezone } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/utils";

export function SettingsPage({ account, authResponse }: { account: Account; authResponse: AuthResponse }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [timezone, setTimezone] = useState(account.timezone);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => setTimezone(account.timezone), [account.id, account.timezone]);
  const passwordMutation = useMutation({
    mutationFn: () => changePassword(authResponse.data.csrf_token, currentPassword, newPassword),
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setNotice("密码已修改，当前登录会话已失效，请重新登录。"); setError(""); queryClient.setQueryData(["auth", "me"], null); queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "user" || query.queryKey[0] === "admin" }); },
    onError: (value) => setError(errorMessage(value)),
  });
  const timezoneMutation = useMutation({
    mutationFn: () => updateTimezone(authResponse.data.csrf_token, timezone),
    onSuccess: (response) => { queryClient.setQueryData<AuthResponse>(["auth", "me"], (current) => current ? { ...current, data: { ...current.data, account: response.data } } : current); setNotice("时区已更新。"); setError(""); },
    onError: (value) => setError(errorMessage(value)),
  });
  const deleteMutation = useMutation({ mutationFn: () => deleteCurrentAccount(authResponse.data.csrf_token), onSuccess: () => { queryClient.setQueryData(["auth", "me"], null); queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "user" || query.queryKey[0] === "admin" }); navigate("/login", { replace: true }); }, onError: (value) => setError(errorMessage(value)) });
  return <div className="space-y-7"><PageHeader eyebrow="账号" title="账号设置" description="密码和时区只影响当前账号。" />{(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}<div className="grid gap-5 lg:grid-cols-2"><Panel title="修改密码" description="修改成功后，所有已有登录会话都会失效。"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); passwordMutation.mutate(); }}><input className="sr-only" name="username" value={account.username} readOnly autoComplete="username" tabIndex={-1} aria-label="账号" /><Input label="当前密码" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /><Input label="新密码" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" /><Button type="submit" loading={passwordMutation.isPending} disabled={!currentPassword || newPassword.length < 10}><KeyRound size={15} />{passwordMutation.isPending ? "处理中..." : "保存密码"}</Button></form></Panel><Panel title="用户时区" description="业务日期使用账号时区，不随服务器时间变化。"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); timezoneMutation.mutate(); }}><Input label="IANA 时区" value={timezone} onChange={(event) => setTimezone(event.target.value)} required maxLength={64} placeholder="Asia/Shanghai" /><Button type="submit" variant="secondary" loading={timezoneMutation.isPending}><Globe2 size={15} />保存时区</Button></form></Panel>{account.role !== "SUPER_ADMIN" && <Panel title="删除账户" description="此操作会永久删除当前账号的业务数据、上传文件和登录会话。"><Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={15} />永久删除账户</Button></Panel>}</div><ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="确认永久删除账户" description="账户、业务数据、上传文件和登录会话都会被删除，且无法恢复。" confirmLabel="永久删除" loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} /></div>;
}
