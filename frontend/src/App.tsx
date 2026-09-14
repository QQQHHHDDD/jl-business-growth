import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Globe2, KeyRound, LogIn, LogOut, Plus, RefreshCcw, ShieldCheck, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import {
  addAccount,
  changePassword,
  createAdmin,
  createInvitation,
  deleteAdmin,
  deleteUser,
  getLiveHealth,
  getMe,
  listAdmins,
  listInvitations,
  listUsers,
  login,
  logout,
  register,
  resetAdminPassword,
  resetUserPassword,
  setAdminStatus,
  setUserStatus,
  switchAccount,
  unlinkAccount,
  updateInvitation,
  updateTimezone,
  type Account,
  type AuthResponse,
  type Invitation,
} from "./api/client";

type AuthMode = "login" | "register";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

export function App() {
  const healthQuery = useQuery({
    queryKey: ["health", "live"],
    queryFn: getLiveHealth,
  });
  const meQuery = useQuery({ queryKey: ["auth", "me"], queryFn: getMe });
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [authError, setAuthError] = useState("");

  const authMutation = useMutation({
    mutationFn: () =>
      mode === "login" ? login(username, password) : register(username, password, invitationCode),
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: ["auth", "me"] });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      queryClient.setQueryData(["auth", "me"], response);
      setPassword("");
      setInvitationCode("");
      setAuthError("");
    },
    onError: (error) => setAuthError(errorMessage(error)),
  });

  const authResponse = meQuery.data ?? undefined;
  const account = authResponse?.data?.account;
  const healthLabel = healthQuery.isSuccess ? "API 可用" : "API 尚未连接";
  const healthTone = healthQuery.isSuccess ? "bg-emerald-500" : "bg-amber-500";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    authMutation.mutate();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">JL Growth</p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">JL团队生意成长管理系统</h1>
          </div>
          <div aria-live="polite" className="flex items-center gap-2 text-sm text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-full ${healthTone}`} aria-hidden="true" />
            <span>{healthLabel}</span>
          </div>
        </div>
      </header>

      {!account ? (
        <section className="mx-auto grid min-h-[calc(100vh-81px)] max-w-6xl items-start gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_420px] lg:items-center lg:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-teal-800">今日工作，从清晰开始</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              把目标、行动与经营结果放在同一条线上。
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              使用账号登录后管理个人成长数据。普通用户通过邀请码注册，管理员账号由系统管理员创建。
            </p>
          </div>
          <form onSubmit={handleSubmit} className="border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
              <div className="grid h-10 w-10 place-items-center bg-teal-50 text-teal-700" aria-hidden="true">
                {mode === "login" ? <LogIn size={19} /> : <UserPlus size={19} />}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{mode === "login" ? "登录系统" : "注册普通用户"}</h2>
                <p className="mt-1 text-sm text-slate-500">{mode === "login" ? "继续你的经营记录" : "需要有效的邀请码"}</p>
              </div>
            </div>
            <label className="mt-6 block text-sm font-medium text-slate-700">
              账号
              <input value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={32} autoComplete="username" className="mt-2 w-full border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
            </label>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              密码
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} className="mt-2 w-full border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
            </label>
            {mode === "register" && (
              <label className="mt-4 block text-sm font-medium text-slate-700">
                邀请码
                <input value={invitationCode} onChange={(event) => setInvitationCode(event.target.value)} required maxLength={64} className="mt-2 w-full border border-slate-300 px-3 py-2.5 uppercase outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
              </label>
            )}
            {authError && <p role="alert" className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{authError}</p>}
            <button type="submit" disabled={authMutation.isPending} className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-teal-700 px-4 py-3 font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
              {mode === "login" ? <LogIn size={17} /> : <UserPlus size={17} />}
              {authMutation.isPending ? "处理中..." : mode === "login" ? "登录" : "注册并登录"}
            </button>
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setAuthError(""); }} className="mt-4 w-full text-sm font-medium text-teal-800 hover:text-teal-950">
              {mode === "login" ? "首次使用？注册普通用户" : "已有账号？返回登录"}
            </button>
          </form>
        </section>
      ) : (
        <AuthenticatedApp account={account} authResponse={authResponse} />
      )}
    </main>
  );
}

