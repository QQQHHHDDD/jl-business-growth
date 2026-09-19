import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse, ReleaseData, ReleaseResponse } from "@/api/client";
import { VersionBadge } from "./version-badge";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  check: vi.fn(),
  update: vi.fn(),
  rollback: vi.fn(),
}));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  getSystemRelease: api.get,
  checkSystemRelease: api.check,
  updateSystemRelease: api.update,
  rollbackSystemRelease: api.rollback,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("VersionBadge", () => {
  it("shows a non-interactive version to USER without requesting admin data", () => {
    renderVersion("USER");
    expect(screen.getByTestId("version-badge").tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: /打开版本中心/ })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows a non-interactive version to ADMIN without requesting admin data", () => {
    renderVersion("ADMIN");
    expect(screen.getByTestId("version-badge").tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: /打开版本中心/ })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("lets SUPER_ADMIN open the version center", async () => {
    renderVersion("SUPER_ADMIN");
    fireEvent.click(screen.getByRole("button", { name: /打开版本中心/ }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(api.get).toHaveBeenCalledOnce();
  });

  it("renders the latest state", async () => {
    renderVersion("SUPER_ADMIN");
    await openCenter();
    expect(await screen.findByText("已是最新版本")).toBeVisible();
  });

  it("does not call a development build the latest formal release", async () => {
    renderVersion("SUPER_ADMIN", response({ current_version: "dev" }));
    await openCenter();
    expect(await screen.findByText("开发构建，不参与正式版本比较")).toBeVisible();
    expect(screen.queryByLabelText("已是最新版本")).not.toBeInTheDocument();
  });

  it("renders an available update", async () => {
    renderVersion("SUPER_ADMIN", response({ update_available: true, update_enabled: true, latest_release: latest("v1.0.1") }));
    await openCenter();
    expect(await screen.findByRole("button", { name: "更新到 v1.0.1" })).toBeEnabled();
  });

  it("keeps the current version visible when GitHub checking fails", async () => {
    api.get.mockRejectedValueOnce(new Error("github unavailable"));
    renderVersion("SUPER_ADMIN", undefined, false);
    await openCenter();
    expect((await screen.findAllByText("dev")).length).toBeGreaterThan(0);
    expect(screen.getByText("无法检查最新版本")).toBeVisible();
  });

  it("does not offer an update when the updater is disabled", async () => {
    renderVersion("SUPER_ADMIN", response({ update_available: true, update_enabled: false, latest_release: latest("v1.0.1") }));
    await openCenter();
    expect(await screen.findByText("当前服务器未启用在线更新")).toBeVisible();
    expect(screen.queryByRole("button", { name: "更新到 v1.0.1" })).not.toBeInTheDocument();
  });

  it("requires update confirmation before posting", async () => {
    const value = response({ update_available: true, update_enabled: true, latest_release: latest("v1.0.1") });
    api.update.mockResolvedValue(value);
    renderVersion("SUPER_ADMIN", value);
    await openCenter();
    fireEvent.click(await screen.findByRole("button", { name: "更新到 v1.0.1" }));
    expect(screen.getByText("发现新版本 v1.0.1")).toBeVisible();
    expect(api.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认更新" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("csrf-token", "v1.0.1"));
  });

  it("renders a running update stage without fake progress", async () => {
    renderVersion("SUPER_ADMIN", response({ update_status: status("verifying", "正在校验下载内容") }));
    await openCenter();
    expect(await screen.findByText("校验文件")).toBeVisible();
    expect(screen.getByText("正在校验下载内容")).toBeVisible();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("renders update success with the target version", async () => {
    renderVersion("SUPER_ADMIN", response({ update_status: status("succeeded", "更新完成") }));
    await openCenter();
    expect((await screen.findAllByText("v1.0.1")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("更新完成").length).toBeGreaterThan(0);
  });

  it("renders a safe update failure", async () => {
    renderVersion("SUPER_ADMIN", response({ update_status: status("failed", "健康检查失败，应用版本已恢复") }));
    await openCenter();
    expect(await screen.findByText("更新失败")).toBeVisible();
    expect(screen.getByText("健康检查失败，应用版本已恢复")).toBeVisible();
  });

  it("keeps an incompatible rollback disabled", async () => {
    renderVersion("SUPER_ADMIN", response({ installed_versions: [currentInstalled(), { version: "v0.9.0", current: false, rollback_allowed: false, installed_at: null, rollback_blocked_reason: "当前数据库版本与该版本兼容性未确认，禁止自动回退" }] }));
    await openCenter();
    fireEvent.click(screen.getByRole("button", { name: "版本回退" }));
    expect(screen.getByRole("button", { name: "回退" })).toBeDisabled();
    expect(screen.getByText(/兼容性未确认/)).toBeVisible();
  });

  it("requires confirmation for an allowed rollback", async () => {
    const value = response({ installed_versions: [currentInstalled(), { version: "v0.9.0", current: false, rollback_allowed: true, installed_at: "2026-09-10T00:00:00Z", rollback_blocked_reason: null }] });
    api.rollback.mockResolvedValue(value);
    renderVersion("SUPER_ADMIN", value);
    await openCenter();
    fireEvent.click(screen.getByRole("button", { name: "版本回退" }));
    fireEvent.click(screen.getByRole("button", { name: "回退" }));
    expect(screen.getByText("确定回退到 v0.9.0？")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "确认回退" }));
    await waitFor(() => expect(api.rollback).toHaveBeenCalledWith("csrf-token", "v0.9.0"));
  });
});

async function openCenter() {
  fireEvent.click(screen.getByRole("button", { name: /打开版本中心/ }));
  return screen.findByRole("dialog");
}

function renderVersion(role: "USER" | "ADMIN" | "SUPER_ADMIN", value: ReleaseResponse | undefined = response(), configureMock = true) {
  if (configureMock) api.get.mockResolvedValue(value);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VersionBadge authResponse={auth(role)} />
    </QueryClientProvider>,
  );
}

function auth(role: "USER" | "ADMIN" | "SUPER_ADMIN") {
  return {
    data: {
      account: { id: "00000000-0000-0000-0000-000000000001", username: "tester", role, status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-09-01T00:00:00Z", last_login_at: null },
      accounts: [],
      csrf_token: "csrf-token",
    },
    request_id: "request-1",
  } as AuthResponse;
}

function response(overrides: Partial<ReleaseData> = {}): ReleaseResponse {
  return {
    data: {
      current_version: "v1.0.0",
      current_commit: "abcdef",
      build_time: "2026-09-19T00:00:00Z",
      latest_release: latest("v1.0.0"),
      update_available: false,
      update_enabled: false,
      installed_versions: [currentInstalled()],
      update_status: null,
      check_error: null,
      ...overrides,
    },
    request_id: "request-1",
  };
}

function latest(version: string) {
  return { version, name: `JL团队生意成长管理系统 ${version}`, published_at: "2026-09-19T00:00:00Z", html_url: `https://github.com/QQQHHHDDD/jl-business-growth/releases/tag/${version}` };
}

function currentInstalled() {
  return { version: "v1.0.0", current: true, rollback_allowed: false, installed_at: "2026-09-19T00:00:00Z", rollback_blocked_reason: "当前版本不能回退到自身" };
}

function status(state: "verifying" | "succeeded" | "failed", message: string) {
  return { request_id: "00000000-0000-0000-0000-000000000099", action: "update" as const, from_version: "v1.0.0", target_version: "v1.0.1", state, started_at: "2026-09-19T00:00:00Z", finished_at: state === "verifying" ? null : "2026-09-19T00:01:00Z", safe_message: message };
}
