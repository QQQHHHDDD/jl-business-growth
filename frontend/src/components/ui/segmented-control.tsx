import { cn } from "@/lib/utils";

export type SegmentedControlItem<Value extends string> = {
  value: Value;
  label: string;
  disabled?: boolean;
};

export function SegmentedControl<Value extends string>({
  value,
  items,
  onValueChange,
  ariaLabel,
  className,
  variant = "surface",
  buttonClassName,
}: {
  value: Value;
  items: readonly SegmentedControlItem<Value>[];
  onValueChange: (value: Value) => void;
  ariaLabel: string;
  className?: string;
  variant?: "surface" | "brand";
  buttonClassName?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-control bg-surface-muted p-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            disabled={item.disabled}
            aria-pressed={active}
            className={cn(
              "min-h-8 shrink-0 rounded-lg px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? variant === "brand"
                  ? "bg-brand-700 text-white shadow-brand-glow"
                  : "bg-surface text-brand-800 shadow-hairline"
                : "text-ink-muted hover:bg-surface/70 hover:text-ink",
              buttonClassName,
            )}
            onClick={() => onValueChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
