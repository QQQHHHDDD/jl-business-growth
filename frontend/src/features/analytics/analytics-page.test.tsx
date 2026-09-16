import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AnalyticsResponse, AuthResponse } from "@/api/client";
import { getAnalytics, getFinanceAnalytics, getTeamAnalytics } from "@/api/client";
import { AnalyticsPage } from "./analytics-page";

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), getAnalytics: vi.fn(), getFinanceAnalytics: vi.fn(), getTeamAnalytics: vi.fn() }));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;
const response = { data: { metric: "worklogs", from: "2026-09-10", to: "2026-09-17", granularity: "day", buckets: [{ period: "2026-09-16", action_count: 12, reading_minutes: 30, audio_minutes: 20, pv: 100, net_amount: "1250.00", income_amount: "2000.00", expense_amount: "500.00", net_cash_flow: "1500.00", member_count: 5, active_member_count: 4, goal_count: 3, completed_count: 1 }] }, request_id: "2" } as AnalyticsResponse;

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAnalytics).mockResolvedValue(response); vi.mocked(getFinanceAnalytics).mockResolvedValue(response); vi.mocked(getTeamAnalytics).mockResolvedValue(response); });

describe("AnalyticsPage", () => {
  it("switches domains and time ranges while showing KPI trend and details", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AnalyticsPage authResponse={authResponse} /></QueryClientProvider>);
    expect(await screen.findByRole("tab", { name: "工作量" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByRole("heading", { name: "工作量趋势" })).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    expect(screen.getByLabelText("开始日期")).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "财务" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "财务" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByRole("heading", { name: "财务趋势" })).toBeVisible();
  });
});
