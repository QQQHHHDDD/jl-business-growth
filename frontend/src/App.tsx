import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { getLiveHealth, getMe, logout, type AuthResponse } from "@/api/client";
import { AppLoadingShell, AppShell } from "@/components/layout/navigation";
import { ErrorState, LoadingState, PageLoadingState } from "@/components/ui/state-block";
import {
  AdminAdminsPage,
  AdminHomePage,
  AdminInvitationsPage,
  AdminUsersPage,
} from "@/features/admin/admin-pages";
import { AuthPage } from "@/features/auth/auth-page";
import { SettingsPage } from "@/features/auth/settings-page";
import { AnalyticsPage } from "@/features/analytics/analytics-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { PlaceholderPage } from "@/features/placeholder/placeholder-page";
import { ReviewsPage } from "@/features/reviews/reviews-page";
import { SearchPage } from "@/features/search/search-page";
import { WorklogPage } from "@/features/worklog/worklog-page";
import { KnowledgePage } from "@/features/knowledge/knowledge-page";
import { FinancePage } from "@/features/finance/finance-page";
import { IncomePage } from "@/features/income/income-page";
import { CommunicationPage } from "@/features/communication/communication-page";
import { roleHome } from "@/lib/utils";
import { loadCalendarPage, loadGoalsPage, loadTeamPage, preloadRoute } from "@/lib/route-preload";

const CalendarPage = lazy(loadCalendarPage);
const GoalsPage = lazy(loadGoalsPage);
const TeamPage = lazy(loadTeamPage);

const userRoutes = [
  ["/app/goals", "梦想与目标", "建立梦想和目标之间的清晰路径。"],
  ["/app/calendar", "日历", "安排需要持续推进的工作。"],
  ["/app/worklog", "今日工作", "记录今天完成的关键行动。"],
  ["/app/communication", "沟通工具", "记录加好友进度和整理话术。"],
  ["/app/team", "团队", "查看团队成长结构。"],
  ["/app/knowledge", "学习中心", "整理长期学习投入。"],
  ["/app/finance", "财务", "管理经营过程中的财务信息。"],
  ["/app/income-simulator", "收入模拟", "比较不同经营方案的结果。"],
  ["/app/reviews", "复盘", "回顾周期内的行动和结果。"],
  ["/app/analytics", "数据统计", "从真实记录中观察趋势。"],
  ["/app/search", "全局搜索", "在系统中快速查找记录。"],
] as const;

type MeQuery = ReturnType<typeof useQuery<AuthResponse | null>>;
type HealthQuery = ReturnType<
  typeof useQuery<Awaited<ReturnType<typeof getLiveHealth>>>
>;

function DeferredPage({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Suspense fallback={<PageLoadingState title={title} description={description} label={`正在加载${title}`} />}>
      {children}
    </Suspense>
  );
}

function ProtectedRoute({
  meQuery,
  children,
}: {
  meQuery: MeQuery;
  children?: ReactNode;
}) {
  const location = useLocation();
  if (meQuery.isPending) return <AppLoadingShell label="正在确认登录状态" />;
  if (meQuery.isError)
    return (
      <ErrorState
        message="无法确认当前登录状态"
        onRetry={() => void meQuery.refetch()}
      />
    );
  if (!meQuery.data)
    return (
      <Navigate
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  return children ?? <Outlet />;
}

function PublicRoute({
  meQuery,
  mode,
  health,
}: {
  meQuery: MeQuery;
  mode: "login" | "register";
  health: HealthQuery;
}) {
  if (meQuery.isPending) return <LoadingState label="正在准备登录" />;
  if (meQuery.data)
    return <Navigate to={roleHome(meQuery.data.data.account.role)} replace />;
  return <AuthPage key={mode} mode={mode} health={health} />;
}

function RoleRoute({
  meQuery,
  roles,
  children,
}: {
  meQuery: MeQuery;
  roles: string[];
  children?: ReactNode;
}) {
  if (!meQuery.data) return null;
  const account = meQuery.data.data.account;
  if (!roles.includes(account.role))
    return <Navigate to={roleHome(account.role)} replace />;
  return children ?? <Outlet />;
}

function ShellRoute({
  meQuery,
  health,
  admin,
  onLogout,
  loggingOut,
  onPrefetchRoute,
  children,
}: {
  meQuery: MeQuery;
  health: HealthQuery;
  admin: boolean;
  onLogout: () => void;
  loggingOut: boolean;
  onPrefetchRoute?: (path: string) => void;
  children?: ReactNode;
}) {
  if (!meQuery.data) return null;
  return (
    <AppShell
      authResponse={meQuery.data}
      health={health}
      admin={admin}
      onLogout={onLogout}
      loggingOut={loggingOut}
      onPrefetchRoute={onPrefetchRoute}
    >
      {children ?? <Outlet />}
    </AppShell>
  );
}

function HomeRedirect({ meQuery }: { meQuery: MeQuery }) {
  if (meQuery.isPending)
    return (
      <div className="min-h-screen bg-slate-100 p-8">
        <h1 className="sr-only">JL团队生意成长管理系统</h1>
        <LoadingState label="正在准备工作台" />
      </div>
    );
  return (
    <Navigate
      to={meQuery.data ? roleHome(meQuery.data.data.account.role) : "/login"}
      replace
    />
  );
}

function UnknownProtectedRedirect({ meQuery }: { meQuery: MeQuery }) {
  return (
    <Navigate
      to={meQuery.data ? roleHome(meQuery.data.data.account.role) : "/login"}
      replace
    />
  );
}

function UserDashboardRoute({ meQuery }: { meQuery: MeQuery }) {
  const authResponse = meQuery.data;
  if (!authResponse) return null;
  return (
    <DashboardPage
      account={authResponse.data.account}
      authResponse={authResponse}
    />
  );
}

function UserGoalsRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? (
    <DeferredPage title="梦想与目标" description="建立梦想和目标之间的清晰路径。">
      <GoalsPage authResponse={meQuery.data} />
    </DeferredPage>
  ) : null;
}

function UserWorklogRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <WorklogPage authResponse={meQuery.data} /> : null;
}

function UserCalendarRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? (
    <DeferredPage title="日历" description="安排需要持续推进的工作。">
      <CalendarPage authResponse={meQuery.data} />
    </DeferredPage>
  ) : null;
}

function UserReviewsRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <ReviewsPage authResponse={meQuery.data} /> : null;
}

function UserAnalyticsRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <AnalyticsPage authResponse={meQuery.data} /> : null;
}

function UserTeamRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? (
    <DeferredPage title="团队" description="查看团队成长结构。">
      <TeamPage authResponse={meQuery.data} />
    </DeferredPage>
  ) : null;
}

function UserKnowledgeRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <KnowledgePage authResponse={meQuery.data} /> : null;
}

function UserCommunicationRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <CommunicationPage authResponse={meQuery.data} /> : null;
}

function UserSearchRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <SearchPage authResponse={meQuery.data} /> : null;
}

function UserFinanceRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <FinancePage authResponse={meQuery.data} /> : null;
}

function UserIncomeRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <IncomePage authResponse={meQuery.data} /> : null;
}

function SettingsRoute({ meQuery }: { meQuery: MeQuery }) {
  const authResponse = meQuery.data;
  if (!authResponse) return null;
  return (
    <SettingsPage
      account={authResponse.data.account}
      authResponse={authResponse}
    />
  );
}

function AdminHomeRoute({ meQuery }: { meQuery: MeQuery }) {
  const account = meQuery.data?.data.account;
  return account ? <AdminHomePage account={account} /> : null;
}

function AdminUsersRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <AdminUsersPage authResponse={meQuery.data} /> : null;
}

function AdminInvitationsRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? (
    <AdminInvitationsPage authResponse={meQuery.data} />
  ) : null;
}

function AdminAdminsRoute({ meQuery }: { meQuery: MeQuery }) {
  return meQuery.data ? <AdminAdminsPage authResponse={meQuery.data} /> : null;
}

