import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, Worklog } from "@/api/client";
import { listWorklogs, saveWorklog } from "@/api/client";
import { businessDate, businessDateDaysAgo } from "@/lib/date";
import { WorklogPage } from "./worklog-page";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    listWorklogs: vi.fn(),
    saveWorklog: vi.fn(),
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
  data: {
    account,
    accounts: [{ ...account, active: true }],
    csrf_token: "csrf-token",
  },
  request_id: "request-1",
} as AuthResponse;

function worklog(date: string, index: number): Worklog {
  return {
    id: `00000000-0000-0000-0000-00000000000${index}`,
    work_date: date,
    open_conversation_count: index,
    deep_conversation_count: 0,
    buffer_count: 0,
    story_share_count: 0,
    screening_count: 0,
    opportunity_count: 0,
    meeting_count: 0,
    customer_followup_count: 0,
    reading_minutes: 0,
    audio_minutes: 0,
    turnover_pv: null,
    turnover_net_amount: null,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <WorklogPage authResponse={authResponse} />
      </QueryClientProvider>
    </MemoryRouter>,
    ),
  };
}

afterEach(() => vi.clearAllMocks());

describe("WorklogPage", () => {
  it("supports compact date navigation and direct or stepped action input", async () => {
    vi.mocked(listWorklogs).mockResolvedValue({
      data: { items: [] },
      request_id: "request-2",
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "五层对话" })).toBeVisible();
    expect(screen.queryByRole("img", { name: /说明/ })).not.toBeInTheDocument();
    const actionInput = screen.getByLabelText("开启对话");

    fireEvent.click(screen.getByRole("button", { name: "减少开启对话" }));
    expect(actionInput).toHaveValue(0);
    fireEvent.click(screen.getByRole("button", { name: "增加开启对话" }));
    expect(actionInput).toHaveValue(1);
    expect(screen.getByLabelText("今日概览")).toHaveTextContent("行动1");

    fireEvent.change(actionInput, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "减少开启对话" }));
    expect(actionInput).toHaveValue(5);

    const dateInput = screen.getByLabelText("业务日期");
    const today = businessDate(account.timezone);
    expect(dateInput).toHaveValue(today);
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    expect(dateInput).not.toHaveValue(today);
    expect(screen.getByRole("button", { name: "今天" })).toBeEnabled();
  });

  it("reuses the range query when only the selected date changes", async () => {
    vi.mocked(listWorklogs).mockResolvedValue({ data: { items: [] }, request_id: "request-2" });
    renderPage();
    const dateInput = await screen.findByLabelText("业务日期");
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    await waitFor(() => expect(dateInput).not.toHaveValue(businessDate(account.timezone)));
    expect(listWorklogs).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a dirty form during a background refresh", async () => {
    const today = businessDate(account.timezone);
    const existing = worklog(today, 1);
    vi.mocked(listWorklogs).mockResolvedValue({ data: { items: [existing] }, request_id: "request-2" });
    const { client } = renderPage();
    const actionInput = await screen.findByLabelText("开启对话");
    fireEvent.change(actionInput, { target: { value: "9" } });
    vi.mocked(listWorklogs).mockResolvedValueOnce({ data: { items: [worklog(today, 2)] }, request_id: "request-refresh" });
    await client.invalidateQueries({ queryKey: ["user", account.id, "worklogs"] });
    expect(actionInput).toHaveValue(9);
  });

  it("uses matching row structure for growth and turnover sections", async () => {
    vi.mocked(listWorklogs).mockResolvedValue({ data: { items: [] }, request_id: "request-2" });
    renderPage();
    const learning = await screen.findByTestId("worklog-learning-section");
    const turnover = screen.getByTestId("worklog-turnover-section");
    expect(learning).toHaveClass("grid-rows-[auto_minmax(40px,auto)_auto_auto]");
    expect(turnover).toHaveClass("grid-rows-[auto_minmax(40px,auto)_auto_auto]");
    expect(learning.querySelectorAll(":scope > *")).toHaveLength(4);
    expect(turnover.querySelectorAll(":scope > *")).toHaveLength(4);
  });

  it("keeps save semantics and limits recent records to seven", async () => {
    const today = businessDate(account.timezone);
    const items = Array.from({ length: 8 }, (_, index) => {
      const date = businessDateDaysAgo(account.timezone, index);
      return worklog(date, index + 1);
    });
    vi.mocked(listWorklogs).mockResolvedValue({
      data: { items },
      request_id: "request-2",
    });
    vi.mocked(saveWorklog).mockResolvedValue({
      data: worklog(today, 9),
      request_id: "request-3",
    });
    renderPage();

    expect(await screen.findByText("最近 7 条记录，点击日期即可返回编辑。")).toBeVisible();
    expect(await screen.findAllByRole("row")).toHaveLength(8);

    const actionInput = screen.getByLabelText("开启对话");
    await waitFor(() => expect(actionInput).toHaveValue(1));
    fireEvent.change(actionInput, { target: { value: "3" } });
    const saveButton = screen.getByRole("button", { name: "保存今日记录" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(saveWorklog).toHaveBeenCalledWith(
        "csrf-token",
        expect.objectContaining({
          work_date: today,
          open_conversation_count: 3,
        }),
        true,
      ),
    );
  });

  it("synchronizes PV and net turnover in both directions while editing history", async () => {
    const today = businessDate(account.timezone);
    const existing = worklog(today, 1);
    existing.turnover_pv = 40;
    existing.turnover_net_amount = "500.00";
    vi.mocked(listWorklogs).mockResolvedValue({ data: { items: [existing] }, request_id: "request-2" });
    vi.mocked(saveWorklog).mockResolvedValue({ data: existing, request_id: "request-3" });
    renderPage();

    const pvInput = await screen.findByLabelText("营业额 PV（可选）");
    const netInput = screen.getByLabelText("净营业额（可选）");
    await waitFor(() => expect(pvInput).toHaveValue(40));
    expect(netInput).toHaveValue(500);

    fireEvent.change(pvInput, { target: { value: "100" } });
    expect(netInput).toHaveValue(1250);
    fireEvent.change(netInput, { target: { value: "2500.00" } });
    expect(pvInput).toHaveValue(200);
    fireEvent.change(pvInput, { target: { value: "8.00" } });
    fireEvent.change(netInput, { target: { value: "100" } });
    expect(screen.queryByText("PV 与净营业额不一致")).not.toBeInTheDocument();
    fireEvent.change(pvInput, { target: { value: "200" } });
    fireEvent.change(netInput, { target: { value: "2500.00" } });

    fireEvent.click(screen.getByRole("button", { name: "保存今日记录" }));
    await waitFor(() => expect(saveWorklog).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ turnover_pv: 200, turnover_net_amount: "2500.00" }), true));
  });
});
