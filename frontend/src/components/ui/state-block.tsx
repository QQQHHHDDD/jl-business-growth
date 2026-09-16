import { AlertCircle, Inbox, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="min-h-40 rounded-md border border-slate-200 bg-white p-6"><span className="sr-only">{label}...</span><div className="space-y-4" aria-hidden="true"><div className="h-4 w-36 animate-pulse rounded bg-slate-200" /><div className="grid gap-3 sm:grid-cols-3"><div className="h-20 animate-pulse rounded bg-slate-100" /><div className="h-20 animate-pulse rounded bg-slate-100" /><div className="h-20 animate-pulse rounded bg-slate-100" /></div><div className="h-24 animate-pulse rounded bg-slate-100" /></div><p className="mt-4 text-sm text-slate-500">{label}...</p></div>;
}

export function EmptyState({ title = "暂无内容", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center"><Inbox className="text-slate-400" size={24} aria-hidden="true" /><h3 className="text-sm font-bold text-slate-800">{title}</h3>{description && <p className="max-w-md text-sm text-slate-500">{description}</p>}{action}</div>;
}

export function ErrorState({ message = "暂时无法加载内容", onRetry }: { message?: string; onRetry?: () => void }) {
  return <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-8 text-center"><AlertCircle className="text-rose-700" size={24} aria-hidden="true" /><p className="text-sm text-rose-800">{message}</p>{onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RefreshCcw size={15} />重试</Button>}</div>;
}
