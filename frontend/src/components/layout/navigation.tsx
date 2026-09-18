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
  Leaf,
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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { AuthResponse, HealthResponse } from "@/api/client";
import { AccountMenu } from "@/components/layout/account-menu";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/state-block";
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
const expandedGroupsStorageKey = "jl-business-growth:sidebar-expanded-groups";

function readExpandedGroups(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(expandedGroupsStorageKey) ?? "null") as unknown;
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && userGroups.some((group) => group.id === item));
    if (typeof value === "string" && userGroups.some((group) => group.id === value)) return [value];
  } catch {
    // Invalid legacy state is ignored and replaced on the next state write.
  }
  return [];
}

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
      className={cn("flex min-w-0 items-center gap-3", compact && "justify-center")}
      aria-label="返回系统首页"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-black text-white shadow-brand-glow ring-1 ring-white/50">
        JL
      </span>
      {!compact && (
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
            JL Growth
          </span>
          <span className="mt-0.5 block text-xs font-bold leading-4 text-ink">
            JL团队生意成长管理系统
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
  onPrefetchRoute,
}: {
  item: NavigationItem;
  mobile?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  onPrefetchRoute?: (path: string) => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.href}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      onMouseEnter={() => onPrefetchRoute?.(item.href)}
      onFocus={() => onPrefetchRoute?.(item.href)}
      className={({ isActive: active }) =>
        cn(
          "group flex items-center rounded-control text-sm font-semibold transition-[background-color,color,box-shadow] duration-[var(--motion-fast)]",
          mobile
            ? "justify-center gap-1 border-0 px-1 py-2 text-[11px]"
            : collapsed
              ? "mx-auto h-10 w-10 justify-center"
              : "gap-3 px-3 py-2.5",
          active
            ? "bg-teal-50 text-brand-800 shadow-hairline ring-1 ring-inset ring-brand-100"
            : "text-ink-muted hover:bg-surface-muted hover:text-ink",
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
  onPrefetchRoute,
}: {
  group: NavigationGroup;
  expanded: boolean;
  current: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  onPrefetchRoute?: (path: string) => void;
}) {
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-sm font-semibold transition-[background-color,color] duration-[var(--motion-fast)]",
          current ? "text-brand-800" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
          expanded && "bg-surface-muted",
        )}
        aria-expanded={expanded}
        aria-controls={`nav-group-${group.id}`}
        onClick={onToggle}
      >
        <Icon size={17} aria-hidden="true" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={15}
          className={cn("text-ink-faint transition-transform duration-[var(--motion-fast)]", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div id={`nav-group-${group.id}`} className="mt-1 space-y-1 pl-3">
          {group.items.map((item) => (
            <NavItem key={item.href} item={item} onNavigate={onNavigate} onPrefetchRoute={onPrefetchRoute} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserNavigation({
  pathname,
  expandedGroups,
  onExpandedGroupsChange,
  onNavigate,
  onPrefetchRoute,
}: {
  pathname: string;
  expandedGroups: string[];
  onExpandedGroupsChange: (update: (groups: string[]) => string[]) => void;
  onNavigate?: () => void;
  onPrefetchRoute?: (path: string) => void;
}) {
  return (
    <nav className="space-y-2" aria-label="用户导航">
      <NavItem item={homeItem} onNavigate={onNavigate} onPrefetchRoute={onPrefetchRoute} />
      {userGroups.map((group) => (
        <SidebarGroup
          key={group.id}
          group={group}
          expanded={expandedGroups.includes(group.id)}
          current={currentUserGroup(pathname)?.id === group.id}
          onToggle={() => onExpandedGroupsChange((groups) => groups.includes(group.id) ? groups.filter((id) => id !== group.id) : [...groups, group.id])}
          onNavigate={onNavigate}
          onPrefetchRoute={onPrefetchRoute}
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
              "mx-auto grid h-10 w-10 place-items-center rounded-control transition-[background-color,color,box-shadow] duration-[var(--motion-fast)]",
              activeGroup === group.id
                ? "bg-teal-50 text-brand-800 shadow-hairline ring-1 ring-inset ring-brand-100"
                : "text-ink-muted hover:bg-surface-muted hover:text-ink",
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
    <div data-testid="page-container" className="mx-auto min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-[1360px] overflow-x-clip px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10">
      {children}
    </div>
  );
}

function SidebarBrandNote() {
  return (
    <div aria-hidden="true" className="mx-2 mb-2 rounded-card border border-brand-100 bg-brand-50/60 p-3 text-brand-800 shadow-hairline">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Leaf size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold">Growth Together</p>
          <p className="mt-0.5 text-[11px] leading-4 text-brand-700/80">每天一点成长</p>
        </div>
      </div>
    </div>
  );
}

export function AppLoadingShell({ label }: { label: string }) {
  return (
    <div data-testid="app-loading-shell" className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-[220px] flex-col border-r border-outline bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-outline px-4">
          <div className="h-9 w-9 animate-pulse rounded-control bg-brand-100" />
          <div className="ml-3 space-y-2">
            <div className="h-2.5 w-20 animate-pulse rounded bg-surface-muted" />
            <div className="h-3 w-36 animate-pulse rounded bg-surface-soft" />
          </div>
        </div>
        <div className="space-y-3 px-3 py-5" aria-hidden="true">
          <div className="h-10 animate-pulse rounded-control bg-surface-muted" />
          <div className="h-10 animate-pulse rounded-control bg-surface-muted" />
          <div className="h-10 animate-pulse rounded-control bg-surface-muted" />
          <div className="h-10 animate-pulse rounded-control bg-surface-muted" />
        </div>
      </aside>
      <div className="lg:pl-[220px]">
        <header className="h-16 border-b border-outline bg-surface shadow-hairline">
          <div className="mx-auto flex h-full max-w-[1360px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" aria-hidden="true" />
            <div className="h-9 w-28 animate-pulse rounded-control bg-surface-soft" aria-hidden="true" />
          </div>
        </header>
        <main>
          <PageContainer>
            <LoadingState label={label} />
          </PageContainer>
        </main>
      </div>
    </div>
  );
}

export function AppShell({
  authResponse,
  health,
  admin = false,
  onLogout,
  loggingOut = false,
  onPrefetchRoute,
  children,
}: {
  authResponse: AuthResponse;
  health: { isPending: boolean; isSuccess: boolean; data?: HealthResponse };
  admin?: boolean;
  onLogout: () => void;
  loggingOut?: boolean;
  onPrefetchRoute?: (path: string) => void;
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
  const [expandedGroups, setExpandedGroups] = useState<string[]>(readExpandedGroups);
  const visitedGroups = useRef(new Set<string>());
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
    if (!activeGroup || visitedGroups.current.has(activeGroup)) return;
    visitedGroups.current.add(activeGroup);
    setExpandedGroups((groups) => groups.includes(activeGroup) ? groups : [...groups, activeGroup]);
  }, [activeGroup]);
  useEffect(() => {
    localStorage.setItem(expandedGroupsStorageKey, JSON.stringify(expandedGroups));
  }, [expandedGroups]);
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
    <div className="min-h-screen bg-canvas text-ink">
      <aside
        data-testid="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-outline bg-surface shadow-hairline transition-[width] duration-[var(--motion-slow)] lg:flex",
          collapsed ? "w-16" : "w-[220px]",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-outline",
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
                setExpandedGroups((groups) => groups.includes(groupId) ? groups : [...groups, groupId]);
                setCollapsed(false);
              }}
            />
          ) : (
            <UserNavigation
              pathname={location.pathname}
              expandedGroups={expandedGroups}
              onExpandedGroupsChange={setExpandedGroups}
              onPrefetchRoute={onPrefetchRoute}
            />
          )}
        </div>
        {!collapsed && !admin && <SidebarBrandNote />}
        <div className="border-t border-outline p-2">
          <button
            type="button"
            className={cn(
              "flex min-h-10 w-full items-center rounded-control text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink",
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
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      )}
      {drawerOpen && (
        <div
        className="fixed inset-y-0 left-0 z-50 flex w-[min(88vw,340px)] flex-col border-r border-outline bg-surface shadow-overlay lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="应用导航"
        >
          <div className="flex h-16 items-center justify-between border-b border-outline px-4">
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
                expandedGroups={expandedGroups}
                onExpandedGroupsChange={setExpandedGroups}
                onNavigate={closeDrawer}
                onPrefetchRoute={onPrefetchRoute}
              />
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          "transition-[padding] duration-[var(--motion-slow)]",
          collapsed ? "lg:pl-16" : "lg:pl-[220px]",
        )}
      >
        <header data-testid="app-topbar" className="sticky top-0 z-20 h-16 border-b border-outline bg-surface/90 shadow-hairline backdrop-blur-md">
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
                        ? "font-semibold text-ink"
                        : "text-ink-faint",
                    )}
                  >
                    {index > 0 && (
                      <ChevronRight
                        size={14}
                        className="mr-1.5 inline text-outline"
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
        className="fixed inset-x-0 bottom-0 z-30 border-t border-outline bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.3)] backdrop-blur-md lg:hidden"
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
