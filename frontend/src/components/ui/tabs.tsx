import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) { return <TabsPrimitive.List className={cn("inline-flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-card border border-outline/60 bg-surface-muted/70 p-1.5 shadow-hairline", className)}>{children}</TabsPrimitive.List>; }
export function TabsTrigger({ children, value, className }: { children: ReactNode; value: string; className?: string }) { return <TabsPrimitive.Trigger value={value} className={cn("inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold text-ink-muted transition-[background-color,color,box-shadow] duration-[var(--motion-normal)] data-[state=active]:bg-brand-700 data-[state=active]:text-white data-[state=active]:shadow-brand-glow hover:bg-surface hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", className)}>{children}</TabsPrimitive.Trigger>; }
