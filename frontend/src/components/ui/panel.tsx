import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, description, action, children, className }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-panel border border-outline bg-surface shadow-panel", className)}>
      {(title || description || action) && <header className="flex min-w-0 flex-col gap-3 border-b border-outline px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">{title && <h2 className="text-base font-bold text-ink">{title}</h2>}{description && <p className="mt-1 text-sm leading-6 text-ink-faint">{description}</p>}</div>
        {action && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </header>}
      <div className="p-5">{children}</div>
    </section>
  );
}
