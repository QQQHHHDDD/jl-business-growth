import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { getReview } from "@/api/client";
import { ReviewsPage } from "./reviews-page";

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), getReview: vi.fn(), saveReview: vi.fn() }));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getReview).mockImplementation(async (type, period) => ({ data: { id: null, type, period_start: period, good: "坚持行动", problems: "节奏不稳", improvements: "固定时间", next_focus: "会面", summary: "真实复盘", totals: { worklog_action_count: 12, turnover_pv: 100, turnover_net_amount: "1250.00" } }, request_id: "2" })); });

describe("ReviewsPage", () => {
  it("integrates period metrics and review fields behind daily weekly monthly tabs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ReviewsPage authResponse={authResponse} /></QueryClientProvider>);
    expect(await screen.findByRole("tab", { name: "每日" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByText("12", { exact: true })).toBeVisible();
    expect(screen.getByLabelText("做得好的地方")).toHaveValue("坚持行动");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "每周" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "每周" })).toHaveAttribute("data-state", "active");
    expect(await screen.findByRole("heading", { name: "最近周期" })).toBeVisible();
  });
});
