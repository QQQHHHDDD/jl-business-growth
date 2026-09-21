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
    <div className="max-w-full overflow-x-auto rounded-[1.125rem] border border-outline/70 bg-surface shadow-card">
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
    <thead className="border-b border-outline/55 bg-brand-50/45 text-xs font-bold text-ink-muted">
      {children}
    </thead>
  );
}
export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-outline/30">{children}</tbody>;
}
export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-brand-50/55", className)}>{children}</tr>;
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
