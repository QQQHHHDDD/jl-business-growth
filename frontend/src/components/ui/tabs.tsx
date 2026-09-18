import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) { return <TabsPrimitive.List className={cn("inline-flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-control bg-surface-muted p-1 shadow-hairline", className)}>{children}</TabsPrimitive.List>; }
export function TabsTrigger({ children, value }: { children: ReactNode; value: string }) { return <TabsPrimitive.Trigger value={value} className="shrink-0 rounded-[0.625rem] px-3 py-2 text-sm font-semibold text-ink-muted transition-[background-color,color,box-shadow] duration-[var(--motion-normal)] data-[state=active]:bg-surface data-[state=active]:text-brand-800 data-[state=active]:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{children}</TabsPrimitive.Trigger>; }
