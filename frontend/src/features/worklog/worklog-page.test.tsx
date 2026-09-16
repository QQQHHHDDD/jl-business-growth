import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, Worklog } from "@/api/client";
import { listWorklogs, saveWorklog } from "@/api/client";
import { businessDate } from "@/lib/date";
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
  return render(
    <QueryClientProvider client={client}>
      <WorklogPage authResponse={authResponse} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("WorklogPage", () => {
  it("supports compact date navigation and direct or stepped action input", async () => {
    vi.mocked(listWorklogs).mockResolvedValue({
      data: { items: [] },
      request_id: "request-2",
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "顾客行动" })).toBeVisible();
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

  it("keeps save semantics and limits recent records to seven", async () => {
    const today = businessDate(account.timezone);
    const items = Array.from({ length: 8 }, (_, index) => {
      const date = new Date(Date.now() - index * 86_400_000)
        .toISOString()
        .slice(0, 10);
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
    expect(screen.getAllByRole("row")).toHaveLength(8);

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
});
