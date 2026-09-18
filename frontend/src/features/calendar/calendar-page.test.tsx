import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { Account, AuthResponse, CalendarContact, CalendarEvent } from "@/api/client";
import { deleteCalendarContact, getCalendarEvent, listCalendarContacts, listCalendarEvents, saveCalendarContact, saveCalendarEvent } from "@/api/client";
import { businessDate } from "@/lib/date";
import { CalendarPage } from "./calendar-page";

const calendarMocks = vi.hoisted(() => ({ dropRevert: vi.fn(), resizeRevert: vi.fn() }));

vi.mock("@fullcalendar/react", () => ({
  default: ({ events, dateClick, select, eventClick, eventDrop, eventResize, eventContent, buttonText, initialView, timeZone, selectable, editable, eventDurationEditable }: {
    events: Array<{ id: string; title: string; start: string; end: string; allDay: boolean; extendedProps: { event: CalendarEvent } }>;
    dateClick: (info: { dateStr: string }) => void;
    select: (info: { start: Date; end: Date; startStr: string; endStr: string; view: { type: string } }) => void;
    eventClick: (info: { event: { extendedProps: { event: CalendarEvent } } }) => void;
    eventDrop: (info: unknown) => void;
    eventResize: (info: unknown) => void;
    eventContent: (info: unknown) => ReactNode;
    buttonText: Record<string, string>;
    initialView: string;
    timeZone: string;
    selectable: boolean;
    editable: boolean;
    eventDurationEditable: boolean;
  }) => {
    const calendarEvent = (event: (typeof events)[number], start: string, end: string) => ({ start: new Date(start), end: new Date(end), allDay: event.allDay, extendedProps: event.extendedProps });
    const recurring = events.find((event) => event.extendedProps.event.recurrence_freq !== "NONE");
    const single = events.find((event) => event.extendedProps.event.recurrence_freq === "NONE");
    return <div data-testid="full-calendar" data-timezone={timeZone} data-selectable={String(selectable)} data-editable={String(editable)} data-resizable={String(eventDurationEditable)}>
      <span data-testid="initial-calendar-view">{initialView}</span>
      <button type="button">{buttonText.month}</button><button type="button">{buttonText.week}</button><button type="button">{buttonText.day}</button>
      <button type="button" onClick={() => dateClick({ dateStr: "2026-09-16" })}>选择 2026-09-16</button>
      <button type="button" onClick={() => select({ start: new Date("2026-09-16T06:00:00Z"), end: new Date("2026-09-16T07:30:00Z"), startStr: "2026-09-16T14:00:00", endStr: "2026-09-16T15:30:00", view: { type: "timeGridWeek" } })}>拖拽 14:00 至 15:30</button>
      {eventContent({ event: { start: null, end: null, extendedProps: {} }, view: { type: "timeGridWeek" }, isMirror: true, timeText: "09:00" } as unknown as Parameters<typeof eventContent>[0])}
      {events.map((event) => <div key={event.id}><button type="button" onClick={() => eventClick({ event: { extendedProps: event.extendedProps } })}>查看 {event.title}</button>{eventContent({ event: calendarEvent(event, event.start, event.end), view: { type: "dayGridMonth" } })}</div>)}
      {recurring && <button type="button" onClick={() => eventDrop({ event: calendarEvent(recurring, "2026-09-16T02:00:00Z", "2026-09-16T03:00:00Z"), revert: calendarMocks.dropRevert })}>拖动重复日程</button>}
      {single && <><button type="button" onClick={() => eventDrop({ event: calendarEvent(single, "2026-09-17T03:00:00Z", "2026-09-17T04:00:00Z"), revert: calendarMocks.dropRevert })}>拖动单次日程</button><button type="button" onClick={() => eventResize({ event: calendarEvent(single, single.start, "2026-09-17T04:30:00Z"), revert: calendarMocks.resizeRevert })}>缩放单次日程</button></>}
    </div>;
  },
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return { ...actual, getCalendarEvent: vi.fn(), listCalendarEvents: vi.fn(), saveCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), listCalendarContacts: vi.fn(), saveCalendarContact: vi.fn(), deleteCalendarContact: vi.fn() };
});

