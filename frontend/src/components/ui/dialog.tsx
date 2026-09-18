import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]" /><DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel border border-outline bg-white p-6 shadow-overlay focus:outline-none", className)}>{children}<DialogPrimitive.Close className="absolute right-4 top-4 rounded-control p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"><X size={17} /><span className="sr-only">关闭</span></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}

export function DialogHeader({ children }: { children: ReactNode }) { return <div className="mb-5 pr-7">{children}</div>; }
export function DialogTitle({ children }: { children: ReactNode }) { return <DialogPrimitive.Title className="text-lg font-bold text-ink">{children}</DialogPrimitive.Title>; }
export function DialogDescription({ children }: { children: ReactNode }) { return <DialogPrimitive.Description className="mt-1.5 text-sm leading-6 text-ink-muted">{children}</DialogPrimitive.Description>; }

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "确认", cancelLabel = "取消", loading = false, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel?: string; cancelLabel?: string; loading?: boolean; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div className="flex justify-end gap-3"><Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>{cancelLabel}</Button><Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>{confirmLabel}</Button></div></DialogContent></Dialog>;
}

export function PromptDialog({ open, onOpenChange, title, description, label, value, onValueChange, confirmLabel = "确认", loading = false, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; label: string; value: string; onValueChange: (value: string) => void; confirmLabel?: string; loading?: boolean; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><Input label={label} type="password" value={value} onChange={(event) => onValueChange(event.target.value)} minLength={10} maxLength={128} placeholder="留空由系统生成" autoComplete="new-password" /><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button><Button size="sm" onClick={onConfirm} loading={loading}> {confirmLabel}</Button></div></DialogContent></Dialog>;
}
