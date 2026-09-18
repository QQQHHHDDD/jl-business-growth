import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

const tones: Record<BadgeTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  neutral: "border-outline bg-surface-muted text-ink-muted",
  info: "border-brand-200 bg-brand-50 text-brand-800",
};

export function StatusBadge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-4", tones[tone], className)} {...props} />;
}
