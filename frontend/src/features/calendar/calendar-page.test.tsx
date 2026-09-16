import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Account, AuthResponse, CalendarEvent } from "@/api/client";
import { listCalendarEvents, saveCalendarEvent } from "@/api/client";
import { CalendarPage } from "./calendar-page";

vi.mock("@fullcalendar/react", () => ({
  default: ({ events, dateClick, eventClick, buttonText, initialView }: { events: Array<{ id: string; title: string; extendedProps: { event: CalendarEvent } }>; dateClick: (info: { dateStr: string }) => void; eventClick: (info: { event: { extendedProps: { event: CalendarEvent } } }) => void; buttonText: Record<string, string>; initialView: string; children?: ReactNode }) => (
    <div data-testid="full-calendar">
      <span data-testid="initial-calendar-view">{initialView}</span>
      <button type="button">{buttonText.month}</button>
      <button type="button">{buttonText.week}</button>
      <button type="button">{buttonText.day}</button>
      <button type="button" onClick={() => dateClick({ dateStr: "2026-09-16" })}>选择 2026-09-16</button>
      {events.map((event) => <button key={event.id} type="button" onClick={() => eventClick({ event })}>{event.title}</button>)}
    </div>
  ),
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    listCalendarEvents: vi.fn(),
    saveCalendarEvent: vi.fn(),
    deleteCalendarEvent: vi.fn(),
  };
});

const account = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "owner",
  role: "USER",
  status: "ACTIVE",
  timezone: "Asia/Shanghai",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
} as Account;
const authResponse = {
  data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf-token" },
  request_id: "request-1",
} as AuthResponse;
const recurringEvent = {
  id: "00000000-0000-0000-0000-000000000010",
  occurrence_id: "00000000-0000-0000-0000-000000000010:2026-09-16T01:00:00Z",
  uid: "event-10@example.test",
  sequence: 1,
  title: "每周经营复盘",
  description: "复盘本周行动",
  location_or_link: "会议室",
  timezone: "Asia/Shanghai",
  all_day: false,
  start_at: "2026-09-16T01:00:00Z",
  end_at: "2026-09-16T02:00:00Z",
  recurrence_freq: "WEEKLY",
  recurrence_interval: 1,
  recurrence_weekdays: [3],
  recurrence_end_type: "COUNT",
  recurrence_until: null,
  recurrence_count: 6,
  original_occurrence_start: "2026-09-16T01:00:00Z",
  is_exception: false,
  attendees: [{ email: "guest@example.test", display_name: null }],
} as CalendarEvent;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CalendarPage authResponse={authResponse} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCalendarEvents).mockResolvedValue({ data: { items: [recurringEvent] }, request_id: "request-2" });
  vi.mocked(saveCalendarEvent).mockResolvedValue({ data: recurringEvent, request_id: "request-3" });
});

describe("CalendarPage", () => {
  it("keeps the calendar primary and opens day details without a permanent event list", async () => {
    renderPage();
    expect(await screen.findByTestId("full-calendar")).toBeVisible();
    expect(screen.getByTestId("initial-calendar-view")).toHaveTextContent("dayGridMonth");
    expect(screen.getByRole("button", { name: "月" })).toBeVisible();
    expect(screen.getByRole("button", { name: "周" })).toBeVisible();
    expect(screen.getByRole("button", { name: "日" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "已加载日程" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择 2026-09-16" }));
    expect(screen.getByRole("heading", { name: "2026-09-16" })).toBeVisible();
    expect(screen.getAllByText("每周经营复盘", { exact: true })[1]).toBeVisible();
    expect(screen.getByRole("button", { name: "新建当日日程" })).toBeVisible();
  });

  it("retains recurrence, invite, timezone and edit-scope fields in the editor sheet", async () => {
    renderPage();
    await screen.findByTestId("full-calendar");
    fireEvent.click(screen.getByRole("button", { name: "每周经营复盘" }));

    expect(screen.getByRole("heading", { name: "编辑日程" })).toBeVisible();
    expect(screen.getByLabelText("重复")).toHaveValue("WEEKLY");
    expect(screen.getByLabelText("周三")).toBeChecked();
    expect(screen.getByLabelText("重复结束")).toHaveValue("COUNT");
    expect(screen.getByLabelText("重复次数")).toHaveValue(6);
    expect(screen.getByLabelText("受邀邮箱（可选）")).toHaveValue("guest@example.test");
    fireEvent.change(screen.getByLabelText("修改范围"), { target: { value: "THIS_AND_FOLLOWING" } });
    fireEvent.click(screen.getByRole("button", { name: "保存日程" }));

    await waitFor(() => expect(saveCalendarEvent).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ recurrence_freq: "WEEKLY", recurrence_weekdays: [3], recurrence_end_type: "COUNT", recurrence_count: 6, edit_scope: "THIS_AND_FOLLOWING", occurrence_start: recurringEvent.original_occurrence_start, timezone: "Asia/Shanghai", attendees: [{ email: "guest@example.test", display_name: null }] }), recurringEvent.id));
  });
});
