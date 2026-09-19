import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-normal)] ease-[var(--motion-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "border border-brand-700/80 bg-brand-700 text-white shadow-brand-glow hover:border-brand-600 hover:bg-brand-600 hover:shadow-card-hover",
        secondary: "border border-outline/90 bg-surface text-ink shadow-hairline hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 hover:shadow-card",
        ghost: "text-ink-muted hover:bg-surface-muted/75 hover:text-ink",
        danger: "border border-rose-700/80 bg-rose-700 text-white shadow-sm hover:border-rose-800 hover:bg-rose-800 hover:shadow-card",
        icon: "text-ink-muted hover:bg-surface-muted/75 hover:text-ink",
      },
      size: {
        sm: "min-h-9 px-3 py-1.5",
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