function AppRoutes({
  meQuery,
  health,
  onLogout,
  loggingOut,
  onPrefetchRoute,
}: {
  meQuery: MeQuery;
  health: HealthQuery;
  onLogout: () => void;
  loggingOut: boolean;
  onPrefetchRoute?: (path: string) => void;
}) {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect meQuery={meQuery} />} />
      <Route
        path="/login"
        element={<PublicRoute meQuery={meQuery} mode="login" health={health} />}
      />
      <Route
        path="/register"
        element={
          <PublicRoute meQuery={meQuery} mode="register" health={health} />
        }
      />
      <Route element={<ProtectedRoute meQuery={meQuery} />}>
        <Route element={<RoleRoute meQuery={meQuery} roles={["USER"]} />}>
          <Route
            element={
              <ShellRoute
                meQuery={meQuery}
                health={health}
                admin={false}
                onLogout={onLogout}
                loggingOut={loggingOut}
                onPrefetchRoute={onPrefetchRoute}
              />
            }
          >
            <Route
              path="/app"
              element={<UserDashboardRoute meQuery={meQuery} />}
            />
            <Route
              path="/app/turnover"
              element={<Navigate to="/app/analytics?metric=turnover" replace />}
            />
            {userRoutes.map(([path, title, description]) => {
              if (path === "/app/goals")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserGoalsRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/worklog")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserWorklogRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/calendar")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserCalendarRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/reviews")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserReviewsRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/analytics")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserAnalyticsRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/team")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserTeamRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/knowledge")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserKnowledgeRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/communication")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserCommunicationRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/search")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserSearchRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/finance")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserFinanceRoute meQuery={meQuery} />}
                  />
                );
              if (path === "/app/income-simulator")
                return (
                  <Route
                    key={path}
                    path={path}
                    element={<UserIncomeRoute meQuery={meQuery} />}
                  />
                );
              return (
                <Route
                  key={path}
                  path={path}
                  element={
                    <PlaceholderPage title={title} description={description} />
                  }
                />
              );
            })}
          </Route>
        </Route>
        <Route
          element={
            <RoleRoute
              meQuery={meQuery}
              roles={["USER", "ADMIN", "SUPER_ADMIN"]}
            />
          }
        >
          <Route
            element={
              <ShellRoute
                meQuery={meQuery}
                health={health}
                admin={meQuery.data?.data.account.role !== "USER"}
                onLogout={onLogout}
                loggingOut={loggingOut}
                onPrefetchRoute={onPrefetchRoute}
              />
            }
          >
            <Route
              path="/app/settings"
              element={<SettingsRoute meQuery={meQuery} />}
            />
          </Route>
        </Route>
        <Route
          element={
            <RoleRoute meQuery={meQuery} roles={["ADMIN", "SUPER_ADMIN"]} />
          }
        >
          <Route
            element={
              <ShellRoute
                meQuery={meQuery}
                health={health}
                admin
                onLogout={onLogout}
                loggingOut={loggingOut}
                onPrefetchRoute={onPrefetchRoute}
              />
            }
          >
            <Route
              path="/admin"
              element={<AdminHomeRoute meQuery={meQuery} />}
            />
            <Route
              path="/admin/users"
              element={<AdminUsersRoute meQuery={meQuery} />}
            />
            <Route
              path="/admin/invitations"
              element={<AdminInvitationsRoute meQuery={meQuery} />}
            />
            <Route
              element={<RoleRoute meQuery={meQuery} roles={["SUPER_ADMIN"]} />}
            >
              <Route
                path="/admin/admins"
                element={<AdminAdminsRoute meQuery={meQuery} />}
              />
            </Route>
          </Route>
        </Route>
        <Route
          path="*"
          element={<UnknownProtectedRedirect meQuery={meQuery} />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function AppContent() {
  const queryClient = useQueryClient();
  const healthQuery = useQuery({
    queryKey: ["health", "live"],
    queryFn: getLiveHealth,
  });
  const meQuery = useQuery({ queryKey: ["auth", "me"], queryFn: getMe });
  const navigate = useNavigate();
  const location = useLocation();
  const logoutMutation = useMutation({
    mutationFn: () => logout(meQuery.data?.data.csrf_token ?? ""),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: ["auth", "me"] });
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === "user" || query.queryKey[0] === "admin",
      });
      navigate("/login", { replace: true });
    },
  });

  useEffect(() => {
    const titles: Array<[string, string]> = [
      ["/admin/admins", "管理员管理"],
      ["/admin/invitations", "邀请码"],
      ["/admin/users", "用户管理"],
      ["/admin", "管理员工作台"],
      ["/app/income-simulator", "收入模拟"],
      ["/app/settings", "账号设置"],
      ["/app/goals", "梦想与目标"],
      ["/app/calendar", "日历"],
      ["/app/worklog", "今日工作量"],
      ["/app/team", "团队"],
      ["/app/knowledge", "学习中心"],
      ["/app/finance", "财务"],
      ["/app/reviews", "复盘"],
      ["/app/analytics", "数据统计"],
      ["/app/search", "全局搜索"],
      ["/app", "首页"],
      ["/register", "注册"],
      ["/login", "登录"],
    ];
    const pageTitle = titles.find(([path]) => location.pathname === path)?.[1];
    document.title = pageTitle
      ? `${pageTitle} · JL团队生意成长管理系统`
      : "JL团队生意成长管理系统";
  }, [location.pathname]);

  return (
    <AppRoutes
      meQuery={meQuery}
      health={healthQuery}
      onLogout={() => logoutMutation.mutate()}
      loggingOut={logoutMutation.isPending}
      onPrefetchRoute={(path) => preloadRoute(path, queryClient, meQuery.data)}
    />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
