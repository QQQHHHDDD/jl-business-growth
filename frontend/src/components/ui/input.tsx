import { forwardRef, type InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ id, label, description, error, className, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? `input-${generatedId}`;
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700">{label}</label>}
      <input
        id={inputId}
        className={cn("min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100", error && "border-rose-400 focus:border-rose-600 focus:ring-rose-100", className)}
        aria-invalid={Boolean(error)}
        aria-describedby={description || error ? `${inputId}-hint` : undefined}
        {...props}
        ref={ref}
      />
      {(description || error) && <p id={`${inputId}-hint`} className={cn("text-xs", error ? "text-rose-700" : "text-slate-500")}>{error ?? description}</p>}
    </div>
  );
});
