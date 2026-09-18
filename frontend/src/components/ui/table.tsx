import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-card border border-outline bg-surface shadow-panel">
      <table
        className={cn(
          "w-full min-w-[760px] table-fixed text-left text-sm",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-outline bg-surface-soft text-xs font-bold text-ink-muted">
      {children}
    </thead>
  );
}
export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}
export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-brand-50">{children}</tr>;
}
export function TableCell({
  children,
  className,
  asHeader = false,
}: {
  children: ReactNode;
  className?: string;
  asHeader?: boolean;
}) {
  const Comp = asHeader ? "th" : "td";
  return (
    <Comp
      scope={asHeader ? "col" : undefined}
      className={cn("px-4 py-3 align-middle", className)}
    >
      {children}
    </Comp>
  );
}
