import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MetricTone = "brand" | "blue" | "purple" | "coral" | "amber" | "neutral";

const tones: Record<MetricTone, { card: string; icon: string }> = {
  brand: { card: "border-brand-100 bg-brand-50/70", icon: "bg-brand-100 text-brand-700" },
  blue: { card: "border-blue-100 bg-blue-50/70", icon: "bg-blue-100 text-blue-600" },
  purple: { card: "border-violet-100 bg-violet-50/70", icon: "bg-violet-100 text-violet-600" },
  coral: { card: "border-rose-100 bg-rose-50/70", icon: "bg-rose-100 text-rose-600" },
  amber: { card: "border-amber-100 bg-amber-50/70", icon: "bg-amber-100 text-amber-600" },
  neutral: { card: "border-outline bg-surface", icon: "bg-surface-muted text-ink-muted" },
};

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
  className,
  iconClassName,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  className?: string;
  iconClassName?: string;
  valueClassName?: string;
}) {
  return (
    <section className={cn("rounded-card border p-5 shadow-card", tones[tone].card, className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-control", tones[tone].icon, iconClassName)} aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-muted">{label}</p>
          <p className={cn("mt-1 text-3xl font-extrabold leading-none tracking-[-0.03em] text-ink", valueClassName)}>{value}</p>
          {detail && <p className="mt-2 text-xs leading-5 text-ink-faint">{detail}</p>}
        </div>
      </div>
    </section>
  );
}
