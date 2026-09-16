import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("shows the system name and a successful API health state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "UNAUTHENTICATED",
                  message: "authentication required",
                },
                request_id: "request-2",
              }),
              { status: 401 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { status: "ok", checks: {} },
              request_id: "request-1",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();

    expect(
      screen.getByRole("heading", { name: "JL团队生意成长管理系统" }),
    ).toBeInTheDocument();
    await screen.findByRole("heading", { name: "登录系统" });
    expect(screen.queryByText("API 可用")).not.toBeInTheDocument();
  });

  it("switches between login and registration shells", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "UNAUTHENTICATED",
                  message: "authentication required",
                },
              }),
              { status: 401 },
            ),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { status: "ok", checks: {} },
              request_id: "request-1",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();

    await screen.findByRole("heading", { name: "登录系统" });
    fireEvent.click(
      screen.getByRole("link", { name: "首次使用？注册普通用户" }),
    );
    expect(
      await screen.findByRole("heading", { name: "注册普通用户" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "已有账号？返回登录" }));
    expect(
      await screen.findByRole("heading", { name: "登录系统" }),
    ).toBeInTheDocument();
  });

  it("shows the authenticated shell after a successful login", async () => {
    const account = {
      id: "00000000-0000-0000-0000-000000000001",
      username: "owner",
      role: "USER",
      status: "ACTIVE",
      timezone: "Asia/Shanghai",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    };
    const authResponse = {
      data: {
        account,
        accounts: [{ ...account, active: true }],
        csrf_token: "csrf-token",
      },
      request_id: "request-2",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "UNAUTHENTICATED",
                  message: "authentication required",
                },
              }),
              { status: 401 },
            ),
          );
        if (path.endsWith("/api/health/live"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: { status: "ok", checks: {} },
                request_id: "request-1",
              }),
              { status: 200 },
            ),
          );
        if (path.endsWith("/api/auth/login") && init?.method === "POST")
          return Promise.resolve(
            new Response(JSON.stringify(authResponse), { status: 200 }),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { items: [] },
              meta: { page: 1, page_size: 20, total: 0 },
              request_id: "request-3",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();
    fireEvent.change(await screen.findByLabelText("账号"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /owner/ }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "账号菜单 owner" }));
    expect(
      screen.getByRole("menuitem", { name: "账号设置" }),
    ).toBeInTheDocument();
  });

  it("returns to the login shell after logout", async () => {
    const account = {
      id: "00000000-0000-0000-0000-000000000001",
      username: "owner",
      role: "USER",
      status: "ACTIVE",
      timezone: "Asia/Shanghai",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    };
    const authResponse = {
      data: {
        account,
        accounts: [{ ...account, active: true }],
        csrf_token: "csrf-token",
      },
      request_id: "request-2",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "UNAUTHENTICATED",
                  message: "authentication required",
                },
              }),
              { status: 401 },
            ),
          );
        if (path.endsWith("/api/health/live"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: { status: "ok", checks: {} },
                request_id: "request-1",
              }),
              { status: 200 },
            ),
          );
        if (path.endsWith("/api/auth/login") && init?.method === "POST")
          return Promise.resolve(
            new Response(JSON.stringify(authResponse), { status: 200 }),
          );
        if (path.endsWith("/api/auth/logout") && init?.method === "POST")
          return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { items: [] },
              meta: { page: 1, page_size: 20, total: 0 },
              request_id: "request-3",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();
    fireEvent.change(await screen.findByLabelText("账号"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /owner/ }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "账号菜单 owner" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "登录系统" }),
      ).toBeInTheDocument(),
    );
  });

  it("returns to the login shell after changing the password", async () => {
    const account = {
      id: "00000000-0000-0000-0000-000000000001",
      username: "owner",
      role: "USER",
      status: "ACTIVE",
      timezone: "Asia/Shanghai",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    };
    const authResponse = {
      data: {
        account,
        accounts: [{ ...account, active: true }],
        csrf_token: "csrf-token",
      },
      request_id: "request-2",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "UNAUTHENTICATED",
                  message: "authentication required",
                },
              }),
              { status: 401 },
            ),
          );
        if (path.endsWith("/api/health/live"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: { status: "ok", checks: {} },
                request_id: "request-1",
              }),
              { status: 200 },
            ),
          );
        if (path.endsWith("/api/auth/login") && init?.method === "POST")
          return Promise.resolve(
            new Response(JSON.stringify(authResponse), { status: 200 }),
          );
        if (
          path.endsWith("/api/auth/change-password") &&
          init?.method === "POST"
        )
          return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { items: [] },
              meta: { page: 1, page_size: 20, total: 0 },
              request_id: "request-3",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();
    fireEvent.change(await screen.findByLabelText("账号"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /owner/ }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "账号菜单 owner" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "账号设置" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "账号设置" }),
      ).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new correct password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存密码" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "登录系统" }),
      ).toBeInTheDocument(),
    );
  });

  it("redirects a normal user away from administrator routes", async () => {
    const account = {
      id: "00000000-0000-0000-0000-000000000001",
      username: "owner",
      role: "USER",
      status: "ACTIVE",
      timezone: "Asia/Shanghai",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    };
    const authResponse = {
      data: {
        account,
        accounts: [{ ...account, active: true }],
        csrf_token: "csrf-token",
      },
      request_id: "request-2",
    };
    window.history.replaceState(null, "", "/admin/users");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(JSON.stringify(authResponse), { status: 200 }),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { status: "ok", checks: {} },
              request_id: "request-1",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /owner/ }),
      ).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe("/app");
    expect(
      screen.queryByRole("navigation", { name: "管理员导航" }),
    ).not.toBeInTheDocument();
  });

  it("redirects an ordinary administrator away from the super administrator route", async () => {
    const account = {
      id: "00000000-0000-0000-0000-000000000002",
      username: "admin",
      role: "ADMIN",
      status: "ACTIVE",
      timezone: "Asia/Shanghai",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    };
    const authResponse = {
      data: {
        account,
        accounts: [{ ...account, active: true }],
        csrf_token: "csrf-token",
      },
      request_id: "request-2",
    };
    window.history.replaceState(null, "", "/admin/admins");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(JSON.stringify(authResponse), { status: 200 }),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { status: "ok", checks: {} },
              request_id: "request-1",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "管理员工作台" }),
      ).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe("/admin");
    expect(
      screen.queryByRole("link", { name: "管理员管理" }),
    ).not.toBeInTheDocument();
  });

  it("redirects an administrator away from ordinary user business routes", async () => {
    const account = {
      id: "00000000-0000-0000-0000-000000000003",
      username: "admin",
      role: "ADMIN",
      status: "ACTIVE",
      timezone: "Asia/Shanghai",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    };
    const authResponse = {
      data: {
        account,
        accounts: [{ ...account, active: true }],
        csrf_token: "csrf-token",
      },
      request_id: "request-2",
    };
    window.history.replaceState(null, "", "/app/worklog");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(JSON.stringify(authResponse), { status: 200 }),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { status: "ok", checks: {} },
              request_id: "request-1",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "管理员工作台" }),
      ).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe("/admin");
  });

  it("returns an unauthenticated unknown route to login", async () => {
    window.history.replaceState(null, "", "/not-a-route");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "UNAUTHENTICATED",
                  message: "authentication required",
                },
              }),
              { status: 401 },
            ),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { status: "ok", checks: {} },
              request_id: "request-1",
            }),
            { status: 200 },
          ),
        );
      }),
    );

    renderApp();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "登录系统" }),
      ).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe("/login");
  });
});