function AuthenticatedApp({ account, authResponse }: { account: Account; authResponse: AuthResponse }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const csrfToken = authResponse.data.csrf_token;
  const accounts = authResponse.data.accounts ?? [];
  const isAdmin = account.role === "ADMIN" || account.role === "SUPER_ADMIN";
  const isSuperAdmin = account.role === "SUPER_ADMIN";

  async function clearAuthenticatedState() {
    await queryClient.cancelQueries({ queryKey: ["auth", "me"] });
    queryClient.setQueryData<AuthResponse | null>(["auth", "me"], null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "health" && query.queryKey[0] !== "auth" });
  }

  const logoutMutation = useMutation({
    mutationFn: () => logout(csrfToken),
    onSuccess: clearAuthenticatedState,
    onError: (error) => setNotice(errorMessage(error)),
  });
  const addMutation = useMutation({
    mutationFn: () => addAccount(csrfToken, newUsername, newPassword),
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      setShowAddAccount(false);
      setNewUsername("");
      setNewPassword("");
      setNotice("账号已加入当前浏览器");
    },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const switchMutation = useMutation({
    mutationFn: (accountId: string) => switchAccount(csrfToken, accountId),
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: ["auth", "me"] });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      queryClient.setQueryData(["auth", "me"], response);
    },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const unlinkMutation = useMutation({
    mutationFn: (accountId: string) => unlinkAccount(csrfToken, accountId),
    onSuccess: (_, accountId) => {
      queryClient.setQueryData<AuthResponse>(["auth", "me"], (current) => current ? {
        ...current,
        data: { ...current.data, accounts: current.data.accounts.filter((item) => item.id !== accountId) },
      } : current);
      setNotice("浏览器账号关联已解除。");
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  function updateAccount(accountUpdate: Account) {
    queryClient.setQueryData<AuthResponse>(["auth", "me"], (current) => current ? {
      ...current,
      data: { ...current.data, account: accountUpdate },
    } : current);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">当前账号</p>
          <h2 className="mt-1 text-3xl font-semibold">{account.username}</h2>
          <p className="mt-2 text-sm text-slate-600">{account.role === "USER" ? "普通用户" : account.role === "ADMIN" ? "普通管理员" : "超级管理员"} · {account.timezone}</p>
        </div>
        <button type="button" onClick={() => logoutMutation.mutate()} className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-500">
          <LogOut size={16} /> 退出登录
        </button>
      </div>

      {notice && <p role="status" className="mt-5 border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{notice}</p>}

      {account.role === "USER" && (
        <section className="mt-8 border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-semibold">浏览器账号</h3>
              <p className="mt-1 text-sm text-slate-500">已验证账号可在此浏览器快速切换，切换前会清理业务缓存。</p>
            </div>
            <button type="button" onClick={() => setShowAddAccount(!showAddAccount)} className="inline-flex items-center justify-center gap-2 border border-teal-700 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50"><Plus size={16} /> 添加账号</button>
          </div>
          {showAddAccount && <form onSubmit={(event) => { event.preventDefault(); addMutation.mutate(); }} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-medium text-slate-700">账号<input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} required className="mt-2 w-full border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} className="mt-2 w-full border border-slate-300 px-3 py-2" /></label>
            <button type="submit" disabled={addMutation.isPending} className="inline-flex items-center justify-center gap-2 bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"><KeyRound size={16} /> 验证并加入</button>
          </form>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {accounts.map((item) => <div key={item.id} className={`flex items-center justify-between border px-4 py-3 ${item.active ? "border-teal-300 bg-teal-50" : "border-slate-200"}`}>
              <div><p className="font-medium">{item.username}</p><p className="mt-1 text-xs text-slate-500">{item.active ? "当前使用" : "已验证"}</p></div>
              {!item.active && <div className="flex items-center gap-3"><button type="button" onClick={() => switchMutation.mutate(item.id)} className="text-sm font-medium text-teal-800 hover:text-teal-950">切换</button><button type="button" title="解除浏览器关联" aria-label={`解除浏览器关联 ${item.username}`} onClick={() => { if (window.confirm(`确定解除账号“${item.username}”在此浏览器中的关联吗？`)) unlinkMutation.mutate(item.id); }} className="text-rose-700 hover:text-rose-900"><UserMinus size={16} /></button></div>}
            </div>)}
          </div>
        </section>
      )}

      <SettingsPanel csrfToken={csrfToken} account={account} onAccountUpdated={updateAccount} onPasswordChanged={clearAuthenticatedState} />
      {isAdmin && <AdminPanel csrfToken={csrfToken} superAdmin={isSuperAdmin} />}
    </div>
  );
}

function SettingsPanel({ csrfToken, account, onAccountUpdated, onPasswordChanged }: { csrfToken: string; account: Account; onAccountUpdated: (account: Account) => void; onPasswordChanged: () => void | Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [timezone, setTimezone] = useState(account.timezone);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setTimezone(account.timezone), [account.id, account.timezone]);
  const passwordMutation = useMutation({
    mutationFn: () => changePassword(csrfToken, currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setNotice("密码已修改，当前登录会话已失效，请重新登录。");
      setError("");
      onPasswordChanged();
    },
    onError: (value) => setError(errorMessage(value)),
  });
  const timezoneMutation = useMutation({
    mutationFn: () => updateTimezone(csrfToken, timezone),
    onSuccess: (response) => {
      onAccountUpdated(response.data);
      setNotice("时区已更新。");
      setError("");
    },
    onError: (value) => setError(errorMessage(value)),
  });

  return <section className="mt-8 border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center gap-3 border-b border-slate-200 pb-4"><Globe2 size={19} className="text-teal-700" /><div><h3 className="text-lg font-semibold">账号设置</h3><p className="mt-1 text-sm text-slate-500">密码和时区只影响当前账号。</p></div></div>
    {(notice || error) && <p role={error ? "alert" : "status"} className={`mt-4 border px-3 py-2 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <div className="mt-5 grid gap-6 lg:grid-cols-2">
      <form onSubmit={(event) => { event.preventDefault(); passwordMutation.mutate(); }} className="border-t border-slate-100 pt-4">
        <h4 className="font-medium">修改密码</h4>
        <label className="mt-3 block text-sm font-medium text-slate-700">当前密码<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" className="mt-2 w-full border border-slate-300 px-3 py-2" /></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">新密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" className="mt-2 w-full border border-slate-300 px-3 py-2" /></label>
        <button type="submit" disabled={passwordMutation.isPending} className="mt-4 inline-flex items-center gap-2 bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"><KeyRound size={15} />{passwordMutation.isPending ? "处理中..." : "保存密码"}</button>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); timezoneMutation.mutate(); }} className="border-t border-slate-100 pt-4">
        <h4 className="font-medium">用户时区</h4>
        <label className="mt-3 block text-sm font-medium text-slate-700">IANA 时区<input value={timezone} onChange={(event) => setTimezone(event.target.value)} required maxLength={64} placeholder="Asia/Shanghai" className="mt-2 w-full border border-slate-300 px-3 py-2" /></label>
        <button type="submit" disabled={timezoneMutation.isPending} className="mt-4 inline-flex items-center gap-2 border border-teal-700 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-60"><Globe2 size={15} />{timezoneMutation.isPending ? "处理中..." : "保存时区"}</button>
      </form>
    </div>
  </section>;
}

function AdminPanel({ csrfToken, superAdmin }: { csrfToken: string; superAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"users" | "invitations" | "admins">("users");
  const [notice, setNotice] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: () => listUsers() });
  const adminsQuery = useQuery({ queryKey: ["admin", "admins"], queryFn: listAdmins, enabled: superAdmin });
  const invitationsQuery = useQuery({ queryKey: ["admin", "invitations"], queryFn: listInvitations });
  const refreshAccounts = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    if (superAdmin) void queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });
  };
  const createInvitationMutation = useMutation({
    mutationFn: () => createInvitation(csrfToken, undefined, inviteMaxUses ? Number(inviteMaxUses) : undefined, inviteExpiresAt ? new Date(inviteExpiresAt).toISOString() : undefined),
    onSuccess: (response) => {
      void invitationsQuery.refetch();
      setInviteMaxUses("");
      setInviteExpiresAt("");
      setNotice(`邀请码已创建：${response.data.code}`);
    },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const updateInvitationMutation = useMutation({
    mutationFn: ({ id, status, maxUses, expiresAt }: { id: string; status?: "ACTIVE" | "DISABLED"; maxUses?: number | null; expiresAt?: string | null }) => updateInvitation(csrfToken, id, {
      status,
      maxUses,
      expiresAt,
      clearMaxUses: maxUses === null,
      clearExpiresAt: expiresAt === null,
    }),
    onSuccess: () => { void invitationsQuery.refetch(); setNotice("邀请码限制已更新。"); },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const setUserStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "DISABLED" }) => setUserStatus(csrfToken, id, status),
    onSuccess: () => { refreshAccounts(); setNotice("用户状态已更新。"); },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const resetUserMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) => resetUserPassword(csrfToken, id, password),
    onSuccess: (response) => setNotice(`用户临时密码：${response.data.temporary_password}`),
    onError: (error) => setNotice(errorMessage(error)),
  });
  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => deleteUser(csrfToken, id),
    onSuccess: () => { refreshAccounts(); setNotice("用户已删除。"); },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const createAdminMutation = useMutation({
    mutationFn: () => createAdmin(csrfToken, adminUsername, adminPassword),
    onSuccess: (response) => {
      void adminsQuery.refetch();
      setAdminUsername("");
      setAdminPassword("");
      setNotice(`管理员 ${response.data.username} 已创建。`);
    },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const setAdminStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "DISABLED" }) => setAdminStatus(csrfToken, id, status),
    onSuccess: () => { void adminsQuery.refetch(); setNotice("管理员状态已更新。"); },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const resetAdminMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) => resetAdminPassword(csrfToken, id, password),
    onSuccess: (response) => setNotice(`管理员临时密码：${response.data.temporary_password}`),
    onError: (error) => setNotice(errorMessage(error)),
  });
  const deleteAdminMutation = useMutation({
    mutationFn: (id: string) => deleteAdmin(csrfToken, id),
    onSuccess: () => { void adminsQuery.refetch(); setNotice("管理员已删除。"); },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const users = usersQuery.data?.data.items ?? [];
  const admins = adminsQuery.data?.data.items ?? [];
  const invitations = invitationsQuery.data?.data.items ?? [];

  function confirmStatus(item: Account, kind: "user" | "admin") {
    const nextStatus = item.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const label = kind === "user" ? "用户" : "管理员";
    if (nextStatus === "DISABLED" && !window.confirm(`确定停用${label}“${item.username}”吗？其在线会话将立即失效。`)) return;
    if (kind === "user") setUserStatusMutation.mutate({ id: item.id, status: nextStatus });
    else setAdminStatusMutation.mutate({ id: item.id, status: nextStatus });
  }

  function reset(kind: "user" | "admin", item: Account) {
    const label = kind === "user" ? "用户" : "管理员";
    if (!window.confirm(`确定重置${label}“${item.username}”的密码吗？其所有在线会话将立即失效。`)) return;
    const suppliedPassword = window.prompt("可输入一次性临时密码；留空则由系统生成。", "");
    if (suppliedPassword === null) return;
    const password = suppliedPassword === "" ? undefined : suppliedPassword;
    if (kind === "user") resetUserMutation.mutate({ id: item.id, password });
    else resetAdminMutation.mutate({ id: item.id, password });
  }

  function remove(kind: "user" | "admin", item: Account) {
    const label = kind === "user" ? "用户" : "管理员";
    if (!window.confirm(`确定永久删除${label}“${item.username}”吗？在线数据和会话将被清理。`)) return;
    if (kind === "user") deleteUserMutation.mutate(item.id);
    else deleteAdminMutation.mutate(item.id);
  }

  return <section className="mt-8 border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Administration</p><h3 className="mt-1 text-xl font-semibold">管理员工作台</h3></div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="管理员工作台">
        <button type="button" role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")} className={`px-3 py-2 text-sm font-medium ${tab === "users" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Users className="mr-1 inline" size={15} />用户</button>
        <button type="button" role="tab" aria-selected={tab === "invitations"} onClick={() => setTab("invitations")} className={`px-3 py-2 text-sm font-medium ${tab === "invitations" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}><ShieldCheck className="mr-1 inline" size={15} />邀请码</button>
        {superAdmin && <button type="button" role="tab" aria-selected={tab === "admins"} onClick={() => setTab("admins")} className={`px-3 py-2 text-sm font-medium ${tab === "admins" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Users className="mr-1 inline" size={15} />管理员</button>}
      </div>
    </div>
    {notice && <p role="status" className="mx-5 mt-4 border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">{notice}</p>}
    {tab === "users" && <div className="overflow-x-auto p-5"><table className="w-full min-w-[860px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3 font-medium">账号</th><th className="px-3 py-3 font-medium">状态</th><th className="px-3 py-3 font-medium">时区</th><th className="px-3 py-3 font-medium">创建时间</th><th className="px-3 py-3 font-medium">操作</th></tr></thead><tbody>{users.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-3 py-3 font-medium">{item.username}</td><td className="px-3 py-3">{item.status === "ACTIVE" ? "启用" : "停用"}</td><td className="px-3 py-3 text-slate-600">{item.timezone}</td><td className="px-3 py-3 text-slate-600">{formatDate(item.created_at)}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => confirmStatus(item, "user")} className="text-teal-800 hover:text-teal-950">{item.status === "ACTIVE" ? "停用" : "恢复"}</button><button type="button" onClick={() => reset("user", item)} className="text-teal-800 hover:text-teal-950">重置密码</button><button type="button" onClick={() => remove("user", item)} title="删除用户" aria-label={`删除用户 ${item.username}`} className="text-rose-700 hover:text-rose-900"><Trash2 size={15} /></button></div></td></tr>)}{users.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">暂无普通用户</td></tr>}</tbody></table><p className="mt-4 text-xs text-slate-500">共 {usersQuery.data?.meta.total ?? 0} 个普通用户。管理员端不提供业务数据读取入口。</p></div>}
    {tab === "invitations" && <div className="p-5"><div className="border-b border-slate-200 pb-5"><div><p className="font-medium">注册入口控制</p><p className="mt-1 text-sm text-slate-500">创建后将显示一次邀请码，请通过受控渠道交付。</p></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-sm font-medium text-slate-700">最大使用次数<input type="number" min="1" value={inviteMaxUses} onChange={(event) => setInviteMaxUses(event.target.value)} placeholder="无限次" className="mt-2 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700">过期时间<input type="datetime-local" value={inviteExpiresAt} onChange={(event) => setInviteExpiresAt(event.target.value)} className="mt-2 w-full border border-slate-300 px-3 py-2" /></label><button type="button" onClick={() => createInvitationMutation.mutate()} disabled={createInvitationMutation.isPending} className="inline-flex items-center justify-center gap-2 bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"><RefreshCcw size={15} />生成邀请码</button></div></div><div className="mt-5 space-y-2">{invitations.map((item: Invitation) => <InvitationRow key={item.id} item={item} saving={updateInvitationMutation.isPending} onSave={(maxUses, expiresAt) => updateInvitationMutation.mutate({ id: item.id, maxUses, expiresAt })} onToggle={() => { const nextStatus = item.status === "ACTIVE" ? "DISABLED" : "ACTIVE"; if (nextStatus === "DISABLED" && !window.confirm(`确定停用邀请码“${item.code}”吗？`)) return; updateInvitationMutation.mutate({ id: item.id, status: nextStatus }); }} />)}{invitations.length === 0 && <p className="py-8 text-center text-sm text-slate-500">暂无邀请码</p>}</div></div>}
    {tab === "admins" && superAdmin && <div className="p-5"><form onSubmit={(event) => { event.preventDefault(); createAdminMutation.mutate(); }} className="grid gap-3 border-b border-slate-200 pb-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-sm font-medium text-slate-700">新管理员账号<input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} required maxLength={32} className="mt-2 w-full border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700">初始密码<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required minLength={10} maxLength={128} className="mt-2 w-full border border-slate-300 px-3 py-2" /></label><button type="submit" disabled={createAdminMutation.isPending} className="inline-flex items-center justify-center gap-2 bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"><Plus size={16} />创建管理员</button></form><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3 font-medium">账号</th><th className="px-3 py-3 font-medium">状态</th><th className="px-3 py-3 font-medium">时区</th><th className="px-3 py-3 font-medium">操作</th></tr></thead><tbody>{admins.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-3 py-3 font-medium">{item.username}</td><td className="px-3 py-3">{item.status === "ACTIVE" ? "启用" : "停用"}</td><td className="px-3 py-3 text-slate-600">{item.timezone}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => confirmStatus(item, "admin")} className="text-teal-800 hover:text-teal-950">{item.status === "ACTIVE" ? "停用" : "恢复"}</button><button type="button" onClick={() => reset("admin", item)} className="text-teal-800 hover:text-teal-950">重置密码</button><button type="button" onClick={() => remove("admin", item)} title="删除管理员" aria-label={`删除管理员 ${item.username}`} className="text-rose-700 hover:text-rose-900"><Trash2 size={15} /></button></div></td></tr>)}{admins.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">暂无普通管理员</td></tr>}</tbody></table></div></div>}
  </section>;
}

function InvitationRow({ item, saving, onSave, onToggle }: { item: Invitation; saving: boolean; onSave: (maxUses: number | null, expiresAt: string | null) => void; onToggle: () => void }) {
  const [maxUses, setMaxUses] = useState(item.max_uses?.toString() ?? "");
  const [expiresAt, setExpiresAt] = useState(item.expires_at ? item.expires_at.slice(0, 16) : "");
  useEffect(() => {
    setMaxUses(item.max_uses?.toString() ?? "");
    setExpiresAt(item.expires_at ? item.expires_at.slice(0, 16) : "");
  }, [item.expires_at, item.max_uses]);
  return <div className="border border-slate-200 px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><code className="font-mono text-sm">{item.code}</code><p className="mt-1 text-xs text-slate-500">{item.status === "ACTIVE" ? "启用" : "停用"} · 已使用 {item.used_count} 次 · {item.max_uses ? `上限 ${item.max_uses}` : "无限次"}{item.expires_at ? ` · ${formatDate(item.expires_at)}` : " · 永不过期"}</p></div><button type="button" onClick={onToggle} className={`text-sm font-medium ${item.status === "ACTIVE" ? "text-rose-700 hover:text-rose-900" : "text-teal-800 hover:text-teal-950"}`}>{item.status === "ACTIVE" ? "停用" : "启用"}</button></div><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-xs font-medium text-slate-600">调整使用上限<input type="number" min="1" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="无限次" className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-slate-600">调整过期时间<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" /></label><button type="button" disabled={saving} onClick={() => onSave(maxUses ? Number(maxUses) : null, expiresAt ? new Date(expiresAt).toISOString() : null)} className="inline-flex items-center justify-center gap-2 border border-teal-700 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-60"><RefreshCcw size={14} />保存限制</button></div></div>;
}
