import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0">{eyebrow && <p className="text-xs font-bold tracking-[0.05em] text-teal-700">{eyebrow}</p>}<h1 className="mt-1 text-[28px] font-bold leading-[1.3] tracking-normal text-slate-950">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}</div>;
}
