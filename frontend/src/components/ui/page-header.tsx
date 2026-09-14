import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">{eyebrow}</p>}<h1 className="mt-1 text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action}</div>;
}
