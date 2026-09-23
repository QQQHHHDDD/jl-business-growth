import { queryOptions } from "@tanstack/react-query";
import { listCalendarEvents, listGoals, listTeamMembers, listWorklogs } from "@/api/client";
import { businessDate, businessDateDaysAgo, calendarQueryRange } from "@/lib/date";

export const FIRST_SCREEN_STALE_TIME = 30_000;

export function calendarQueryOptions(accountID: string, timezone: string) {
  const range = calendarQueryRange(timezone);
  return queryOptions({
    queryKey: ["user", accountID, "calendar", timezone, range.from, range.to] as const,
    queryFn: () => listCalendarEvents(range.from, range.to),
    staleTime: FIRST_SCREEN_STALE_TIME,
  });
}

export function goalsQueryOptions(accountID: string) {
  return queryOptions({
    queryKey: ["user", accountID, "goals"] as const,
    queryFn: listGoals,
    staleTime: FIRST_SCREEN_STALE_TIME,
  });
}

export function teamMembersQueryOptions(accountID: string) {
  return queryOptions({
    queryKey: ["user", accountID, "team", "members"] as const,
    queryFn: listTeamMembers,
    staleTime: FIRST_SCREEN_STALE_TIME,
  });
}

export function worklogQueryOptions(accountID: string, timezone: string) {
  const currentDate = businessDate(timezone);
  const rangeStart = businessDateDaysAgo(timezone, 90);
  return queryOptions({
    queryKey: ["user", accountID, "worklogs", rangeStart, currentDate] as const,
    queryFn: () => listWorklogs(rangeStart, currentDate),
    staleTime: FIRST_SCREEN_STALE_TIME,
  });
}

export function worklogDateQueryOptions(accountID: string, date: string) {
  return queryOptions({
    queryKey: ["user", accountID, "worklogs", date, date] as const,
    queryFn: () => listWorklogs(date, date),
    staleTime: FIRST_SCREEN_STALE_TIME,
  });
}
