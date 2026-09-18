import { AlertCircle, Inbox, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="min-h-[420px] rounded-card border border-outline bg-surface p-6 shadow-hairline"><span className="sr-only">{label}...</span><div className="space-y-4" aria-hidden="true"><div className="h-4 w-36 animate-pulse rounded-full bg-surface-muted" /><div className="grid gap-3 sm:grid-cols-3"><div className="h-20 animate-pulse rounded-card bg-surface-soft" /><div className="h-20 animate-pulse rounded-card bg-surface-soft" /><div className="h-20 animate-pulse rounded-card bg-surface-soft" /></div><div className="h-24 animate-pulse rounded-card bg-surface-soft" /></div><p className="mt-4 text-sm text-ink-muted">{label}...</p></div>;
}

export function PageLoadingState({
  eyebrow,
  title,
  description,
  label = "正在加载",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  label?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div
        role="status"
        aria-live="polite"
        className="min-h-[420px] rounded-panel border border-outline bg-surface p-6 shadow-panel"
      >
        <span className="sr-only">{label}...</span>
        <div className="space-y-5" aria-hidden="true">
          <div className="h-5 w-48 animate-pulse rounded-full bg-surface-muted" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-24 animate-pulse rounded-card bg-surface-soft" />
            <div className="h-24 animate-pulse rounded-card bg-surface-soft" />
            <div className="h-24 animate-pulse rounded-card bg-surface-soft" />
          </div>
          <div className="h-48 animate-pulse rounded-card bg-surface-soft" />
        </div>
        <p className="mt-5 text-sm text-ink-muted">{label}...</p>
      </div>
    </div>
  );
}

export function EmptyState({ title = "暂无内容", description, action, compact = false }: { title?: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-outline bg-surface-soft p-8 text-center shadow-hairline ${compact ? "min-h-40" : "min-h-[220px]"}`}><span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-700"><Inbox size={22} aria-hidden="true" /></span><h3 className="text-sm font-bold text-ink">{title}</h3>{description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}{action}</div>;
}

export function ErrorState({ message = "暂时无法加载内容", onRetry }: { message?: string; onRetry?: () => void }) {
  return <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-panel border border-rose-200 bg-rose-50 p-8 text-center"><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-rose-700"><AlertCircle size={22} aria-hidden="true" /></span><p className="text-sm text-rose-800">{message}</p>{onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RefreshCcw size={15} />重试</Button>}</div>;
}
