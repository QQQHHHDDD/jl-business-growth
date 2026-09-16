import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-teal-700 text-white shadow-sm hover:bg-teal-600 hover:shadow-[0_1px_4px_rgba(13,148,136,0.35)]",
        secondary: "border border-slate-300 bg-white text-slate-800 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        danger: "bg-rose-700 text-white hover:bg-rose-800",
        icon: "text-slate-500 hover:bg-slate-100 hover:text-slate-950",
      },
      size: {
        sm: "min-h-8 px-3 py-1.5",
        md: "min-h-10 px-4 py-2.5",
        lg: "min-h-12 px-5 py-3",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot className={cn(buttonVariants({ variant, size }), className)} aria-busy={loading || undefined} {...props}>{children}</Slot>;
  }
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}
