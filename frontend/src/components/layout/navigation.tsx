import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileText,
  Goal,
  GraduationCap,
  Home,
  LineChart,
  Menu,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { AuthResponse, HealthResponse } from "@/api/client";
import { AccountMenu } from "@/components/layout/account-menu";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { SearchOverlay } from "@/features/search/search-page";
import { cn } from "@/lib/utils";

type NavigationItem = { href: string; label: string; icon: typeof Home };
type NavigationGroup = {
  id: string;
  label: string;
  icon: typeof Home;
  items: NavigationItem[];
};

const homeItem: NavigationItem = { href: "/app", label: "首页", icon: Home };
const userGroups: NavigationGroup[] = [
  {
    id: "planning",
    label: "规划与执行",
    icon: ClipboardList,
    items: [
      { href: "/app/goals", label: "梦想与目标", icon: Goal },
      { href: "/app/calendar", label: "日历", icon: CalendarDays },
      { href: "/app/worklog", label: "今日工作", icon: FileText },
    ],
  },
  {
    id: "operations",
    label: "经营管理",
    icon: BriefcaseBusiness,
    items: [
      { href: "/app/turnover", label: "营业额", icon: CircleDollarSign },
      { href: "/app/team", label: "团队", icon: Users },
      { href: "/app/finance", label: "财务", icon: WalletCards },
      { href: "/app/income-simulator", label: "收入模拟", icon: LineChart },
    ],
  },
  {
    id: "growth",
    label: "成长与复盘",
    icon: GraduationCap,
    items: [
      { href: "/app/knowledge", label: "学习中心", icon: BookOpen },
      { href: "/app/reviews", label: "复盘", icon: Sparkles },
      { href: "/app/analytics", label: "数据统计", icon: BarChart3 },
    ],
  },
  {
    id: "system",
    label: "系统工具",
    icon: Wrench,
    items: [
      { href: "/app/data", label: "导入 / 导出", icon: Database },
      { href: "/app/settings", label: "设置", icon: Settings },
    ],
  },
];

const adminItems: NavigationItem[] = [
  { href: "/admin", label: "管理首页", icon: Home },
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/invitations", label: "邀请码", icon: ShieldCheck },
];
const adminManagementItem: NavigationItem = {
  href: "/admin/admins",
  label: "管理员管理",
  icon: ShieldCheck,
};
const settingsItem: NavigationItem = {
  href: "/app/settings",
  label: "设置",
  icon: Settings,
};
const collapseStorageKey = "jl-business-growth:sidebar-collapsed";

function isActive(pathname: string, href: string) {
  return href === "/app" || href === "/admin"
    ? pathname === href
    : pathname.startsWith(href);
}

function currentUserGroup(pathname: string) {
  return userGroups.find((group) =>
    group.items.some((item) => isActive(pathname, item.href)),
  );
}

function currentUserItem(pathname: string) {
  if (pathname === "/app") return homeItem;
  if (pathname === "/app/search")
    return { href: "/app/search", label: "全局搜索", icon: Search };
  return userGroups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item.href));
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className={cn("flex items-center gap-3", compact && "justify-center")}
      aria-label="返回系统首页"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-700 text-sm font-black text-white">
        JL
      </span>
      {!compact && (
        <span>
          <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">
            JL Growth
          </span>
          <span className="mt-0.5 block whitespace-nowrap text-sm font-bold text-slate-950">
            生意成长管理系统
          </span>
        </span>
      )}
    </Link>
  );
}

function NavItem({
  item,
  mobile = false,
  collapsed = false,
  onNavigate,
}: {
  item: NavigationItem;
  mobile?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.href}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive: active }) =>
        cn(
          "group flex items-center rounded-lg text-sm font-semibold transition-colors",
          mobile
            ? "justify-center gap-1 border-0 px-1 py-2 text-[11px]"
            : collapsed
              ? "mx-auto h-10 w-10 justify-center"
              : "gap-3 border-l-[3px] px-3 py-2.5",
          active
            ? "bg-teal-50 text-teal-800"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
          !mobile &&
            !collapsed &&
            (active ? "border-teal-700" : "border-transparent"),
        )
      }
      end={item.href === "/app" || item.href === "/admin"}
    >
      <Icon size={mobile ? 18 : 17} strokeWidth={1.8} aria-hidden="true" />
      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
    </NavLink>
  );
}

