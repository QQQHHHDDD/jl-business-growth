import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AuthResponse } from "@/api/client";
import { AppShell } from "./navigation";

const userAuth = {
  data: {
    account: {
      id: "00000000-0000-0000-0000-000000000001",
      username: "owner",
      role: "USER",
      status: "ACTIVE",
      timezone: "Asia/Shanghai",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    },
    accounts: [
      {
        id: "00000000-0000-0000-0000-000000000001",
        username: "owner",
        role: "USER",
        status: "ACTIVE",
        timezone: "Asia/Shanghai",
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: null,
        active: true,
      },
    ],
    csrf_token: "csrf-token",
  },
  request_id: "request-1",
} as AuthResponse;

function renderShell(
  path: string,
  authResponse: AuthResponse = userAuth,
  onLogout = vi.fn(),
  admin = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onLogout,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <AppShell
            authResponse={authResponse}
            health={{ isPending: false, isSuccess: true }}
            admin={admin}
            onLogout={onLogout}
          >
            <h1>页面内容</h1>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("AppShell navigation", () => {
  it("groups user routes and automatically opens the current route group", () => {
    renderShell("/app/finance");
    expect(screen.getByRole("button", { name: "经营管理" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "规划与执行" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("link", { name: "财务" })).toHaveClass(
      "bg-brand-50",
    );
    expect(screen.getAllByRole("button", { name: "全局搜索" })).toHaveLength(2);
  });

  it("keeps user groups independently expanded and supports desktop collapse", () => {
    renderShell("/app/worklog");
    expect(screen.getByTestId("app-sidebar")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("app-sidebar-content")).toHaveClass("w-[220px]");
    fireEvent.click(screen.getByRole("button", { name: "成长与复盘" }));
    expect(screen.getByRole("button", { name: "成长与复盘" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "规划与执行" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "规划与执行" }));
    expect(screen.getByRole("button", { name: "规划与执行" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "成长与复盘" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(
      screen.getByRole("button", { name: "展开侧边栏" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar-content")).toHaveClass("w-16");
    expect(localStorage.getItem("jl-business-growth:sidebar-collapsed")).toBe(
      "true",
    );
    expect(localStorage.getItem("jl-business-growth:sidebar-expanded-groups")).toBe('["growth"]');
  });

  it("persists independent groups and restores them after rail collapse", () => {
    localStorage.setItem("jl-business-growth:sidebar-expanded-groups", '["planning","operations","growth","system"]');
    renderShell("/app");
    for (const label of ["规划与执行", "经营管理", "成长与复盘", "系统工具"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-expanded", "true");
    }
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(screen.getByRole("button", { name: "规划与执行" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "系统工具" })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the full brand name inside a shrinkable wrapping region", () => {
    renderShell("/app");
    const brand = screen.getByText("生意成长管理系统");
    expect(brand).not.toHaveClass("whitespace-nowrap");
    expect(brand.parentElement).toHaveClass("min-w-0");
    expect(screen.getByTestId("page-container")).toHaveClass("w-full");
  });

  it("exposes search and account operations in the topbar", () => {
    const onLogout = vi.fn();
    renderShell("/app", userAuth, onLogout);
    expect(
      screen.getAllByRole("button", { name: "全局搜索" }).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "全局搜索" })[0]);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByLabelText("全局搜索关键词")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "账号菜单 owner" }));
    const menu = screen.getByRole("menu", { name: "账号操作" });
    expect(
      within(menu).getByRole("menuitem", { name: "账号设置" }),
    ).toBeInTheDocument();
    expect(within(menu).getByText("切换账号")).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "退出登录" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("marks administrator roles in the account switcher", () => {
    const elevatedAuth = {
      ...userAuth,
      data: {
        ...userAuth.data,
        accounts: [
          userAuth.data.accounts[0],
          {
            ...userAuth.data.accounts[0],
            id: "00000000-0000-0000-0000-000000000002",
            username: "admin",
            role: "ADMIN",
            active: false,
          },
          {
            ...userAuth.data.accounts[0],
            id: "00000000-0000-0000-0000-000000000003",
            username: "superadmin",
            role: "SUPER_ADMIN",
            active: false,
          },
        ],
      },
    } as AuthResponse;
    renderShell("/app", elevatedAuth);
    fireEvent.click(screen.getByRole("button", { name: "账号菜单 owner" }));
    const menu = screen.getByRole("menu", { name: "账号操作" });
    expect(within(menu).getByText("普通管理员")).toBeInTheDocument();
    expect(within(menu).getByText("超级管理员")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "切换到admin（普通管理员）" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "切换到superadmin（超级管理员）" }),
    ).toBeInTheDocument();
  });

  it("keeps administrator navigation independent from user business groups", () => {
    const adminAuth = {
      ...userAuth,
      data: {
        ...userAuth.data,
        account: {
          ...userAuth.data.account,
          id: "00000000-0000-0000-0000-000000000002",
          username: "admin",
          role: "ADMIN",
        },
        accounts: [],
      },
    } as AuthResponse;
    renderShell("/admin/users", adminAuth, vi.fn(), true);
    expect(
      screen.getByRole("navigation", { name: "管理员导航" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "规划与执行" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "管理员管理" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "全局搜索" }),
    ).not.toBeInTheDocument();
  });
});
