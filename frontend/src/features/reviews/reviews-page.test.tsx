import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { getReview, listReviews, listWorklogs } from "@/api/client";
import { ReviewsPage } from "./reviews-page";

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), getReview: vi.fn(), listReviews: vi.fn(), listWorklogs: vi.fn(), saveReview: vi.fn() }));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getReview).mockImplementation(async (type, period) => ({ data: { id: null, type, period_start: period, good: "坚持行动", problems: "节奏不稳", improvements: "固定时间", next_focus: "会面", summary: "真实复盘", totals: { worklog_action_count: 12, turnover_pv: 100, turnover_net_amount: "1250.00" } }, request_id: "2" }));
  vi.mocked(listReviews).mockResolvedValue({ data: { items: [{ id: "00000000-0000-0000-0000-000000000002", type: "WEEKLY", period_start: "2026-09-14", good: "", problems: "", improvements: "", next_focus: "", summary: null, created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-15T00:00:00Z", totals: { worklog_action_count: 12, turnover_pv: 100, turnover_net_amount: "1250.00" } }] }, request_id: "3" });
  vi.mocked(listWorklogs).mockResolvedValue({ data: { items: [{ id: "00000000-0000-0000-0000-000000000003", work_date: "2026-09-14", open_conversation_count: 10, deep_conversation_count: 8, buffer_count: 6, story_share_count: 4, screening_count: 3, opportunity_count: 2, meeting_count: 1, customer_followup_count: 1, reading_minutes: 0, audio_minutes: 0, turnover_pv: null, turnover_net_amount: null, note: null, created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z" }] }, request_id: "4" });
});

describe("ReviewsPage", () => {
  it("integrates period metrics and review fields behind daily weekly monthly tabs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ReviewsPage authResponse={authResponse} /></QueryClientProvider>);
    expect(await screen.findByRole("tab", { name: "每日" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByText("12", { exact: true })).toBeVisible();
    expect(screen.getByLabelText("做得好的地方")).toHaveValue("坚持行动");
    expect(screen.getByLabelText("复盘日期")).toBeVisible();
    expect(screen.getByLabelText("明日重点")).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "每周" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "每周" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByRole("heading", { name: "最近保存" })).toBeVisible();
    expect(screen.getByLabelText("本周开始日期")).toBeVisible();
    expect(await screen.findByText("开启 10 · 深入 8 · 分享 4 · 筛选 3 · 会面 1")).toBeVisible();
    expect(screen.getByRole("button", { name: /2026-09-14/ })).toBeVisible();
  });
});
