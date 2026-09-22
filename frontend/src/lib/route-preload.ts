import type { QueryClient } from "@tanstack/react-query";
import type { AuthResponse } from "@/api/client";
import { listCalendarEvents, listGoals, listTeamMembers, listWorklogs } from "@/api/client";
import { businessDate, businessDateDaysAgo, calendarQueryRange } from "@/lib/date";

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
    const range = calendarQueryRange(timezone);
    void queryClient.prefetchQuery({
      queryKey: ["user", accountID, "calendar", timezone, range.from, range.to],
      queryFn: () => listCalendarEvents(range.from, range.to),
    });
  } else if (path === "/app/goals") {
    void queryClient.prefetchQuery({ queryKey: ["user", accountID, "goals"], queryFn: listGoals });
  } else if (path === "/app/team") {
    void queryClient.prefetchQuery({ queryKey: ["user", accountID, "team", "members"], queryFn: listTeamMembers });
  } else if (path === "/app/worklog") {
    const currentDate = businessDate(timezone);
    const rangeStart = businessDateDaysAgo(timezone, 90);
    void queryClient.prefetchQuery({
      queryKey: ["user", accountID, "worklogs", rangeStart, currentDate],
      queryFn: () => listWorklogs(rangeStart, currentDate),
    });
  }
}
