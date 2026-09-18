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
    <div className="max-w-full overflow-x-auto rounded-[1.125rem] border border-outline/55 bg-surface shadow-[0_16px_34px_-28px_rgba(15,23,42,0.42)]">
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
    <thead className="border-b border-outline/45 bg-brand-50/35 text-xs font-bold text-ink-muted">
      {children}
    </thead>
  );
}
export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-outline/35">{children}</tbody>;
}
export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-brand-50/55">{children}</tr>;
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
