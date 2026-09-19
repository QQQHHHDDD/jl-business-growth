import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiError, switchAccount, type AuthResponse } from "@/api/client";
import { AccountMenu } from "./account-menu";

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, switchAccount: vi.fn() };
});

const primaryAccount = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "owner",
  role: "USER" as const,
  status: "ACTIVE" as const,
  timezone: "Asia/Shanghai",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
};
const linkedAccount = {
  ...primaryAccount,
  id: "00000000-0000-0000-0000-000000000002",
  username: "linked",
};
const authResponse = {
  data: {
    account: primaryAccount,
    accounts: [
      { ...primaryAccount, active: true },
      { ...linkedAccount, active: false },
    ],
    csrf_token: "csrf-token",
  },
  request_id: "request-1",
} as AuthResponse;
const switchedResponse = {
  ...authResponse,
  data: {
    ...authResponse.data,
    account: linkedAccount,
    accounts: [
      { ...primaryAccount, active: false },
      { ...linkedAccount, active: true },
    ],
  },
} as AuthResponse;

function renderMenu() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AccountMenu authResponse={authResponse} onLogout={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function openMenuAndSwitch() {
  fireEvent.click(screen.getByRole("button", { name: "账号菜单 owner" }));
  const menu = screen.getByRole("menu", { name: "账号操作" });
  fireEvent.click(within(menu).getByRole("menuitem", { name: "切换到linked（普通用户）" }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("AccountMenu account switching", () => {
  it.each([401, 403, 404])("keeps a visible error in the open menu after a %s response", async (status) => {
    vi.mocked(switchAccount).mockRejectedValueOnce(new ApiError(status, "SWITCH_FAILED", "switch failed"));
    renderMenu();

    openMenuAndSwitch();

    expect(await screen.findByRole("alert")).toHaveTextContent("该账号关联已失效，已从浏览器列表移除。");
    expect(screen.getByRole("menu", { name: "账号操作" })).toBeVisible();
  });

  it("closes the menu and updates the auth cache after a successful switch", async () => {
    vi.mocked(switchAccount).mockResolvedValueOnce(switchedResponse);
    const { queryClient } = renderMenu();

    openMenuAndSwitch();

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "账号操作" })).not.toBeInTheDocument();
    });
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(switchedResponse);
  });
});