function SidebarGroup({
  group,
  expanded,
  current,
  onToggle,
  onNavigate,
}: {
  group: NavigationGroup;
  expanded: boolean;
  current: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition",
          current ? "text-teal-800" : "text-slate-700 hover:bg-slate-100",
          expanded && "bg-slate-50",
        )}
        aria-expanded={expanded}
        aria-controls={`nav-group-${group.id}`}
        onClick={onToggle}
      >
        <Icon size={17} aria-hidden="true" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={15}
          className={cn("text-slate-400 transition", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div id={`nav-group-${group.id}`} className="mt-1 space-y-1 pl-3">
          {group.items.map((item) => (
            <NavItem key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserNavigation({
  pathname,
  expandedGroup,
  onExpandedGroupChange,
  onNavigate,
}: {
  pathname: string;
  expandedGroup: string | null;
  onExpandedGroupChange: (id: string | null) => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-2" aria-label="用户导航">
      <NavItem item={homeItem} onNavigate={onNavigate} />
      {userGroups.map((group) => (
        <SidebarGroup
          key={group.id}
          group={group}
          expanded={expandedGroup === group.id}
          current={currentUserGroup(pathname)?.id === group.id}
          onToggle={() =>
            onExpandedGroupChange(expandedGroup === group.id ? null : group.id)
          }
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function CollapsedUserNavigation({
  pathname,
  onOpenGroup,
}: {
  pathname: string;
  onOpenGroup: (groupId: string) => void;
}) {
  const activeGroup = currentUserGroup(pathname)?.id;
  return (
    <nav className="space-y-2 px-2" aria-label="用户导航">
      <NavItem item={homeItem} collapsed />
      {userGroups.map((group) => {
        const Icon = group.icon;
        return (
          <button
            key={group.id}
            type="button"
            title={group.label}
            aria-label={group.label}
            className={cn(
              "mx-auto grid h-10 w-10 place-items-center rounded-lg transition",
              activeGroup === group.id
                ? "bg-teal-50 text-teal-800"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            )}
            onClick={() => onOpenGroup(group.id)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}

function AdminNavigation({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: NavigationItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1" aria-label="管理员导航">
      {items.map((item) => (
        <NavItem
          key={item.href}
          item={item}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function HealthIndicator({
  health,
}: {
  health: { isPending: boolean; isSuccess: boolean; data?: HealthResponse };
}) {
  if (health.isSuccess) return null;
  const tone = health.isPending ? "warning" : "danger";
  const label = health.isPending ? "正在连接服务" : "服务暂不可用";
  return (
    <div aria-live="polite" className="flex items-center gap-2">
      <StatusBadge tone={tone}>
        <span
          className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
        {label}
      </StatusBadge>
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10">
      {children}
    </div>
  );
}

export function AppShell({
  authResponse,
  health,
  admin = false,
  onLogout,
  loggingOut = false,
  children,
}: {
  authResponse: AuthResponse;
  health: { isPending: boolean; isSuccess: boolean; data?: HealthResponse };
  admin?: boolean;
  onLogout: () => void;
  loggingOut?: boolean;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(collapseStorageKey) === "true",
  );
  const location = useLocation();
  const account = authResponse.data.account;
  const adminNavigation = [
    ...adminItems,
    ...(account.role === "SUPER_ADMIN" ? [adminManagementItem] : []),
    settingsItem,
  ];
  const activeGroup = currentUserGroup(location.pathname)?.id ?? null;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(
    activeGroup,
  );
  const mobileItems = admin
    ? [
        ...adminItems.slice(0, 3),
        ...(account.role === "SUPER_ADMIN" ? [adminManagementItem] : []),
        settingsItem,
      ]
    : [
        homeItem,
        userGroups[0].items[2],
        userGroups[0].items[1],
        userGroups[3].items[1],
      ];
  const currentItem = admin
    ? adminNavigation.find((item) => isActive(location.pathname, item.href))
    : currentUserItem(location.pathname);
  const breadcrumb = admin
    ? ["管理后台", currentItem?.label ?? "工作空间"]
    : location.pathname === "/app"
      ? ["首页"]
      : [
          currentUserGroup(location.pathname)?.label ?? "系统工具",
          currentItem?.label ?? "工作空间",
        ];

  useEffect(() => {
    if (activeGroup) setExpandedGroup(activeGroup);
  }, [activeGroup, location.pathname]);
  useEffect(() => {
    localStorage.setItem(collapseStorageKey, String(collapsed));
  }, [collapsed]);
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
  const toggleCollapsed = () => setCollapsed((value) => !value);
  return (
    <div className="min-h-screen bg-[#f6f8fa] text-slate-950">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-[220px]",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-slate-200",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <Brand compact={collapsed} />
        </div>
        <div
          className={cn(
            "flex-1 overflow-y-auto py-4",
            collapsed ? "px-0" : "px-3",
          )}
        >
          {admin ? (
            <AdminNavigation items={adminNavigation} collapsed={collapsed} />
          ) : collapsed ? (
            <CollapsedUserNavigation
              pathname={location.pathname}
              onOpenGroup={(groupId) => {
                setExpandedGroup(groupId);
                setCollapsed(false);
              }}
            />
          ) : (
            <UserNavigation
              pathname={location.pathname}
              expandedGroup={expandedGroup}
              onExpandedGroupChange={setExpandedGroup}
            />
          )}
        </div>
        <div className="border-t border-slate-200 p-2">
          <button
            type="button"
            className={cn(
              "flex min-h-10 w-full items-center rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              collapsed ? "justify-center" : "gap-3 px-3",
            )}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            title={collapsed ? "展开侧边栏" : undefined}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <>
                <ChevronLeft size={18} />
                <span>收起侧边栏</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div
          data-testid="navigation-overlay"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      )}
      {drawerOpen && (
        <div
        className="fixed inset-y-0 left-0 z-50 flex w-[min(88vw,340px)] flex-col bg-white shadow-2xl lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="应用导航"
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            <Brand />
            <Button
              variant="icon"
              size="sm"
              onClick={closeDrawer}
              aria-label="关闭导航"
            >
              <X size={19} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {admin ? (
              <AdminNavigation
                items={adminNavigation}
                onNavigate={closeDrawer}
              />
            ) : (
              <UserNavigation
                pathname={location.pathname}
                expandedGroup={expandedGroup}
                onExpandedGroupChange={setExpandedGroup}
                onNavigate={closeDrawer}
              />
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          "transition-[padding] duration-200",
          collapsed ? "lg:pl-16" : "lg:pl-[220px]",
        )}
      >
        <header className="sticky top-0 z-20 h-16 border-b border-slate-200 bg-white/95 shadow-[0_1px_0_#e2e8f0,0_2px_8px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="mx-auto flex h-full max-w-[1360px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="icon"
                size="sm"
                className="lg:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="打开导航"
              >
                <Menu size={20} />
              </Button>
              <nav
                aria-label="面包屑"
                className="flex min-w-0 items-center gap-1.5 text-sm"
              >
                {breadcrumb.map((part, index) => (
                  <span
                    key={`${part}-${index}`}
                    className={cn(
                      "truncate",
                      index === breadcrumb.length - 1
                        ? "font-semibold text-slate-900"
                        : "text-slate-500",
                    )}
                  >
                    {index > 0 && (
                      <ChevronRight
                        size={14}
                        className="mr-1.5 inline text-slate-300"
                      />
                    )}
                    {part}
                  </span>
                ))}
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <HealthIndicator health={health} />
              {!admin && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="hidden md:inline-flex"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search size={16} />
                  全局搜索
                </Button>
              )}
              {!admin && (
                <Button variant="icon" size="sm" className="md:hidden" aria-label="全局搜索" onClick={() => setSearchOpen(true)}>
                  <Search size={18} />
                </Button>
              )}
              <AccountMenu
                authResponse={authResponse}
                onLogout={onLogout}
                loggingOut={loggingOut}
              />
            </div>
          </div>
        </header>
        <main>
          <PageContainer>{children}</PageContainer>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
        aria-label="快捷导航"
      >
        <div
          className={cn(
            "mx-auto grid max-w-lg gap-1",
            mobileItems.length === 5 ? "grid-cols-5" : "grid-cols-4",
          )}
        >
          {mobileItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              mobile
              onNavigate={closeDrawer}
            />
          ))}
        </div>
      </nav>
      {!admin && <SearchOverlay authResponse={authResponse} open={searchOpen} onOpenChange={setSearchOpen} />}
    </div>
  );
}
