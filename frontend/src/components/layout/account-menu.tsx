import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  KeyRound,
  LogOut,
  Plus,
  Settings,
  UserMinus,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  addAccount,
  ApiError,
  switchAccount,
  unlinkAccount,
  type AuthResponse,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, errorMessage, roleLabel } from "@/lib/utils";

export function AccountMenu({
  authResponse,
  onLogout,
  loggingOut = false,
}: {
  authResponse: AuthResponse;
  onLogout: () => void;
  loggingOut?: boolean;
}) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [unlinkId, setUnlinkId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { account, accounts, csrf_token: csrfToken } = authResponse.data;
  const removeLinkedAccount = (accountId: string) => queryClient.setQueryData<AuthResponse>(["auth", "me"], (current) => current ? { ...current, data: { ...current.data, accounts: current.data.accounts.filter((item) => item.id !== accountId) } } : current);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const switchMutation = useMutation({
    mutationFn: (accountId: string) => switchAccount(csrfToken, accountId),
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: ["user"] });
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] === "user",
      });
      queryClient.setQueryData(["auth", "me"], response);
      setOpen(false);
      setError("");
    },
    onError: (value, accountId) => {
      if (value instanceof ApiError && (value.status === 401 || value.status === 403 || value.status === 404)) {
        removeLinkedAccount(accountId);
        void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        setError("该账号关联已失效，已从浏览器列表移除。");
        return;
      }
      setError(errorMessage(value));
    },
  });
  const addMutation = useMutation({
    mutationFn: () => addAccount(csrfToken, username, password),
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      setUsername("");
      setPassword("");
      setError("");
      setAddOpen(false);
      setOpen(false);
    },
    onError: (value) => setError(errorMessage(value)),
  });
  const unlinkMutation = useMutation({
    mutationFn: (accountId: string) => unlinkAccount(csrfToken, accountId),
    onSuccess: (_, accountId) => {
      removeLinkedAccount(accountId);
      setUnlinkId(null);
      setError("");
    },
    onError: (value, accountId) => {
      if (value instanceof ApiError && value.status === 404) {
        removeLinkedAccount(accountId);
        setUnlinkId(null);
        setError("");
        return;
      }
      if (value instanceof ApiError && (value.status === 401 || value.status === 403)) {
        void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      }
      setError(errorMessage(value));
    },
  });
  const unlinkAccountTarget = accounts.find((item) => item.id === unlinkId);

  return (
    <>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          className="flex min-h-10 items-center gap-2 rounded-control px-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={`账号菜单 ${account.username}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white shadow-brand-glow">
            {account.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-32 truncate text-sm font-semibold text-slate-900">
              {account.username}
            </span>
            <span className="block text-xs text-slate-500">
              {roleLabel(account.role)}
            </span>
          </span>
          <ChevronDown
            size={15}
            className={cn(
              "hidden text-slate-400 transition sm:block",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        {open && (
          <div
            role="menu"
            aria-label="账号操作"
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(88vw,320px)] overflow-hidden rounded-card border border-outline bg-surface shadow-overlay"
          >
            <div className="border-b border-outline px-4 py-3">
              <p className="truncate text-sm font-bold text-ink">
                {account.username}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {roleLabel(account.role)}
              </p>
            </div>
            <div className="p-2">
              <p className="px-2 py-1.5 text-xs font-semibold text-ink-faint">
                切换账号
              </p>
              <div className="space-y-1">
                {accounts.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-1 rounded-control hover:bg-surface-muted"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-label={`切换到${item.username}（${roleLabel(item.role)}）`}
                      className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-left text-sm text-ink-muted disabled:cursor-default"
                      disabled={item.active || switchMutation.isPending}
                      onClick={() => switchMutation.mutate(item.id)}
                    >
                      {item.active ? (
                        <Check size={15} className="shrink-0 text-brand-700" />
                      ) : (
                        <Users size={15} className="shrink-0 text-ink-faint" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.username}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none",
                          item.role === "SUPER_ADMIN"
                            ? "bg-violet-100 text-violet-800"
                            : item.role === "ADMIN"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-surface-muted text-ink-faint",
                        )}
                      >
                        {roleLabel(item.role)}
                      </span>
                      {item.active && (
                        <span className="shrink-0 text-xs text-brand-700">
                          当前
                        </span>
                      )}
                    </button>
                    {!item.active && (
                      <button
                        type="button"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-faint hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`解除浏览器关联 ${item.username}`}
                        onClick={() => setUnlinkId(item.id)}
                      >
                        <UserMinus size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                role="menuitem"
                className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-control px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                onClick={() => {
                  setError("");
                  setAddOpen(true);
                  setOpen(false);
                }}
              >
                <Plus size={15} />
                添加账号
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="mx-3 mb-2 rounded-control border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700"
              >
                {error}
              </p>
            )}
            <div className="border-t border-outline p-2">
              <Link
                role="menuitem"
                to="/app/settings"
                className="flex min-h-9 items-center gap-2 rounded-control px-2 text-sm text-ink-muted hover:bg-surface-muted"
                onClick={() => setOpen(false)}
              >
                <Settings size={15} />
                账号设置
              </Link>
              <button
                type="button"
                role="menuitem"
                className="flex min-h-9 w-full items-center gap-2 rounded-control px-2 text-sm text-rose-700 hover:bg-rose-50"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                disabled={loggingOut}
              >
                <LogOut size={15} />
                退出登录
              </button>
            </div>
          </div>
        )}
      </div>
      <Dialog
        open={addOpen}
        onOpenChange={(value) => {
          setAddOpen(value);
          if (!value) setError("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加浏览器账号</DialogTitle>
            <DialogDescription>
              验证账号后，它会加入当前浏览器的快捷切换列表，并保留对应的角色标识。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              addMutation.mutate();
            }}
          >
            <Input
              label="账号"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={32}
              autoComplete="username"
            />
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="current-password"
            />
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setAddOpen(false)}
              >
                取消
              </Button>
              <Button size="sm" type="submit" loading={addMutation.isPending}>
                <KeyRound size={15} />
                验证并加入
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(unlinkAccountTarget)}
        onOpenChange={(value) => {
          if (!value) setUnlinkId(null);
        }}
        title="解除浏览器关联"
        description={`确定解除账号“${unlinkAccountTarget?.username ?? ""}”在此浏览器中的关联吗？`}
        confirmLabel="解除关联"
        loading={unlinkMutation.isPending}
        onConfirm={() => {
          if (unlinkId) unlinkMutation.mutate(unlinkId);
        }}
      />
    </>
  );
}