const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf-token" }, request_id: "request-1" } as AuthResponse;
const recurringEvent = {
  id: "00000000-0000-0000-0000-000000000010", occurrence_id: "event-10:2026-09-16T01:00:00Z", uid: "event-10@example.test", sequence: 1, title: "每周经营复盘", description: "复盘本周行动", location_or_link: "会议室", timezone: "Asia/Shanghai", all_day: false, start_at: "2026-09-16T01:00:00Z", end_at: "2026-09-16T02:00:00Z", recurrence_freq: "WEEKLY", recurrence_interval: 1, recurrence_weekdays: [3], recurrence_end_type: "COUNT", recurrence_until: null, recurrence_count: 6, original_occurrence_start: "2026-09-16T01:00:00Z", is_exception: false, attendees: [{ email: "guest@example.test", display_name: null }],
} as CalendarEvent;
const singleEvent = { ...recurringEvent, id: "00000000-0000-0000-0000-000000000011", occurrence_id: "event-11", uid: "event-11@example.test", title: "单次沟通", start_at: "2026-09-17T01:00:00Z", end_at: "2026-09-17T02:00:00Z", recurrence_freq: "NONE", recurrence_weekdays: [], recurrence_end_type: "NEVER", recurrence_count: null, original_occurrence_start: null, attendees: [] } as CalendarEvent;
const contact = { id: "00000000-0000-0000-0000-000000000020", name: "访客", email: "guest@example.test", created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" } as CalendarContact;

function renderPage(entry = "/app/calendar") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><CalendarPage authResponse={authResponse} /></QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCalendarEvents).mockResolvedValue({ data: { items: [recurringEvent, singleEvent] }, request_id: "request-2" });
  vi.mocked(getCalendarEvent).mockResolvedValue({ data: recurringEvent, request_id: "request-get" });
  vi.mocked(saveCalendarEvent).mockResolvedValue({ data: recurringEvent, request_id: "request-3" });
  vi.mocked(listCalendarContacts).mockResolvedValue({ data: { items: [contact] }, request_id: "request-4" });
  vi.mocked(saveCalendarContact).mockResolvedValue({ data: contact, request_id: "request-5" });
  vi.mocked(deleteCalendarContact).mockResolvedValue(undefined);
});

