import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { listIncomeSimulations } from "@/api/client";
import { IncomePage } from "./income-page";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()), listIncomeSimulations: vi.fn(), calculateIncome: vi.fn(), saveIncomeSimulation: vi.fn(), duplicateIncomeSimulation: vi.fn(), deleteIncomeSimulation: vi.fn(), compareIncomeSimulations: vi.fn(),
}));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;

beforeEach(() => { vi.clearAllMocks(); vi.mocked(listIncomeSimulations).mockResolvedValue({ data: { items: [] }, request_id: "2" }); });

describe("IncomePage", () => {
  it("separates simulator, saved plans, and comparison with a responsive result panel", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><IncomePage authResponse={authResponse} /></QueryClientProvider>);
    expect(await screen.findByRole("tab", { name: "模拟器" })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("income-results")).toHaveClass("xl:sticky");
    expect(screen.getByRole("heading", { name: "1. 基础数据" })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "保存方案" }), { button: 0 });
    expect(screen.getByRole("heading", { name: "已保存方案" })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "方案比较" }), { button: 0 });
    expect(screen.getByRole("heading", { name: "方案比较" })).toBeVisible();
  });
});
