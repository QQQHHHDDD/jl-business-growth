import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { searchRecords } from "@/api/client";
import { SearchOverlay } from "./search-page";

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), searchRecords: vi.fn() }));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;

function Harness() { const [open, setOpen] = useState(true); return <SearchOverlay authResponse={authResponse} open={open} onOpenChange={setOpen} />; }
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
  });
});
