import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { listFinanceBudgets, listFinanceCategories, listFinanceSnapshots, listFinanceTransactions } from "@/api/client";
import { FinancePage } from "./finance-page";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  listFinanceCategories: vi.fn(),
  listFinanceTransactions: vi.fn(),
  listFinanceBudgets: vi.fn(),
  listFinanceSnapshots: vi.fn(),
  saveFinanceTransaction: vi.fn(),
  createFinanceCategory: vi.fn(),
  archiveFinanceCategory: vi.fn(),
  saveFinanceBudget: vi.fn(),
  saveFinanceSnapshot: vi.fn(),
}));

const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "request-1" } as AuthResponse;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FinancePage authResponse={authResponse} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFinanceCategories).mockResolvedValue({ data: { items: [{ id: "00000000-0000-0000-0000-000000000002", type: "EXPENSE", name: "交通", archived_at: null, system_default: true }] }, request_id: "2" });
  vi.mocked(listFinanceTransactions).mockResolvedValue({ data: { items: [{ id: "00000000-0000-0000-0000-000000000003", occurred_on: "2026-09-16", type: "EXPENSE", category_id: "00000000-0000-0000-0000-000000000002", amount: "88.00", description: "出行", note: null, source: "MANUAL", created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" }] }, request_id: "3" });
  vi.mocked(listFinanceBudgets).mockResolvedValue({ data: { items: [] }, request_id: "4" });
  vi.mocked(listFinanceSnapshots).mockResolvedValue({ data: { items: [] }, request_id: "5" });
});

describe("FinancePage", () => {
  it("keeps the overview visible while budgets are loading", async () => {
    let resolveBudgets!: (value: Awaited<ReturnType<typeof listFinanceBudgets>>) => void;
    vi.mocked(listFinanceBudgets).mockImplementationOnce(() => new Promise((resolve) => { resolveBudgets = resolve; }));
    renderPage();

    expect(await screen.findByText("本月收入")).toBeVisible();
    expect(screen.getByTestId("finance-budget-loading")).toBeVisible();
    expect(screen.queryByText("本月还没有预算")).not.toBeInTheDocument();
    resolveBudgets({ data: { items: [] }, request_id: "budget-loaded" });

    expect(await screen.findByText("本月还没有预算")).toBeVisible();
    await waitFor(() => expect(listFinanceBudgets).toHaveBeenCalledTimes(1));
  });

  it("separates finance views and opens transaction entry in a centered dialog", async () => {
    renderPage();
    expect(await screen.findByRole("tab", { name: "总览" })).toHaveAttribute("data-state", "active");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "流水" }), { button: 0 });
    expect(screen.getByRole("heading", { name: "流水列表" })).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "新增流水" })[0]);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveClass("left-1/2", "top-1/2");
    expect(screen.getByRole("heading", { name: "新增财务流水" })).toBeVisible();
    expect(screen.getByLabelText("发生日期")).toBeRequired();
    expect(screen.getByLabelText("类型")).toBeRequired();
    expect(screen.getByLabelText("分类", { exact: true })).toBeVisible();
    expect(screen.getByLabelText("分类", { exact: true })).toBeRequired();
    expect(screen.getByLabelText("金额")).toBeRequired();
  });

  it("exposes category management as a descriptive full-row disclosure", async () => {
    renderPage();
    const trigger = await screen.findByText("管理收支分类");
    expect(screen.getByText("新增自定义分类，或归档不再使用的分类。")).toBeVisible();
    const disclosure = trigger.closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(trigger.closest("summary")!);
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByLabelText("分类名称")).toBeVisible();
  });
});
