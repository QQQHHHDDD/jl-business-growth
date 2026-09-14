import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) { return <TabsPrimitive.List className={cn("inline-flex flex-wrap gap-1 rounded-md bg-slate-100 p-1", className)}>{children}</TabsPrimitive.List>; }
export function TabsTrigger({ children, value }: { children: ReactNode; value: string }) { return <TabsPrimitive.Trigger value={value} className="rounded px-3 py-2 text-sm font-semibold text-slate-600 transition data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-sm">{children}</TabsPrimitive.Trigger>; }
