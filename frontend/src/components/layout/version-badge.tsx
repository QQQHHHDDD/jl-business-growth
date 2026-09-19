import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Github,
  History,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import type { AuthResponse, ReleaseData, ReleaseResponse } from "@/api/client";
import {
  checkSystemRelease,
  getSystemRelease,
  rollbackSystemRelease,
  updateSystemRelease,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { appBuildTime, appCommit, appVersion } from "@/lib/version";
import { cn } from "@/lib/utils";

const releaseQueryKey = ["admin", "system", "release"] as const;
const runningStates = new Set([
  "queued",
  "downloading",
  "verifying",
  "backing_up",
  "migrating",
  "switching",
  "restarting",
  "health_check",
]);

const stateLabels: Record<string, string> = {
  queued: "准备更新",
  downloading: "下载 Release",
  verifying: "校验文件",
  backing_up: "数据库备份",
  migrating: "数据库迁移",
  switching: "切换版本",
  restarting: "重启服务",
  health_check: "健康检查",
  succeeded: "更新完成",
  failed: "更新失败",
};

export function VersionBadge({ authResponse }: { authResponse: AuthResponse }) {
  const [open, setOpen] = useState(false);
  const role = authResponse.data.account.role;

  if (role !== "SUPER_ADMIN") {
    return (
      <span
        data-testid="version-badge"
        data-build-commit={appCommit}
        data-build-time={appBuildTime}
        className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold leading-4 text-brand-700"
      >
        {appVersion}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="version-badge"
        data-build-commit={appCommit}
        data-build-time={appBuildTime}
        className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold leading-4 text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-label={`打开版本中心，当前版本 ${appVersion}`}
        onClick={() => setOpen(true)}
      >
        {appVersion}
      </button>
      <VersionCenter
        open={open}
        onOpenChange={setOpen}
        csrfToken={authResponse.data.csrf_token}
      />
    </>
  );
}

export function VersionCenter({
  open,
  onOpenChange,
  csrfToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csrfToken: string;
}) {
  const queryClient = useQueryClient();
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
  const releaseQuery = useQuery({
    queryKey: releaseQueryKey,
    queryFn: getSystemRelease,
    enabled: open,
    refetchInterval: (query) => {
      const state = query.state.data?.data.update_status?.state;
      return state && runningStates.has(state) ? 2500 : false;
    },
  });

  const storeResponse = (response: ReleaseResponse) => {
    queryClient.setQueryData(releaseQueryKey, response);
  };
  const checkMutation = useMutation({
    mutationFn: () => checkSystemRelease(csrfToken),
    onSuccess: storeResponse,
  });
  const updateMutation = useMutation({
    mutationFn: (version: string) => updateSystemRelease(csrfToken, version),
    onSuccess: (response) => {
      storeResponse(response);
      setConfirmUpdate(null);
    },
  });
  const rollbackMutation = useMutation({
    mutationFn: (version: string) => rollbackSystemRelease(csrfToken, version),
    onSuccess: (response) => {
      storeResponse(response);
      setConfirmRollback(null);
    },
  });

  const data = releaseQuery.data?.data;
  const status = data?.update_status;
  const running = Boolean(status && runningStates.has(status.state));
  const displayedVersion = status?.state === "succeeded" ? status.target_version : (data?.current_version ?? appVersion);
  const formalCurrentVersion = /^v[0-9]+\.[0-9]+\.[0-9]+$/.test(displayedVersion);
  const latest = data?.latest_release;
  const actionError = checkMutation.error || updateMutation.error || rollbackMutation.error;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[360px] overflow-hidden p-0 lg:left-[236px] lg:top-4 lg:w-[340px] lg:translate-x-0 lg:translate-y-0">
          <div className="flex items-center justify-between border-b border-outline/70 px-5 py-4 pr-14">
              <div>
                <DialogTitle>当前版本</DialogTitle>
                <DialogDescription>正式版本与更新状态</DialogDescription>
              </div>
              <Button
                variant="icon"
                size="sm"
                aria-label="检查最新版本"
                title="检查最新版本"
                disabled={checkMutation.isPending || running}
                onClick={() => checkMutation.mutate()}
              >
                <RefreshCw size={16} />
              </Button>
            </div>

          <div className="min-h-[168px] px-5 py-5 text-center">
            <div className="flex min-h-9 items-center justify-center gap-2">
              <span className="text-2xl font-black tracking-tight text-ink">{displayedVersion}</span>
              {data && formalCurrentVersion && !data.update_available && !data.check_error && !running && status?.state !== "failed" && (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700" aria-label="已是最新版本">
                  <Check size={13} strokeWidth={2.5} />
                </span>
              )}
            </div>

            <VersionState
              data={data}
              pending={releaseQuery.isPending}
              failed={releaseQuery.isError}
            />

            {data?.update_available && latest && data.update_enabled && !running && (
              <Button className="mt-4" size="sm" onClick={() => setConfirmUpdate(latest.version)}>
                更新到 {latest.version}
              </Button>
            )}
            {(data?.check_error || releaseQuery.isError) && (
              <Button className="mt-4" variant="secondary" size="sm" onClick={() => checkMutation.mutate()} loading={checkMutation.isPending}>
                重新检查
              </Button>
            )}
            {actionError && <p role="alert" className="mt-3 text-sm text-danger">操作失败，请稍后重试</p>}
          </div>

          <div className="border-t border-outline/70 px-5 py-3">
            {latest ? (
              <a
                href={latest.html_url}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-10 items-center gap-3 rounded-control px-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <Github size={17} aria-hidden="true" />
                <span className="flex-1 text-left">查看发布</span>
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            ) : (
              <div className="flex min-h-10 items-center gap-3 px-2 text-sm text-ink-faint">
                <Github size={17} aria-hidden="true" />
                暂无可查看的 Release
              </div>
            )}
            {latest?.published_at && <p className="px-2 pb-1 text-xs text-ink-faint">发布时间 {formatPublishedAt(latest.published_at)}</p>}
          </div>

          <div className="border-t border-outline/70 px-5 py-3">
            <button
              type="button"
              className="flex min-h-10 w-full items-center gap-3 rounded-control px-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-expanded={rollbackOpen}
              onClick={() => setRollbackOpen((value) => !value)}
            >
              <History size={17} aria-hidden="true" />
              <span className="flex-1 text-left">版本回退</span>
              <ChevronDown size={15} className={cn("transition-transform", rollbackOpen && "rotate-180")} aria-hidden="true" />
            </button>
            {rollbackOpen && (
              <div className="mt-2 space-y-2" aria-label="已安装版本">
                {(data?.installed_versions ?? []).map((item) => (
                  <div key={item.version} className="rounded-card border border-outline/70 bg-surface-muted/45 px-3 py-2.5 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-ink">{item.version}</span>
                      {item.current ? (
                        <span className="text-xs font-semibold text-brand-700">当前版本</span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!item.rollback_allowed || running}
                          onClick={() => setConfirmRollback(item.version)}
                        >
                          回退
                        </Button>
                      )}
                    </div>
                    {item.installed_at && <p className="mt-1 text-xs text-ink-faint">安装于 {formatPublishedAt(item.installed_at)}</p>}
                    {!item.current && !item.rollback_allowed && (
                      <p className="mt-1 text-xs leading-5 text-ink-faint">{item.rollback_blocked_reason ?? "当前数据库兼容性未确认，禁止自动回退"}</p>
                    )}
                  </div>
                ))}
                {!data?.installed_versions.length && <p className="px-2 py-3 text-sm text-ink-faint">暂无已安装版本信息</p>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmUpdate)}
        onOpenChange={(value) => !value && setConfirmUpdate(null)}
        title={`发现新版本 ${confirmUpdate ?? ""}`}
        description="更新过程中系统可能短暂不可访问。系统将先备份数据库，只执行向前 migration，再切换应用版本。"
        confirmLabel="确认更新"
        loading={updateMutation.isPending}
        onConfirm={() => confirmUpdate && updateMutation.mutate(confirmUpdate)}
      />
      <ConfirmDialog
        open={Boolean(confirmRollback)}
        onOpenChange={(value) => !value && setConfirmRollback(null)}
        title={`确定回退到 ${confirmRollback ?? ""}？`}
        description="将切换应用代码版本，不会执行数据库 down migration。服务会短暂重启。"
        confirmLabel="确认回退"
        loading={rollbackMutation.isPending}
        onConfirm={() => confirmRollback && rollbackMutation.mutate(confirmRollback)}
      />
    </>
  );
}

function VersionState({ data, pending, failed }: { data?: ReleaseData; pending: boolean; failed: boolean }) {
  const status = data?.update_status;
  if (status && (runningStates.has(status.state) || status.state === "succeeded" || status.state === "failed")) {
    return (
      <div className="mt-2 min-h-12 text-sm">
        <p className={cn("font-semibold", status.state === "failed" ? "text-danger" : "text-brand-800")}>{stateLabels[status.state] ?? status.safe_message}</p>
        <p className="mt-1 text-xs leading-5 text-ink-faint">{status.safe_message}</p>
      </div>
    );
  }
  if (pending) return <p className="mt-2 min-h-12 text-sm text-ink-muted">正在检查最新版本…</p>;
  if (failed || data?.check_error) return <p className="mt-2 min-h-12 text-sm text-ink-muted">无法检查最新版本</p>;
  if (data && !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(data.current_version)) {
    return <p className="mt-2 min-h-12 text-sm text-ink-muted">开发构建，不参与正式版本比较</p>;
  }
  if (data?.update_available && data.latest_release) {
    return (
      <div className="mt-2 min-h-12 text-sm text-ink-muted">
        <p>最新版本 {data.latest_release.version}</p>
        {!data.update_enabled && <p className="mt-1 font-semibold text-amber-700">当前服务器未启用在线更新</p>}
      </div>
    );
  }
  return <p className="mt-2 min-h-12 text-sm font-semibold text-brand-800">已是最新版本</p>;
}

function formatPublishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
