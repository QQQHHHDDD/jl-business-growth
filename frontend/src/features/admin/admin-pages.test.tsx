import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { listInvitations } from "@/api/client";
import { AdminInvitationsPage } from "./admin-pages";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  listInvitations: vi.fn(),
}));

const account = { id: "00000000-0000-0000-0000-000000000001", username: "admin", role: "ADMIN", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "request-1" } as AuthResponse;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminInvitationsPage authResponse={authResponse} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listInvitations).mockResolvedValue({ data: { items: [
    { id: "00000000-0000-0000-0000-000000000010", code: "WELCOME1", status: "ACTIVE", max_uses: 1, used_count: 0, expires_at: null, created_at: "2026-09-20T00:00:00Z" },
    { id: "00000000-0000-0000-0000-000000000011", code: "USED001", status: "DISABLED", max_uses: 1, used_count: 1, expires_at: null, created_at: "2026-09-19T00:00:00Z" },
  ] }, request_id: "request-2" });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("AdminInvitationsPage", () => {
  it("formats usage limits, copies codes, and marks exhausted invitations", async () => {
    renderPage();
    expect(await screen.findByText("0/1 次")).toBeVisible();
    expect(screen.getByText("1/1 次")).toBeVisible();
    expect(screen.getByText("已用完")).toBeVisible();
    expect(screen.queryByText("0 次 / 1 次")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制邀请码 WELCOME1" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("WELCOME1"));
    expect(screen.getByRole("button", { name: "删除邀请码 USED001" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "启用" })).not.toBeInTheDocument();
  });

  it("falls back to a user-initiated copy command when Clipboard API is unavailable", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("insecure context"));
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "复制邀请码 WELCOME1" }));
    await waitFor(() => expect(screen.getByText("邀请码已复制。")).toBeVisible());
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.body.querySelector("textarea")).toBeNull();
  });
});
