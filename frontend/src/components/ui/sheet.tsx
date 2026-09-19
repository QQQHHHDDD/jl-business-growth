import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/42 backdrop-blur-[3px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-0 z-50 flex min-w-0 flex-col overflow-hidden border-outline/90 bg-[rgb(var(--color-surface))] shadow-overlay focus:outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(92vw,560px)] sm:border-l sm:border-outline",
          className,
        )}
      >
        <header className="shrink-0 border-b border-outline px-5 py-4 pr-16 sm:px-6 sm:py-5 sm:pr-16">
          <DialogPrimitive.Title className="text-lg font-bold text-ink">
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-1.5 text-sm leading-6 text-ink-muted">
              {description}
            </DialogPrimitive.Description>
          )}
        </header>
        <DialogPrimitive.Close className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-500">
          <X size={19} />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer && (
          <footer className="shrink-0 border-t border-outline bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            {footer}
          </footer>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
