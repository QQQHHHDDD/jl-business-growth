import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Database,
  FileText,
  Goal,
  Home,
  LineChart,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { Account, HealthResponse } from "@/api/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { cn, roleLabel } from "@/lib/utils";

type NavigationItem = { href: string; label: string; icon: typeof Home };

const userItems: NavigationItem[] = [
  { href: "/app", label: "首页", icon: Home },
  { href: "/app/goals", label: "梦想与目标", icon: Goal },
  { href: "/app/calendar", label: "日历", icon: CalendarDays },
  { href: "/app/worklog", label: "今日工作", icon: FileText },
  { href: "/app/turnover", label: "营业额", icon: CircleDollarSign },
  { href: "/app/team", label: "团队", icon: Users },
  { href: "/app/knowledge", label: "学习中心", icon: BookOpen },
  { href: "/app/finance", label: "财务", icon: WalletCards },
  { href: "/app/income-simulator", label: "收入模拟", icon: LineChart },
  { href: "/app/reviews", label: "复盘", icon: Sparkles },
  { href: "/app/analytics", label: "数据统计", icon: BarChart3 },
  { href: "/app/search", label: "全局搜索", icon: Search },
  { href: "/app/data", label: "导入 / 导出", icon: Database },
  { href: "/app/settings", label: "设置", icon: Settings },
];

const adminItems: NavigationItem[] = [
  { href: "/admin", label: "管理首页", icon: Home },
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/invitations", label: "邀请码", icon: ShieldCheck },
];

const adminManagementItem: NavigationItem = { href: "/admin/admins", label: "管理员管理", icon: ShieldCheck };
const settingsItem: NavigationItem = { href: "/app/settings", label: "设置", icon: Settings };

function isActive(pathname: string, href: string) {
  return href === "/app" || href === "/admin" ? pathname === href : pathname.startsWith(href);
}

function NavItem({ item, mobile = false, onNavigate }: { item: NavigationItem; mobile?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return <NavLink to={item.href} onClick={onNavigate} className={({ isActive: active }) => cn("group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors", active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950", mobile && "justify-center px-2 py-2 text-[11px]")} end={item.href === "/app" || item.href === "/admin"}>
    <Icon size={mobile ? 18 : 17} strokeWidth={1.8} aria-hidden="true" />
    <span>{item.label}</span>
  </NavLink>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className={cn("flex items-center gap-3", compact && "justify-center")} aria-label="返回系统首页">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-700 text-sm font-black text-white">JL</span>
    {!compact && <span><span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">JL Growth</span><span className="mt-0.5 block text-sm font-bold text-slate-950">生意成长管理系统</span></span>}
  </Link>;
}

function AccountSummary({ account }: { account: Account }) {
  return <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{account.username.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">{account.username}</span><span className="block truncate text-xs text-slate-500">{roleLabel(account.role)}</span></span></div>;
}

export function HealthIndicator({ health }: { health: { isPending: boolean; isSuccess: boolean; data?: HealthResponse } }) {
  const tone = health.isPending ? "warning" : health.isSuccess ? "success" : "danger";
  const label = health.isPending ? "检测 API" : health.isSuccess ? "API 可用" : "API 未连接";
  return <div aria-live="polite" className="flex items-center gap-2"><StatusBadge tone={tone}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{label}</StatusBadge></div>;
}

export function AppShell({ account, health, admin = false, onLogout, loggingOut = false, children }: { account: Account; health: { isPending: boolean; isSuccess: boolean; data?: HealthResponse }; admin?: boolean; onLogout: () => void; loggingOut?: boolean; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const items = admin ? [...adminItems, ...(account.role === "SUPER_ADMIN" ? [adminManagementItem] : []), settingsItem] : userItems;
  const mobileItems = admin
    ? [...adminItems.slice(0, 3), ...(account.role === "SUPER_ADMIN" ? [adminManagementItem] : []), settingsItem]
    : [userItems[0], userItems[3], userItems[2], userItems[userItems.length - 1]];
  const currentItem = items.find((item) => isActive(location.pathname, item.href));

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return <div className="min-h-screen bg-slate-100 text-slate-950">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="border-b border-slate-200 px-5 py-5"><Brand /></div>
      <div className="flex-1 overflow-y-auto px-4 py-5"><p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{admin ? "Administration" : "Workspace"}</p><nav className="space-y-1" aria-label={admin ? "管理员导航" : "用户导航"}>{items.map((item) => <NavItem key={item.href} item={item} />)}</nav></div>
      <div className="border-t border-slate-200 p-4"><AccountSummary account={account} /></div>
    </aside>

    {drawerOpen && <div data-testid="navigation-overlay" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" aria-hidden="true" onClick={closeDrawer} />}
    {drawerOpen && <div className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col bg-white shadow-2xl lg:hidden" role="dialog" aria-modal="true" aria-label="应用导航">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5"><Brand /><Button variant="icon" size="sm" onClick={closeDrawer} aria-label="关闭导航"><X size={19} /></Button></div>
      <div className="flex-1 overflow-y-auto px-4 py-5"><p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{admin ? "Administration" : "Workspace"}</p><nav className="space-y-1" aria-label={admin ? "管理员导航" : "用户导航"}>{items.map((item) => <NavItem key={item.href} item={item} onNavigate={closeDrawer} />)}</nav></div>
      <div className="border-t border-slate-200 p-4"><AccountSummary account={account} /></div>
    </div>}

    <div className="lg:pl-[248px]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10"><div className="flex min-w-0 items-center gap-3"><Button variant="icon" size="sm" className="lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="打开导航"><Menu size={20} /></Button><div className="min-w-0"><p className="truncate text-xs font-bold uppercase tracking-[0.13em] text-teal-700">{admin ? "管理员工作台" : "个人工作台"}</p><p className="mt-0.5 truncate text-base font-bold text-slate-950">{currentItem?.label ?? "工作空间"}</p></div></div><div className="flex items-center gap-3"><HealthIndicator health={health} /><div className="hidden sm:block"><AccountSummary account={account} /></div><Button variant="icon" size="sm" onClick={onLogout} loading={loggingOut} className="sm:hidden" aria-label="退出登录" title="退出登录"><LogOut size={18} /></Button><Button variant="secondary" size="sm" onClick={onLogout} loading={loggingOut} className="hidden sm:inline-flex"><LogOut size={15} />退出登录</Button></div></div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-7 pb-28 sm:px-6 sm:py-9 lg:px-10 lg:pb-10">{children}</main>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="快捷导航"><div className={cn("mx-auto grid max-w-lg gap-1", mobileItems.length === 5 ? "grid-cols-5" : "grid-cols-4")}>{mobileItems.map((item) => <NavItem key={item.href} item={item} mobile onNavigate={closeDrawer} />)}</div></nav>
  </div>;
}

export function MobileSectionLink({ item }: { item: NavigationItem }) {
  return <Link to={item.href} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm font-semibold text-slate-700 last:border-0 hover:text-teal-800"><span className="flex items-center gap-3"><item.icon size={17} className="text-teal-700" />{item.label}</span><ChevronRight size={16} className="text-slate-400" /></Link>;
}

export function UserNavigationLinks() { return <div className="space-y-0">{userItems.slice(1, -1).map((item) => <MobileSectionLink key={item.href} item={item} />)}</div>; }
