import { afterEach, describe, expect, it, vi } from "vitest";
import { getMe, login, unlinkAccount, updateTimezone } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("treats an unauthenticated session as an expected state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "authentication required" } }), { status: 401 })));

    await expect(getMe()).resolves.toBeNull();
  });

  it("keeps JSON content type while adding CSRF headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "00000000-0000-0000-0000-000000000001" }, request_id: "request-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateTimezone("csrf-token", "Asia/Shanghai");

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toEqual({ "Content-Type": "application/json", "X-CSRF-Token": "csrf-token" });
    expect(request.method).toBe("PATCH");
    expect(request.body).toBe(JSON.stringify({ timezone: "Asia/Shanghai" }));
  });

  it("sends login credentials as a JSON request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { account: { username: "owner" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await login("owner", "correct horse battery");

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe("POST");
    expect(request.body).toBe(JSON.stringify({ username: "owner", password: "correct horse battery" }));
  });

  it("uses a CSRF-protected delete for unlinking a browser account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await unlinkAccount("csrf-token", "account/1");

    const [path, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/auth/accounts/account%2F1");
    expect(request.method).toBe("DELETE");
    expect(request.headers).toEqual({ "Content-Type": "application/json", "X-CSRF-Token": "csrf-token" });
  });
});
