import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, description, action, className }: { eyebrow?: string; title: string; description?: string; action?: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-4 border-b border-outline pb-6 sm:flex-row sm:items-end sm:justify-between", className)}><div className="min-w-0">{eyebrow && <p className="text-xs font-bold tracking-[0.08em] text-brand-700">{eyebrow}</p>}<h1 className="mt-1 text-[30px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>}</div>{action && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}</div>;
}
