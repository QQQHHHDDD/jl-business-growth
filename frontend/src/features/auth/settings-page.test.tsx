import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { SettingsPage } from "./settings-page";

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), changePassword: vi.fn(), updateTimezone: vi.fn(), deleteCurrentAccount: vi.fn() }));
const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;

describe("SettingsPage", () => {
  it("separates account preferences and destructive data operations", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><SettingsPage account={account} authResponse={authResponse} /></QueryClientProvider></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "账号" })).toHaveAttribute("data-state", "active");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "偏好" }), { button: 0 });
    expect(screen.getByLabelText("IANA 时区")).toHaveValue("Asia/Shanghai");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "数据与安全" }), { button: 0 });
    expect(screen.getByRole("link", { name: "打开数据导出" })).toHaveAttribute("href", "/app/data");
    expect(screen.getByRole("button", { name: "永久删除账户" })).toBeVisible();
  });

  it("does not allow an arbitrary timezone to be saved", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><SettingsPage account={account} authResponse={authResponse} /></QueryClientProvider></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "偏好" }), { button: 0 });
    fireEvent.change(screen.getByRole("combobox", { name: "IANA 时区" }), { target: { value: "Mars/Olympus" } });
    expect(screen.getByText("请从列表中选择有效的 IANA 时区")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存时区" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "IANA 时区" }), { target: { value: "America/New_York" } });
    expect(screen.getByRole("button", { name: "保存时区" })).toBeEnabled();
  });
});
