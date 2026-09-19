import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  description?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ id, label, description, error, icon, className, inputMode, type, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? `input-${generatedId}`;
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={inputId} className="block text-sm font-semibold text-ink-muted">{label}</label>}
      <div className="relative">
        {icon && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">{icon}</span>}
        <input
          id={inputId}
          type={type}
          inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)}
          className={cn("min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm text-ink shadow-hairline outline-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-normal)] placeholder:text-ink-faint focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:bg-surface-muted", icon && "pl-10", error && "border-rose-400 focus:border-rose-600 focus:ring-rose-100", className)}
          aria-invalid={Boolean(error)}
          aria-describedby={description || error ? `${inputId}-hint` : undefined}
          {...props}
          ref={ref}
        />
      </div>
      {(description || error) && <p id={`${inputId}-hint`} className={cn("text-xs", error ? "text-rose-700" : "text-ink-faint")}>{error ?? description}</p>}
    </div>
  );
});