describe("CalendarPage", () => {
  it("shows contact loading without briefly rendering the empty state", async () => {
    vi.mocked(listCalendarContacts).mockImplementationOnce(() => new Promise(() => undefined));
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "常用联系人" }), { button: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("正在加载常用联系人");
    expect(screen.queryByText("还没有常用联系人")).not.toBeInTheDocument();
  });

  it("shows the contact empty state only after a successful empty response", async () => {
    vi.mocked(listCalendarContacts).mockResolvedValueOnce({ data: { items: [] }, request_id: "request-empty" });
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "常用联系人" }), { button: 0 });
    expect(await screen.findByText("还没有常用联系人")).toBeVisible();
    expect(screen.queryByText("常用联系人暂时无法加载")).not.toBeInTheDocument();
  });

  it("keeps the calendar primary, renders complete event information, and hides timezone labels", async () => {
    renderPage();
    const calendar = await screen.findByTestId("full-calendar");
    expect(calendar).toHaveAttribute("data-timezone", "Asia/Shanghai");
    expect(calendar).toHaveAttribute("data-editable", "true");
    expect(calendar).toHaveAttribute("data-resizable", "true");
    expect(screen.getAllByText(/09:00–10:00/)[0]).toBeVisible();
    fireEvent.mouseEnter(screen.getAllByLabelText(/每周经营复盘；/)[0]);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("会议室");
    expect(screen.queryByText("Asia/Shanghai")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "选择 2026-09-16" }));
    expect(screen.getByRole("heading", { name: "2026-09-16" })).toBeVisible();
    expect(screen.getByRole("button", { name: "新建当日日程" })).toBeVisible();
  });

  it("opens event details first and retains recurrence and invite fields when editing", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "查看 每周经营复盘" }));
    const detail = screen.getByRole("dialog");
    expect(within(detail).getByText("复盘本周行动")).toBeVisible();
    expect(within(detail).getByText("guest@example.test")).toBeVisible();
    fireEvent.click(within(detail).getByRole("button", { name: "编辑日程" }));
    expect(screen.getByRole("heading", { name: "编辑日程" })).toBeVisible();
    expect(screen.getByLabelText("重复")).toHaveValue("WEEKLY");
    expect(screen.getByLabelText("周三")).toBeChecked();
    expect(screen.getByLabelText(/访客/)).toBeChecked();
    fireEvent.change(screen.getByLabelText("修改范围"), { target: { value: "THIS_AND_FOLLOWING" } });
    fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
    await waitFor(() => expect(saveCalendarEvent).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ edit_scope: "THIS_AND_FOLLOWING", attendees: [{ email: "guest@example.test", display_name: null }] }), recurringEvent.id));
  });

  it("defaults a new event to today in the account timezone and accepts dragged ranges", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "新建日程" }));
    expect(screen.getByLabelText("开始时间")).toHaveValue(`${businessDate(account.timezone)}T09:00`);
    expect(screen.getByLabelText("结束时间")).toHaveValue(`${businessDate(account.timezone)}T10:00`);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "拖拽 14:00 至 15:30" }));
    expect(screen.getByLabelText("开始时间")).toHaveValue("2026-09-16T14:00");
    expect(screen.getByLabelText("结束时间")).toHaveValue("2026-09-16T15:30");
  });

  it("supports selecting multiple contacts and saving a new invitee", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "新建日程" }));
    fireEvent.change(screen.getByLabelText("日程标题"), { target: { value: "联系人测试" } });
    fireEvent.click(screen.getByLabelText(/访客/));
    fireEvent.change(screen.getByLabelText("新增受邀邮箱"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByLabelText("保存为常用联系人"));
    fireEvent.change(screen.getByLabelText("联系人姓名（可选）"), { target: { value: "新联系人" } });
    fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
    await waitFor(() => expect(saveCalendarContact).toHaveBeenCalledWith("csrf-token", { email: "new@example.com", name: "新联系人" }));
    expect(saveCalendarEvent).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ attendees: [{ email: "guest@example.test", display_name: null }, { email: "new@example.com", display_name: null }] }), undefined);
  });

  it("updates a single event after drag and rolls back a failed resize", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "拖动单次日程" }));
    await waitFor(() => expect(saveCalendarEvent).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ start_at: "2026-09-17T03:00:00.000Z", end_at: "2026-09-17T04:00:00.000Z", edit_scope: "SERIES" }), singleEvent.id));
    vi.mocked(saveCalendarEvent).mockRejectedValueOnce(new Error("network unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "缩放单次日程" }));
    await waitFor(() => expect(calendarMocks.resizeRevert).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent("日程时间更新失败");
  });

  it("requires a scope before moving a recurring occurrence and reverts cancellation", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "拖动重复日程" }));
    expect(screen.getByRole("heading", { name: "选择修改范围" })).toBeVisible();
    expect(saveCalendarEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("此日程及之后"));
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));
    await waitFor(() => expect(saveCalendarEvent).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ edit_scope: "THIS_AND_FOLLOWING", occurrence_start: recurringEvent.original_occurrence_start }), recurringEvent.id));
    fireEvent.click(screen.getByRole("button", { name: "拖动重复日程" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(calendarMocks.dropRevert).toHaveBeenCalledTimes(1);
  });

  it("manages and searches contacts inside the calendar module", async () => {
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "常用联系人" }), { button: 0 });
    expect(screen.getByText("guest@example.test")).toBeVisible();
    fireEvent.change(screen.getByLabelText("搜索姓名或邮箱"), { target: { value: "missing" } });
    expect(screen.getByText("没有匹配的联系人")).toBeVisible();
    fireEvent.change(screen.getByLabelText("搜索姓名或邮箱"), { target: { value: "访客" } });
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("姓名（可选）"), { target: { value: "更新访客" } });
    fireEvent.click(screen.getByRole("button", { name: "保存联系人" }));
    await waitFor(() => expect(saveCalendarContact).toHaveBeenCalledWith("csrf-token", { name: "更新访客", email: "guest@example.test" }, contact.id));
    fireEvent.click(screen.getByRole("button", { name: "删除联系人 访客" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(deleteCalendarContact).toHaveBeenCalledWith("csrf-token", contact.id));
  });

  it("keeps contact request failures distinct from an empty list and retries on demand", async () => {
    vi.mocked(listCalendarContacts).mockRejectedValueOnce(new Error("backend unavailable"));
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "常用联系人" }), { button: 0 });
    expect(await screen.findByRole("alert")).toHaveTextContent("常用联系人暂时无法加载");
    expect(screen.queryByText("还没有常用联系人")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("guest@example.test")).toBeVisible();
    expect(listCalendarContacts).toHaveBeenCalledTimes(2);
  });

  it("restores an event deep link into the detail dialog", async () => {
    renderPage(`/app/calendar?event=${recurringEvent.id}`);
    expect(await screen.findByRole("heading", { name: recurringEvent.title })).toBeVisible();
    expect(screen.getByRole("button", { name: "编辑日程" })).toBeVisible();
  });
});
