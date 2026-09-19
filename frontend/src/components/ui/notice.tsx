import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type NoticeTone = "success" | "info" | "warning" | "danger";

const toneStyles: Record<NoticeTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
};

const toneIcons = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  danger: AlertCircle,
};

export function Notice({ tone = "info", className, children, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: NoticeTone }) {
  const Icon = toneIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-card border px-4 py-3 text-sm leading-6 shadow-card", toneStyles[tone], className)} {...props}>
      <Icon className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
