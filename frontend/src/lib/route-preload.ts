import type { QueryClient } from "@tanstack/react-query";
import type { AuthResponse } from "@/api/client";
import { calendarQueryOptions, goalsQueryOptions, teamMembersQueryOptions, worklogQueryOptions } from "@/lib/query-options";

export const loadAnalyticsPage = () => import("@/features/analytics/analytics-page").then((module) => ({ default: module.AnalyticsPage }));
export const loadCalendarPage = () => import("@/features/calendar/calendar-page").then((module) => ({ default: module.CalendarPage }));
export const loadCommunicationPage = () => import("@/features/communication/communication-page").then((module) => ({ default: module.CommunicationPage }));
export const loadDashboardPage = () => import("@/features/dashboard/dashboard-page").then((module) => ({ default: module.DashboardPage }));
export const loadFinancePage = () => import("@/features/finance/finance-page").then((module) => ({ default: module.FinancePage }));
export const loadGoalsPage = () => import("@/features/goals/goals-page").then((module) => ({ default: module.GoalsPage }));
export const loadIncomePage = () => import("@/features/income/income-page").then((module) => ({ default: module.IncomePage }));
export const loadKnowledgePage = () => import("@/features/knowledge/knowledge-page").then((module) => ({ default: module.KnowledgePage }));
export const loadReviewsPage = () => import("@/features/reviews/reviews-page").then((module) => ({ default: module.ReviewsPage }));
export const loadSearchPage = () => import("@/features/search/search-page").then((module) => ({ default: module.SearchPage }));
export const loadTeamPage = () => import("@/features/team/team-page").then((module) => ({ default: module.TeamPage }));
export const loadWorklogPage = () => import("@/features/worklog/worklog-page").then((module) => ({ default: module.WorklogPage }));

export function preloadRoute(path: string, queryClient?: QueryClient, authResponse?: AuthResponse | null): void {
  if (path === "/app") void loadDashboardPage();
  else if (path === "/app/analytics") void loadAnalyticsPage();
  else if (path === "/app/calendar") void loadCalendarPage();
  else if (path === "/app/communication") void loadCommunicationPage();
  else if (path === "/app/finance") void loadFinancePage();
  else if (path === "/app/goals") void loadGoalsPage();
  else if (path === "/app/income-simulator") void loadIncomePage();
  else if (path === "/app/knowledge") void loadKnowledgePage();
  else if (path === "/app/reviews") void loadReviewsPage();
  else if (path === "/app/search") void loadSearchPage();
  else if (path === "/app/team") void loadTeamPage();
  else if (path === "/app/worklog") void loadWorklogPage();

  if (!queryClient || !authResponse || authResponse.data.account.role !== "USER") return;
  const accountID = authResponse.data.account.id;
  const timezone = authResponse.data.account.timezone;
  if (path === "/app/calendar") {
    void queryClient.prefetchQuery(calendarQueryOptions(accountID, timezone));
  } else if (path === "/app/goals") {
    void queryClient.prefetchQuery(goalsQueryOptions(accountID));
  } else if (path === "/app/team") {
    void queryClient.prefetchQuery(teamMembersQueryOptions(accountID));
  } else if (path === "/app/worklog") {
    void queryClient.prefetchQuery(worklogQueryOptions(accountID, timezone));
  }
}
