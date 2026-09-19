export const loadCalendarPage = () => import("@/features/calendar/calendar-page").then((module) => ({ default: module.CalendarPage }));
export const loadGoalsPage = () => import("@/features/goals/goals-page").then((module) => ({ default: module.GoalsPage }));
export const loadTeamPage = () => import("@/features/team/team-page").then((module) => ({ default: module.TeamPage }));

export function preloadRoute(path: string): void {
  if (path === "/app/calendar") void loadCalendarPage();
  else if (path === "/app/goals") void loadGoalsPage();
  else if (path === "/app/team") void loadTeamPage();
}
