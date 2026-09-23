import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { QueryKey, QueryObserverOptions } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { listCalendarEvents, listGoals, listTeamMembers, listWorklogs } from "@/api/client";
import { calendarQueryOptions, goalsQueryOptions, teamMembersQueryOptions, worklogQueryOptions } from "@/lib/query-options";
import { preloadRoute } from "@/lib/route-preload";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  listCalendarEvents: vi.fn(),
  listGoals: vi.fn(),
  listTeamMembers: vi.fn(),
  listWorklogs: vi.fn(),
}));
vi.mock("@/features/calendar/calendar-page", () => ({ CalendarPage: () => null }));
vi.mock("@/features/goals/goals-page", () => ({ GoalsPage: () => null }));
vi.mock("@/features/team/team-page", () => ({ TeamPage: () => null }));

const account = { id: "account-1", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "request-1" } as AuthResponse;

async function verifyPreload(path: string, sharedOptions: unknown, callCount: () => number) {
  const options = sharedOptions as QueryObserverOptions<unknown, Error, unknown, unknown, QueryKey>;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  preloadRoute(path, client, authResponse);
  await waitFor(() => expect(callCount()).toBe(1));

  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => undefined);
  await waitFor(() => expect(callCount()).toBe(1));

  await client.invalidateQueries({ queryKey: options.queryKey });
  await waitFor(() => expect(callCount()).toBe(2));
  unsubscribe();
  client.clear();
}

describe("route preload query sharing", () => {
  it("reuses calendar prefetch on mount and refetches after invalidation", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue({ data: { items: [] }, request_id: "calendar" });
    await verifyPreload("/app/calendar", calendarQueryOptions(account.id, account.timezone), () => vi.mocked(listCalendarEvents).mock.calls.length);
  });

  it("reuses goals prefetch on mount and refetches after invalidation", async () => {
    vi.mocked(listGoals).mockResolvedValue({ data: { items: [] }, request_id: "goals" });
    await verifyPreload("/app/goals", goalsQueryOptions(account.id), () => vi.mocked(listGoals).mock.calls.length);
  });

  it("reuses team prefetch on mount and refetches after invalidation", async () => {
    vi.mocked(listTeamMembers).mockResolvedValue({ data: { items: [] }, request_id: "team" });
    await verifyPreload("/app/team", teamMembersQueryOptions(account.id), () => vi.mocked(listTeamMembers).mock.calls.length);
  });

  it("reuses worklog prefetch on mount and refetches after invalidation", async () => {
    vi.mocked(listWorklogs).mockResolvedValue({ data: { items: [] }, request_id: "worklog" });
    await verifyPreload("/app/worklog", worklogQueryOptions(account.id, account.timezone), () => vi.mocked(listWorklogs).mock.calls.length);
  });
});
