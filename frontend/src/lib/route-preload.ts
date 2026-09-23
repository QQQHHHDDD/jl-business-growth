import type { QueryClient } from "@tanstack/react-query";
import type { AuthResponse } from "@/api/client";
import { calendarQueryOptions, goalsQueryOptions, teamMembersQueryOptions, worklogQueryOptions } from "@/lib/query-options";

export const loadCalendarPage = () => import("@/features/calendar/calendar-page").then((module) => ({ default: module.CalendarPage }));
export const loadGoalsPage = () => import("@/features/goals/goals-page").then((module) => ({ default: module.GoalsPage }));
export const loadTeamPage = () => import("@/features/team/team-page").then((module) => ({ default: module.TeamPage }));

export function preloadRoute(path: string, queryClient?: QueryClient, authResponse?: AuthResponse | null): void {
  if (path === "/app/calendar") void loadCalendarPage();
  else if (path === "/app/goals") void loadGoalsPage();
  else if (path === "/app/team") void loadTeamPage();

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
