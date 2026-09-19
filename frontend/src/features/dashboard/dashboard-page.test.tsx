import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Account, AuthResponse, DashboardResponse } from "@/api/client";
import { businessDate } from "@/lib/date";
import { DashboardPage } from "./dashboard-page";

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

afterEach(() => vi.unstubAllGlobals());

describe("DashboardPage", () => {
  it("shows plans, goals, weekly operations and compact real summaries", async () => {
    const date = businessDate(account.timezone);
    const response = {
      data: {
        date,
        today: {
          from: date,
          to: date,
          worklogs: {
            open_conversation_count: 1,
            deep_conversation_count: 2,
            buffer_count: 3,
            story_share_count: 0,
            screening_count: 0,
            opportunity_count: 0,
            meeting_count: 1,
            customer_followup_count: 0,
            reading_minutes: 10,
            audio_minutes: 5,
          },
          turnover: { pv: 100, net_amount: "1250.00" },
        },
        week: {
          from: date,
          to: date,
          worklogs: {
            open_conversation_count: 42,
            deep_conversation_count: 16,
            buffer_count: 8,
            story_share_count: 4,
            screening_count: 3,
            opportunity_count: 2,
            meeting_count: 3,
            customer_followup_count: 5,
            reading_minutes: 120,
            audio_minutes: 65,
          },
          turnover: { pv: 1200, net_amount: "15000.00" },
        },
        month: {
          from: date,
          to: date,
          worklogs: {
            open_conversation_count: 80,
            deep_conversation_count: 30,
            buffer_count: 12,
            story_share_count: 8,
            screening_count: 6,
            opportunity_count: 4,
            meeting_count: 7,
            customer_followup_count: 9,
            reading_minutes: 200,
            audio_minutes: 100,
          },
          turnover: { pv: 2500, net_amount: "31250.00" },
        },
        active_goals: Array.from({ length: 6 }, (_, index) => ({
            id: `00000000-0000-0000-0000-00000000001${index}`,
            title: index === 0 ? "本月会面" : `目标 ${index + 1}`,
            progress: 0.75,
            metrics: [{ id: "metric-1" }],
          })),
        dreams_count: 2,
        upcoming_events: Array.from({ length: 6 }, (_, index) => ({
            id: `00000000-0000-0000-0000-00000000002${index}`,
            title: index === 0 ? "客户会面" : `日程 ${index + 1}`,
            start_at: `${date}T06:00:00Z`,
            end_at: `${date}T07:00:00Z`,
          })),
        team_summary: { total_members: 27, active_members: 24 },
        learning_summary: { reading_minutes: 120, audio_minutes: 65 },
        finance_summary: {
          income: "20000.00",
          expense: "8000.00",
          net_cash_flow: "12000.00",
        },
      },
      request_id: "request-2",
    } as unknown as DashboardResponse;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), { status: 200 }),
        ),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DashboardPage account={account} authResponse={authResponse} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: /owner/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("客户会面")).toBeInTheDocument();
    expect(screen.getByText("本月会面")).toBeInTheDocument();
    expect(screen.getByText("日程 6")).toBeInTheDocument();
    expect(screen.getByText("目标 6")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-today-scroll")).toHaveClass("h-[216px]", "overflow-y-auto");
    expect(screen.getByTestId("dashboard-goals-scroll")).toHaveClass("h-[216px]", "overflow-y-auto");
    expect(screen.getAllByRole("link", { name: /查看全部/ })).toHaveLength(2);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("24 位活跃")).toBeInTheDocument();
    expect(screen.getByText("185 分钟")).toBeInTheDocument();
    expect(screen.getByText("¥12000.00")).toBeInTheDocument();
    expect(screen.queryByText("快速入口")).not.toBeInTheDocument();
    expect(screen.queryByText("浏览器账号")).not.toBeInTheDocument();
    expect(screen.queryByText("梦想数量")).not.toBeInTheDocument();
  });
});
