import { Activity, ArrowUpRight, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { HealthIndicator } from "@/components/layout/navigation";

export function AuthLayout({ health, children }: { health: { isPending: boolean; isSuccess: boolean }; children: ReactNode }) {
  return <div className="min-h-screen bg-slate-100 text-slate-950">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"><Link to="/" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-teal-700 text-sm font-black text-white">JL</span><span><span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">JL Growth</span><span className="block text-sm font-bold text-slate-950">生意成长管理系统</span></span></Link><HealthIndicator health={health} /></div></header>
    <main className="mx-auto grid min-h-[calc(100vh-72px)] max-w-6xl items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_420px] lg:gap-20 lg:py-16"><section className="max-w-xl"><div className="flex items-center gap-2 text-sm font-bold text-teal-800"><Activity size={17} />把今天经营清楚</div><h1 className="mt-5 text-4xl font-bold leading-tight tracking-normal sm:text-5xl">JL团队生意成长管理系统</h1><p className="mt-6 text-xl font-semibold leading-8 text-slate-800">让目标、行动与结果，在一个工作台里对齐。</p><p className="mt-3 text-base leading-7 text-slate-600">记录个人成长和经营过程，逐步建立属于你的长期工作节奏。</p><div className="mt-8 flex items-center gap-3 text-sm text-slate-500"><ShieldCheck size={17} className="text-teal-700" /><span>账号数据按用户严格隔离</span><ArrowUpRight size={15} aria-hidden="true" /></div></section>{children}</main>
  </div>;
}
