import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, UserMinus } from "lucide-react";
import { useState } from "react";
import { addAccount, switchAccount, unlinkAccount, type AuthResponse } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { errorMessage } from "@/lib/utils";

export function AccountSwitcher({ authResponse }: { authResponse: AuthResponse }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const accounts = authResponse.data.accounts ?? [];
  const csrfToken = authResponse.data.csrf_token;
  const addMutation = useMutation({
    mutationFn: () => addAccount(csrfToken, username, password),
    onSuccess: (response) => { queryClient.setQueryData(["auth", "me"], response); setOpen(false); setUsername(""); setPassword(""); setNotice("账号已加入当前浏览器"); setError(""); },
    onError: (value) => setError(errorMessage(value)),
  });
  const switchMutation = useMutation({
    mutationFn: (accountId: string) => switchAccount(csrfToken, accountId),
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: ["user"] });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "user" });
      queryClient.setQueryData(["auth", "me"], response);
      setNotice("已切换当前账号");
    },
    onError: (value) => setError(errorMessage(value)),
  });
  const unlinkMutation = useMutation({
    mutationFn: (accountId: string) => unlinkAccount(csrfToken, accountId),
    onSuccess: (_, accountId) => { queryClient.setQueryData<AuthResponse>(["auth", "me"], (current) => current ? { ...current, data: { ...current.data, accounts: current.data.accounts.filter((item) => item.id !== accountId) } } : current); setConfirmId(null); setNotice("浏览器账号关联已解除。"); },
    onError: (value) => setError(errorMessage(value)),
  });
  const confirmAccount = accounts.find((item) => item.id === confirmId);

  return <Panel title="浏览器账号" description="已验证的普通账号可以在此浏览器快速切换。切换时会清理旧账号的业务缓存。" action={<Button variant="secondary" size="sm" onClick={() => { setError(""); setOpen(true); }}><Plus size={15} />添加账号</Button>}>
    {(notice || error) && <p role={error ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2.5 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{accounts.map((item) => <div key={item.id} className={`flex items-center justify-between rounded-md border px-4 py-3 ${item.active ? "border-teal-300 bg-teal-50" : "border-slate-200"}`}><div><p className="font-semibold text-slate-900">{item.username}</p><p className="mt-1 text-xs text-slate-500">{item.active ? "当前使用" : "已验证"}</p></div>{!item.active && <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => switchMutation.mutate(item.id)} loading={switchMutation.isPending && switchMutation.variables === item.id}>切换</Button><Button variant="icon" size="sm" onClick={() => setConfirmId(item.id)} aria-label={`解除浏览器关联 ${item.username}`} title="解除浏览器关联"><UserMinus size={16} className="text-rose-700" /></Button></div>}</div>)}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>添加浏览器账号</DialogTitle><DialogDescription>验证普通账号后，它会加入当前浏览器的快捷切换列表。</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); addMutation.mutate(); }}><Input label="账号" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={32} autoComplete="username" /><Input label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="current-password" />{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-3"><Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>取消</Button><Button size="sm" type="submit" loading={addMutation.isPending}><KeyRound size={15} />验证并加入</Button></div></form></DialogContent></Dialog>
    <ConfirmDialog open={Boolean(confirmAccount)} onOpenChange={(value) => { if (!value) setConfirmId(null); }} title="解除浏览器关联" description={`确定解除账号“${confirmAccount?.username ?? ""}”在此浏览器中的关联吗？`} confirmLabel="解除关联" loading={unlinkMutation.isPending} onConfirm={() => { if (confirmId) unlinkMutation.mutate(confirmId); }} />
  </Panel>;
}
