import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AnalyticsResponse, AuthResponse } from "@/api/client";
import { getAnalytics, getFinanceAnalytics, getTeamAnalytics } from "@/api/client";
import { AnalyticsPage } from "./analytics-page";

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), getAnalytics: vi.fn(), getFinanceAnalytics: vi.fn(), getTeamAnalytics: vi.fn() }));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;
const bucket = { period: "2026-09-16", action_count: 12, open_conversation_count: 8, deep_conversation_count: 6, buffer_count: 5, story_share_count: 4, screening_count: 3, opportunity_count: 2, meeting_count: 1, customer_followup_count: 1, reading_minutes: 30, audio_minutes: 20, pv: 100, net_amount: "1250.00", income_amount: "2000.00", expense_amount: "500.00", net_cash_flow: "1500.00", member_count: 5, active_member_count: 4, goal_count: 3, completed_count: 1 };
const response = { data: { metric: "worklogs", from: "2026-09-14", to: "2026-09-20", granularity: "day", current_member_count: 5, current_active_member_count: 4, snapshot_count: 1, buckets: [bucket] }, request_id: "2" } as AnalyticsResponse;

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAnalytics).mockResolvedValue(response); vi.mocked(getFinanceAnalytics).mockResolvedValue(response); vi.mocked(getTeamAnalytics).mockResolvedValue(response); });

describe("AnalyticsPage", () => {
  it("switches domains and time ranges while showing KPI trend and details", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AnalyticsPage authResponse={authResponse} /></QueryClientProvider>);
    expect(await screen.findByRole("tab", { name: "工作量" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByRole("heading", { name: "工作量趋势" })).toBeVisible();
    expect(screen.getByText("当前只有 1 个统计周期，数据不足以形成趋势。")).toBeVisible();
    expect(screen.getAllByText("开启对话").length).toBeGreaterThan(0);
    expect(screen.getByRole("table")).toBeVisible();
    const toolbar = screen.getByTestId("analytics-range-toolbar");
    const condition = screen.getByTestId("analytics-range-condition");
    expect(toolbar).toHaveClass("min-h-[76px]");
    expect(condition).toHaveClass("min-h-10");
    expect(condition).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    expect(screen.getByLabelText("开始日期")).toBeVisible();
    expect(screen.getByTestId("analytics-range-toolbar")).toBe(toolbar);
    expect(screen.getByTestId("analytics-range-condition")).toBe(condition);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "财务" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "财务" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByRole("heading", { name: "财务趋势" })).toBeVisible();
  });

  it("offers separate natural and fiscal year ranges", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AnalyticsPage authResponse={authResponse} /></QueryClientProvider>);
    await screen.findByRole("heading", { name: "工作量趋势" });
    fireEvent.click(screen.getByRole("button", { name: "自然年" }));
    expect(screen.getByRole("button", { name: "自然年" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "财年" }));
    expect(screen.getByRole("button", { name: "财年" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not draw a team trend when there are no snapshots", async () => {
    vi.mocked(getTeamAnalytics).mockResolvedValue({ ...response, data: { ...response.data, metric: "team", snapshot_count: 0, buckets: [] } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AnalyticsPage authResponse={authResponse} /></QueryClientProvider>);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "团队" }), { button: 0 });
    expect(await screen.findByText("所选周期暂无团队快照")).toBeVisible();
    expect(screen.getByText("当前成员数")).toBeVisible();
    expect(screen.queryByLabelText("团队趋势图")).not.toBeInTheDocument();
  });

  it("draws a real trend when at least two periods exist", async () => {
    vi.mocked(getAnalytics).mockResolvedValue({ ...response, data: { ...response.data, buckets: [bucket, { ...bucket, period: "2026-09-17", open_conversation_count: 10 }] } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AnalyticsPage authResponse={authResponse} /></QueryClientProvider>);
    expect(await screen.findByLabelText("工作量趋势图")).toBeVisible();
  });
});
