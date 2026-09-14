import { ArrowRight, CalendarDays, FileText, Goal, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Account, AuthResponse } from "@/api/client";
import { AccountSwitcher } from "@/features/dashboard/account-switcher";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/state-block";
import { roleLabel } from "@/lib/utils";

const quickLinks = [
  { href: "/app/goals", title: "梦想与目标", description: "从清晰的方向开始", icon: Goal },
  { href: "/app/calendar", title: "日历", description: "安排下一步行动", icon: CalendarDays },
  { href: "/app/worklog", title: "今日工作", description: "记录今天的关键投入", icon: FileText },
];

export function DashboardPage({ account, authResponse }: { account: Account; authResponse: AuthResponse }) {
  return <div className="space-y-7"><PageHeader eyebrow="Workspace" title={account.username} description={`你好，${account.username}。这是你的个人工作台，先从今天最重要的一步开始。`} action={<Button asChild variant="secondary"><Link to="/app/settings"><Settings2 size={16} />账号设置</Link></Button>} /><div className="grid gap-4 sm:grid-cols-3"><Panel title="当前账号"><p className="text-xl font-bold text-slate-950">{account.username}</p><p className="mt-1 text-sm text-slate-500">{roleLabel(account.role)}</p></Panel><Panel title="所在时区"><p className="text-xl font-bold text-slate-950">{account.timezone}</p><p className="mt-1 text-sm text-slate-500">业务日期按账号时区记录</p></Panel><Panel title="账号状态"><p className="text-xl font-bold text-emerald-700">正常</p><p className="mt-1 text-sm text-slate-500">当前会话已建立</p></Panel></div><section><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-950">快速入口</h2><span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Next steps</span></div><div className="grid gap-3 md:grid-cols-3">{quickLinks.map(({ href, title, description, icon: Icon }) => <Link key={href} to={href} className="group rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-md bg-teal-50 text-teal-700"><Icon size={18} /></span><ArrowRight size={17} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-teal-700" /></div><h3 className="mt-5 font-bold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></Link>)}</div></section><Panel title="经营记录" description="后续阶段会在这里汇总真实业务数据。当前不展示虚构的指标。"><EmptyState title="还没有可展示的经营数据" description="每日工作量、营业额、目标进度和统计图表将在对应 Phase 实现后接入。" /></Panel><AccountSwitcher authResponse={authResponse} /></div>;
}
