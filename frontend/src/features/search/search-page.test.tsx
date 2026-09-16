import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { searchRecords } from "@/api/client";
import { SearchOverlay, SearchPage } from "./search-page";

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), searchRecords: vi.fn() }));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;

function Harness() { const [open, setOpen] = useState(true); const location = useLocation(); return <><SearchOverlay authResponse={authResponse} open={open} onOpenChange={setOpen} /><output aria-label="当前位置">{location.pathname}{location.search}</output></>; }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(searchRecords).mockResolvedValue({ data: { items: [{ module: "goals", id: "00000000-0000-0000-0000-000000000002", title: "年度会面目标", snippet: "持续推进", updated_at: "2026-09-16T00:00:00Z", score: 1 }] }, meta: { page: 1, page_size: 8, total: 1 }, request_id: "2" }); });

describe("SearchOverlay", () => {
  it("loads grouped results and supports keyboard selection", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><Harness /></QueryClientProvider></MemoryRouter>);
    const input = screen.getByLabelText("全局搜索关键词");
    fireEvent.change(input, { target: { value: "会面" } });
    expect(await screen.findByText("年度会面目标")).toBeVisible();
    expect(screen.getByText("目标", { exact: true })).toBeVisible();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("当前位置")).toHaveTextContent("/app/goals?goal=00000000-0000-0000-0000-000000000002");
  });

  it.each(["钱", "P"])("searches a single-character query %s", async (query) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><Harness /></QueryClientProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("全局搜索关键词"), { target: { value: query } });
    await screen.findByText("年度会面目标");
    expect(searchRecords).toHaveBeenCalledWith(query, [], 1, 8);
  });

  it("does not search an empty overlay query", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><Harness /></QueryClientProvider></MemoryRouter>);
    expect(screen.getByPlaceholderText("输入至少 1 个字符")).toBeVisible();
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(searchRecords).not.toHaveBeenCalled();
  });

  it("uses the same one-character rule on the full search page", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><SearchPage authResponse={authResponse} /></QueryClientProvider></MemoryRouter>);
    const input = screen.getByLabelText("搜索关键词");
    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "钱" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(await screen.findByText("年度会面目标")).toBeVisible();
    expect(searchRecords).toHaveBeenCalledWith("钱", ["goals", "calendar", "team", "knowledge", "tags"]);
  });
});
