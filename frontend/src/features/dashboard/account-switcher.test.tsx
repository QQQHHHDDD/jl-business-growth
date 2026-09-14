import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "@/api/client";
import { AccountSwitcher } from "./account-switcher";

const firstAccount = { id: "00000000-0000-0000-0000-000000000001", username: "first", role: "USER" as const, status: "ACTIVE" as const, timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null };
const secondAccount = { ...firstAccount, id: "00000000-0000-0000-0000-000000000002", username: "second" };
const authResponse: AuthResponse = { data: { account: firstAccount, accounts: [{ ...firstAccount, active: true }, { ...secondAccount, active: false }], csrf_token: "csrf-token" }, request_id: "request-1" };

describe("AccountSwitcher", () => {
  it("clears user query data before switching to another account", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["user", secondAccount.id, "private-record"], { secret: true });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes(`/api/auth/accounts/${secondAccount.id}/switch`)) {
        return Promise.resolve(new Response(JSON.stringify({ ...authResponse, data: { ...authResponse.data, account: secondAccount, accounts: [{ ...firstAccount, active: false }, { ...secondAccount, active: true }] } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: { status: "ok", checks: {} }, request_id: "request-2" }), { status: 200 }));
    }));

    render(<QueryClientProvider client={queryClient}><AccountSwitcher authResponse={authResponse} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "切换" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已切换当前账号"));
    expect(queryClient.getQueryData(["user", secondAccount.id, "private-record"])).toBeUndefined();
    expect(queryClient.getQueryData<AuthResponse>(["auth", "me"])?.data.account.username).toBe("second");
  });
});
