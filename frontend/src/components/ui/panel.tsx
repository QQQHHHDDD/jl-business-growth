import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, description, action, children, className }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {(title || description || action) && <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>{title && <h2 className="text-base font-bold text-slate-950">{title}</h2>}{description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}</div>
        {action}
      </header>}
      <div className="p-5">{children}</div>
    </section>
  );
}
