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
});

describe("App", () => {
  it("shows the system name and a successful API health state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/api/auth/me")) {
          return Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "authentication required" }, request_id: "request-2" }), { status: 401 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ data: { status: "ok", checks: {} }, request_id: "request-1" }), { status: 200 }));
      }),
    );

    renderApp();

    expect(screen.getByRole("heading", { name: "JL团队生意成长管理系统" })).toBeInTheDocument();
    expect(await screen.findByText("API 可用")).toBeInTheDocument();
  });

  it("shows the authenticated shell after a successful login", async () => {
    const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null };
    const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf-token" }, request_id: "request-2" };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "authentication required" } }), { status: 401 }));
      if (path.endsWith("/api/health/live")) return Promise.resolve(new Response(JSON.stringify({ data: { status: "ok", checks: {} }, request_id: "request-1" }), { status: 200 }));
      if (path.endsWith("/api/auth/login") && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify(authResponse), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ data: { items: [] }, meta: { page: 1, page_size: 20, total: 0 }, request_id: "request-3" }), { status: 200 }));
    }));

    renderApp();
    fireEvent.change(await screen.findByLabelText("账号"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct horse battery" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "owner" })).toBeInTheDocument());
    expect(screen.getByText("账号设置")).toBeInTheDocument();
  });

  it("returns to the login shell after logout", async () => {
    const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null };
    const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf-token" }, request_id: "request-2" };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "authentication required" } }), { status: 401 }));
      if (path.endsWith("/api/health/live")) return Promise.resolve(new Response(JSON.stringify({ data: { status: "ok", checks: {} }, request_id: "request-1" }), { status: 200 }));
      if (path.endsWith("/api/auth/login") && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify(authResponse), { status: 200 }));
      if (path.endsWith("/api/auth/logout") && init?.method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ data: { items: [] }, meta: { page: 1, page_size: 20, total: 0 }, request_id: "request-3" }), { status: 200 }));
    }));

    renderApp();
    fireEvent.change(await screen.findByLabelText("账号"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct horse battery" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "owner" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "登录系统" })).toBeInTheDocument());
  });

  it("returns to the login shell after changing the password", async () => {
    const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null };
    const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf-token" }, request_id: "request-2" };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/auth/me")) return Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "authentication required" } }), { status: 401 }));
      if (path.endsWith("/api/health/live")) return Promise.resolve(new Response(JSON.stringify({ data: { status: "ok", checks: {} }, request_id: "request-1" }), { status: 200 }));
      if (path.endsWith("/api/auth/login") && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify(authResponse), { status: 200 }));
      if (path.endsWith("/api/auth/change-password") && init?.method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ data: { items: [] }, meta: { page: 1, page_size: 20, total: 0 }, request_id: "request-3" }), { status: 200 }));
    }));

    renderApp();
    fireEvent.change(await screen.findByLabelText("账号"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct horse battery" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "owner" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("当前密码"), { target: { value: "correct horse battery" } });
    fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "new correct password" } });
    fireEvent.click(screen.getByRole("button", { name: "保存密码" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "登录系统" })).toBeInTheDocument());
  });
});
